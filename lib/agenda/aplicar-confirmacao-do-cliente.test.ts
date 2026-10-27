import { beforeEach, describe, expect, it, vi } from "vitest";

const auditMock = vi.fn(async () => undefined);
vi.mock("@/lib/audit", () => ({ audit: (...a: unknown[]) => (auditMock as (...x: unknown[]) => unknown)(...a) }));

import { tratarRespostaDoCliente } from "@/lib/agenda/aplicar-confirmacao-do-cliente";

const ORG = "org-a";
const AGORA = new Date("2026-10-27T12:00:00.000Z");
const H = 3_600_000;

interface Chamada {
  tabela: string;
  op: "select" | "update";
  valores?: Record<string, unknown>;
  filtros: Array<[string, ...unknown[]]>;
}

interface Roteiro {
  compromissos: Array<Record<string, unknown>>;
  /** Linhas que o UPDATE condicional devolve (vazio = alguém chegou antes). */
  atualizados?: Array<{ id: string }>;
  org?: Record<string, unknown> | null;
}

/** Um PostgREST de mentira: registra cada consulta e devolve o roteiro. */
function admin(roteiro: Roteiro) {
  const chamadas: Chamada[] = [];
  const client = {
    from(tabela: string) {
      const c: Chamada = { tabela, op: "select", filtros: [] };
      chamadas.push(c);
      const b: Record<string, unknown> = {};
      for (const m of ["eq", "in", "gt", "is", "not", "order", "limit"]) {
        b[m] = (...args: unknown[]) => {
          c.filtros.push([m, ...args]);
          return b;
        };
      }
      b.select = (..._args: unknown[]) => b;
      b.update = (valores: Record<string, unknown>) => {
        c.op = "update";
        c.valores = valores;
        return b;
      };
      b.maybeSingle = async () => ({ data: tabela === "organizations" ? (roteiro.org ?? null) : null, error: null });
      b.then = (ok: (v: unknown) => unknown) =>
        ok({
          data: c.op === "update" ? (roteiro.atualizados ?? [{ id: "ap-1" }]) : roteiro.compromissos,
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
  texto: "1",
  origem: "waha_webhook",
};

let enviar: ReturnType<typeof vi.fn>;
const deps = () => ({ agora: () => AGORA, enviar: enviar as never, instalacaoLigada: () => true });
const ORG_ROW = { timezone: "America/Sao_Paulo", locale: "pt-BR", name: "Clínica Sol" };

beforeEach(() => {
  auditMock.mockClear();
  enviar = vi.fn(async () => undefined);
});

describe("AC-002.1 e AC-002.7: grava o campo próprio e agradece", () => {
  it("AC-002.1: 1 com lembrete recente grava client_confirmed_at, agradece com data e hora e trata a mensagem", async () => {
    const { client, chamadas } = admin({ compromissos: [linha()], org: ORG_ROW });
    const tratada = await tratarRespostaDoCliente(client, ENTRADA, deps());

    expect(tratada).toBe(true);
    const up = chamadas.find((c) => c.op === "update")!;
    expect(up.tabela).toBe("calendar_appointments");
    // AC-002.7: SÓ o campo próprio — nada de status nem service_confirmed_at.
    expect(Object.keys(up.valores!)).toEqual(["client_confirmed_at"]);
    expect(up.filtros).toContainEqual(["eq", "organization_id", ORG]);
    expect(up.filtros).toContainEqual(["is", "client_confirmed_at", null]);

    expect(enviar).toHaveBeenCalledTimes(1);
    const corpo = (enviar.mock.calls[0]![1] as { corpo: string }).corpo;
    expect(corpo).toContain("Avaliação");
    expect(corpo).toContain("09:00"); // 12:00Z em São Paulo
    expect(corpo).toMatch(/28\/10|quarta/i);
  });

  it("AC-002.7: a auditoria leva ids e classificação, nunca o texto do cliente", async () => {
    const { client } = admin({ compromissos: [linha()], org: ORG_ROW });
    await tratarRespostaDoCliente(client, { ...ENTRADA, texto: "Sim!!" }, deps());
    expect(auditMock).toHaveBeenCalledTimes(1);
    const entrada = (auditMock.mock.calls[0] as unknown[])[0] as {
      action: string;
      organizationId: string;
      metadata: Record<string, unknown>;
    };
    expect(entrada.action).toBe("agenda.client_confirmed");
    expect(entrada.organizationId).toBe(ORG);
    expect(JSON.stringify(entrada)).not.toMatch(/Sim!!/);
    expect(entrada.metadata).toMatchObject({ appointment_id: "ap-1", contact_id: "ct-1", message_id: "m-1" });
  });

  it("AC-002.1: a consulta filtra organização e contato da entrada, e só compromissos futuros com lembrete", async () => {
    const { client, chamadas } = admin({ compromissos: [linha()], org: ORG_ROW });
    await tratarRespostaDoCliente(client, ENTRADA, deps());
    const sel = chamadas.find((c) => c.tabela === "calendar_appointments" && c.op === "select")!;
    expect(sel.filtros).toContainEqual(["eq", "organization_id", ORG]);
    expect(sel.filtros).toContainEqual(["eq", "contact_id", "ct-1"]);
    expect(sel.filtros.some((f) => f[0] === "gt" && f[1] === "starts_at")).toBe(true);
    expect(sel.filtros).toContainEqual(["eq", "calendar_event_types.client_confirmation_enabled", true]);
  });
});

describe("AC-002.4, AC-002.5 e AC-005.1: quando NÃO trata", () => {
  it("AC-002.4: sem lembrete recente a mensagem segue o fluxo normal (não trata, não grava, não responde)", async () => {
    const { client, chamadas } = admin({ compromissos: [linha({ reminder_sent_at: null })], org: ORG_ROW });
    expect(await tratarRespostaDoCliente(client, ENTRADA, deps())).toBe(false);
    expect(chamadas.some((c) => c.op === "update")).toBe(false);
    expect(enviar).not.toHaveBeenCalled();
  });

  it("AC-002.4: texto comum nem consulta o banco", async () => {
    const { client, chamadas } = admin({ compromissos: [linha()] });
    expect(await tratarRespostaDoCliente(client, { ...ENTRADA, texto: "bom dia, tudo bem?" }, deps())).toBe(false);
    expect(chamadas).toHaveLength(0);
  });

  it("AC-002.5: já confirmado: trata (o agente não responde), mas não grava, não responde e não audita", async () => {
    const { client, chamadas } = admin({
      compromissos: [linha({ client_confirmed_at: new Date(AGORA.getTime() - H).toISOString() })],
      org: ORG_ROW,
    });
    expect(await tratarRespostaDoCliente(client, ENTRADA, deps())).toBe(true);
    expect(chamadas.some((c) => c.op === "update")).toBe(false);
    expect(enviar).not.toHaveBeenCalled();
    expect(auditMock).not.toHaveBeenCalled();
  });

  it("AC-002.5: duas entregas da mesma mensagem: o UPDATE condicional perde a corrida e só uma responde", async () => {
    const { client } = admin({ compromissos: [linha()], org: ORG_ROW, atualizados: [] });
    expect(await tratarRespostaDoCliente(client, ENTRADA, deps())).toBe(true);
    expect(enviar).not.toHaveBeenCalled();
    expect(auditMock).not.toHaveBeenCalled();
  });

  it("AC-002.5: reentrega sem id de mensagem (a linha não nasceu agora) não faz nada", async () => {
    const { client, chamadas } = admin({ compromissos: [linha()], org: ORG_ROW });
    expect(await tratarRespostaDoCliente(client, { ...ENTRADA, messageId: null }, deps())).toBe(false);
    expect(chamadas).toHaveLength(0);
  });

  it("AC-005.1: tipo com a confirmação desligada nem chega à regra (o banco já filtra; a linha desligada que vier é ignorada)", async () => {
    const { client } = admin({
      compromissos: [linha({ calendar_event_types: { name: "Avaliação", client_confirmation_enabled: false } })],
      org: ORG_ROW,
    });
    expect(await tratarRespostaDoCliente(client, ENTRADA, deps())).toBe(false);
    expect(enviar).not.toHaveBeenCalled();
  });

  it("AC-005.2: chave de instalação desligada: nada é confirmado nem marcado, nem consulta", async () => {
    const { client, chamadas } = admin({ compromissos: [linha()], org: ORG_ROW });
    const tratada = await tratarRespostaDoCliente(client, ENTRADA, { ...deps(), instalacaoLigada: () => false });
    expect(tratada).toBe(false);
    expect(chamadas).toHaveLength(0);
  });

  it("AC-003.1: '2' ainda não tem efeito aqui (a ligação é da Fatia 4): segue o fluxo normal", async () => {
    const { client, chamadas } = admin({ compromissos: [linha()], org: ORG_ROW });
    expect(await tratarRespostaDoCliente(client, { ...ENTRADA, texto: "2" }, deps())).toBe(false);
    expect(chamadas.some((c) => c.op === "update")).toBe(false);
  });
});

describe("AC-002.6: dois compromissos", () => {
  it("AC-002.6: confirma e cita o mais próximo", async () => {
    const longe = linha({
      id: "ap-longe",
      starts_at: new Date(AGORA.getTime() + 72 * H).toISOString(),
      calendar_event_types: { name: "Retorno", client_confirmation_enabled: true },
    });
    const perto = linha({ id: "ap-perto" });
    const { client, chamadas } = admin({ compromissos: [longe, perto], org: ORG_ROW, atualizados: [{ id: "ap-perto" }] });
    await tratarRespostaDoCliente(client, ENTRADA, deps());
    const up = chamadas.find((c) => c.op === "update")!;
    expect(up.filtros).toContainEqual(["eq", "id", "ap-perto"]);
    expect((enviar.mock.calls[0]![1] as { corpo: string }).corpo).toContain("Avaliação");
  });
});

describe("AC-002.9 e AC-002.8: não depende do agente", () => {
  it("AC-002.9: a função não consulta nem exige configuração do agente de IA", async () => {
    const { client, chamadas } = admin({ compromissos: [linha()], org: ORG_ROW });
    await tratarRespostaDoCliente(client, ENTRADA, deps());
    expect(chamadas.map((c) => c.tabela).sort()).toEqual(["calendar_appointments", "calendar_appointments", "organizations"]);
  });

  it("AC-002.8: devolve true para a mensagem tratada, e é isso que impede o despacho do agente", async () => {
    const { client } = admin({ compromissos: [linha()], org: ORG_ROW });
    expect(await tratarRespostaDoCliente(client, ENTRADA, deps())).toBe(true);
  });
});

describe("idioma da organização", () => {
  it("responde em espanhol quando a organização é es", async () => {
    const { client } = admin({ compromissos: [linha()], org: { ...ORG_ROW, locale: "es" } });
    await tratarRespostaDoCliente(client, ENTRADA, deps());
    expect((enviar.mock.calls[0]![1] as { corpo: string }).corpo).toMatch(/Gracias|confirmad/i);
  });

  it("responde em inglês quando a organização é en", async () => {
    const { client } = admin({ compromissos: [linha()], org: { ...ORG_ROW, locale: "en" } });
    await tratarRespostaDoCliente(client, ENTRADA, deps());
    expect((enviar.mock.calls[0]![1] as { corpo: string }).corpo).toMatch(/Thank you/);
  });
});

describe("falha segura", () => {
  it("um erro de banco nunca sobe: a ingestão não pode virar 500", async () => {
    const quebrado = {
      from() {
        throw new Error("boom");
      },
    } as never;
    expect(await tratarRespostaDoCliente(quebrado, ENTRADA, deps())).toBe(false);
  });

  it("falha no envio da resposta não desfaz a confirmação, e a mensagem segue tratada", async () => {
    enviar.mockRejectedValueOnce(new Error("canal fora"));
    const { client, chamadas } = admin({ compromissos: [linha()], org: ORG_ROW });
    expect(await tratarRespostaDoCliente(client, ENTRADA, deps())).toBe(true);
    expect(chamadas.some((c) => c.op === "update")).toBe(true);
  });
});
