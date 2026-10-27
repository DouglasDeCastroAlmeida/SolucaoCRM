import { beforeEach, describe, expect, it, vi } from "vitest";

const auditMock = vi.fn(async () => undefined);
vi.mock("@/lib/audit", () => ({ audit: (...a: unknown[]) => (auditMock as (...x: unknown[]) => unknown)(...a) }));

import { tratarRespostaDoCliente } from "@/lib/agenda/aplicar-confirmacao-do-cliente";

const ORG = "org-a";
const AGORA = new Date("2026-10-27T12:00:00.000Z");
const H = 3_600_000;

interface Chamada {
  tabela: string;
  op: "select" | "update" | "insert";
  valores?: Record<string, unknown>;
  filtros: Array<[string, ...unknown[]]>;
}

interface Roteiro {
  compromissos: Array<Record<string, unknown>>;
  /** Linhas que o UPDATE condicional do compromisso devolve (vazio = alguém chegou antes). */
  atualizados?: Array<{ id: string }>;
  /** Item da Central já aberto para este compromisso. */
  itemAberto?: { id: string } | null;
  org?: Record<string, unknown> | null;
}

function admin(roteiro: Roteiro) {
  const chamadas: Chamada[] = [];
  const client = {
    from(tabela: string) {
      const c: Chamada = { tabela, op: "select", filtros: [] };
      chamadas.push(c);
      const b: Record<string, unknown> = {};
      for (const m of ["eq", "in", "gt", "is", "not", "order", "limit", "neq"]) {
        b[m] = (...args: unknown[]) => {
          c.filtros.push([m, ...args]);
          return b;
        };
      }
      b.select = () => b;
      b.update = (valores: Record<string, unknown>) => {
        c.op = "update";
        c.valores = valores;
        return b;
      };
      b.insert = (valores: Record<string, unknown>) => {
        c.op = "insert";
        c.valores = valores;
        return b;
      };
      b.maybeSingle = async () => ({
        data:
          tabela === "organizations"
            ? (roteiro.org ?? null)
            : tabela === "agent_inbox_items"
              ? (roteiro.itemAberto ?? null)
              : null,
        error: null,
      });
      b.then = (ok: (v: unknown) => unknown) =>
        ok({
          data:
            tabela === "calendar_appointments" && c.op === "update"
              ? (roteiro.atualizados ?? [{ id: "ap-1" }])
              : tabela === "calendar_appointments"
                ? roteiro.compromissos
                : [],
          error: null,
        });
      return b;
    },
  };
  return { client: client as never, chamadas };
}

function linha(over: Record<string, unknown> = {}) {
  return {
    id: "ap-1",
    title: "Consulta",
    starts_at: new Date(AGORA.getTime() + 24 * H).toISOString(),
    status: "pending",
    client_confirmed_at: null,
    client_reschedule_requested_at: null,
    reminder_sent_at: new Date(AGORA.getTime() - H).toISOString(),
    calendar_event_types: { name: "Avaliação", client_confirmation_enabled: true },
    ...over,
  };
}

const ENTRADA = {
  organizationId: ORG,
  contactId: "ct-1",
  conversationId: "cv-1",
  messageId: "m-1",
  texto: "2",
  origem: "waha_webhook",
};

let enviar: ReturnType<typeof vi.fn>;
const deps = () => ({ agora: () => AGORA, enviar: enviar as never, instalacaoLigada: () => true });
const ORG_ROW = { timezone: "America/Sao_Paulo", locale: "pt-BR", name: "Clínica Sol" };

beforeEach(() => {
  auditMock.mockClear();
  enviar = vi.fn(async () => undefined);
});

describe("AC-003.1: o pedido de remarcar marca, leva à fila humana, avisa a Central e responde", () => {
  it.each(["2", "cancelar", "Não vou", "remarcar"])("AC-003.1: %s marca o campo próprio e trata a mensagem", async (texto) => {
    const { client, chamadas } = admin({ compromissos: [linha()], org: ORG_ROW });
    expect(await tratarRespostaDoCliente(client, { ...ENTRADA, texto }, deps())).toBe(true);

    const up = chamadas.find((c) => c.tabela === "calendar_appointments" && c.op === "update")!;
    expect(Object.keys(up.valores!)).toEqual(["client_reschedule_requested_at"]);
    expect(up.filtros).toContainEqual(["eq", "organization_id", ORG]);
    expect(up.filtros).toContainEqual(["eq", "contact_id", "ct-1"]);
    expect(up.filtros).toContainEqual(["is", "client_reschedule_requested_at", null]);
  });

  it("AC-003.1: leva a conversa à fila humana e silencia o agente nela, com a organização no filtro", async () => {
    const { client, chamadas } = admin({ compromissos: [linha()], org: ORG_ROW });
    await tratarRespostaDoCliente(client, ENTRADA, deps());
    const conv = chamadas.filter((c) => c.tabela === "conversations" && c.op === "update");
    expect(conv.length).toBeGreaterThan(0);
    for (const c of conv) {
      expect(c.filtros).toContainEqual(["eq", "organization_id", ORG]);
      expect(c.filtros).toContainEqual(["eq", "id", "cv-1"]);
    }
    expect(conv.some((c) => c.valores?.bot_silenced_until === "infinity")).toBe(true);
    expect(conv.some((c) => c.valores?.status === "pending")).toBe(true);
  });

  it("AC-003.1: abre o item da Central ligado ao compromisso", async () => {
    const { client, chamadas } = admin({ compromissos: [linha()], org: ORG_ROW });
    await tratarRespostaDoCliente(client, ENTRADA, deps());
    const ins = chamadas.find((c) => c.tabela === "agent_inbox_items" && c.op === "insert")!;
    expect(ins.valores).toMatchObject({
      organization_id: ORG,
      kind: "agenda_cliente_pediu_remarcar",
      ref_kind: "appointment",
      ref_id: "ap-1",
      status: "open",
    });
  });

  it("AC-003.1: responde que a equipe entrará em contato, citando dia e hora", async () => {
    const { client } = admin({ compromissos: [linha()], org: ORG_ROW });
    await tratarRespostaDoCliente(client, ENTRADA, deps());
    expect(enviar).toHaveBeenCalledTimes(1);
    const corpo = (enviar.mock.calls[0]![1] as { corpo: string }).corpo;
    expect(corpo).toContain("Avaliação");
    expect(corpo).toContain("09:00");
    expect(corpo).toMatch(/equipe/i);
  });

  it("AC-003.1: a auditoria leva ids, nunca o texto do cliente", async () => {
    const { client } = admin({ compromissos: [linha()], org: ORG_ROW });
    await tratarRespostaDoCliente(client, { ...ENTRADA, texto: "Não vou" }, deps());
    expect(auditMock).toHaveBeenCalledTimes(1);
    const e = (auditMock.mock.calls[0] as unknown[])[0] as { action: string; metadata: Record<string, unknown> };
    expect(e.action).toBe("agenda.client_requested_reschedule");
    expect(JSON.stringify(e)).not.toMatch(/Não vou/);
    expect(e.metadata).toMatchObject({ appointment_id: "ap-1", contact_id: "ct-1", message_id: "m-1" });
  });

  it("responde em espanhol quando a organização é es", async () => {
    const { client } = admin({ compromissos: [linha()], org: { ...ORG_ROW, locale: "es" } });
    await tratarRespostaDoCliente(client, ENTRADA, deps());
    expect((enviar.mock.calls[0]![1] as { corpo: string }).corpo).toMatch(/equipo/i);
  });
});

describe("AC-003.2: nada é cancelado, remarcado ou liberado sozinho", () => {
  it("AC-003.2: o UPDATE do compromisso grava só o campo próprio (sem status, sem horário)", async () => {
    const { client, chamadas } = admin({ compromissos: [linha()], org: ORG_ROW });
    await tratarRespostaDoCliente(client, ENTRADA, deps());
    const ups = chamadas.filter((c) => c.tabela === "calendar_appointments" && c.op === "update");
    expect(ups).toHaveLength(1);
    expect(Object.keys(ups[0]!.valores!)).toEqual(["client_reschedule_requested_at"]);
  });
});

describe("AC-003.3: repetir não duplica", () => {
  it("AC-003.3: pedido já registrado: trata, mas não grava, não avisa, não responde, não audita", async () => {
    const { client, chamadas } = admin({
      compromissos: [linha({ client_reschedule_requested_at: new Date(AGORA.getTime() - H).toISOString() })],
      org: ORG_ROW,
    });
    expect(await tratarRespostaDoCliente(client, ENTRADA, deps())).toBe(true);
    expect(chamadas.some((c) => c.op !== "select")).toBe(false);
    expect(enviar).not.toHaveBeenCalled();
    expect(auditMock).not.toHaveBeenCalled();
  });

  it("AC-003.3: perdeu a corrida do UPDATE condicional: trata sem aviso nem resposta", async () => {
    const { client, chamadas } = admin({ compromissos: [linha()], org: ORG_ROW, atualizados: [] });
    expect(await tratarRespostaDoCliente(client, ENTRADA, deps())).toBe(true);
    expect(chamadas.some((c) => c.tabela === "agent_inbox_items" || c.tabela === "conversations")).toBe(false);
    expect(enviar).not.toHaveBeenCalled();
    expect(auditMock).not.toHaveBeenCalled();
  });

  it("AC-003.3: já existe item aberto para o compromisso: não abre outro", async () => {
    const { client, chamadas } = admin({ compromissos: [linha()], org: ORG_ROW, itemAberto: { id: "it-1" } });
    await tratarRespostaDoCliente(client, ENTRADA, deps());
    expect(chamadas.some((c) => c.tabela === "agent_inbox_items" && c.op === "insert")).toBe(false);
  });
});

describe("regras que valem também para o pedido de remarcar", () => {
  it("sem lembrete recente o '2' segue o fluxo normal", async () => {
    const { client, chamadas } = admin({ compromissos: [linha({ reminder_sent_at: null })], org: ORG_ROW });
    expect(await tratarRespostaDoCliente(client, ENTRADA, deps())).toBe(false);
    expect(chamadas.some((c) => c.op !== "select")).toBe(false);
  });

  it("chave de instalação desligada: '2' segue o fluxo normal e nem consulta", async () => {
    const { client, chamadas } = admin({ compromissos: [linha()], org: ORG_ROW });
    expect(await tratarRespostaDoCliente(client, ENTRADA, { ...deps(), instalacaoLigada: () => false })).toBe(false);
    expect(chamadas).toHaveLength(0);
  });

  it("falha no envio da resposta não desfaz o pedido, e a mensagem segue tratada", async () => {
    enviar.mockRejectedValueOnce(new Error("canal fora"));
    const { client } = admin({ compromissos: [linha()], org: ORG_ROW });
    expect(await tratarRespostaDoCliente(client, ENTRADA, deps())).toBe(true);
    expect(auditMock).toHaveBeenCalledTimes(1);
  });
});
