/**
 * AC-005.4 e AC-005.5: a confirmação do cliente e o pedido de remarcar são
 * auditados SEM o texto que o cliente escreveu, e as rotas que a mudança 007
 * criou ou alterou validam com Zod, auditam e declaram `requireSupportWrite(`
 * ANTES do primeiro efeito.
 */
import { readFileSync } from "node:fs";
import { beforeEach, describe, expect, it, vi } from "vitest";

const auditMock = vi.fn(async () => undefined);
vi.mock("@/lib/audit", () => ({ audit: (...a: unknown[]) => (auditMock as (...x: unknown[]) => unknown)(...a) }));

import { tratarRespostaDoCliente } from "@/lib/agenda/aplicar-confirmacao-do-cliente";
import { AUDIT_ACTIONS } from "@/lib/audit/actions";

const AGORA = new Date("2026-10-27T12:00:00.000Z");
const H = 3_600_000;

function admin(compromissos: Array<Record<string, unknown>>) {
  const client = {
    from(tabela: string) {
      const b: Record<string, unknown> = {};
      for (const m of ["eq", "in", "gt", "is", "not", "order", "limit", "select", "update", "insert"]) b[m] = () => b;
      b.maybeSingle = async () => ({
        data: tabela === "organizations" ? { timezone: "America/Sao_Paulo", locale: "pt-BR" } : null,
        error: null,
      });
      b.then = (ok: (v: unknown) => unknown) =>
        ok({ data: tabela === "calendar_appointments" ? compromissos : [{ id: "ap-1" }], error: null });
      return b;
    },
  };
  return client as never;
}

const linha = () => ({
  id: "ap-1",
  title: "Consulta",
  starts_at: new Date(AGORA.getTime() + 24 * H).toISOString(),
  status: "confirmed",
  client_confirmed_at: null,
  client_reschedule_requested_at: null,
  reminder_sent_at: new Date(AGORA.getTime() - H).toISOString(),
  calendar_event_types: { name: "Avaliação", client_confirmation_enabled: true },
});

const entrada = (texto: string) => ({
  organizationId: "org-a",
  contactId: "ct-1",
  conversationId: "cv-1",
  messageId: "m-1",
  texto,
  origem: "waha_webhook",
});

const deps = { agora: () => AGORA, enviar: vi.fn(async () => undefined) as never, instalacaoLigada: () => true };

beforeEach(() => auditMock.mockClear());

describe("AC-005.4: auditoria sem o texto do cliente", () => {
  it.each([
    ["Sim!!", "agenda.client_confirmed"],
    ["NÃO VOU", "agenda.client_requested_reschedule"],
  ])("a carga da resposta %j não carrega o texto escrito pelo cliente", async (texto, acao) => {
    const tratada = await tratarRespostaDoCliente(admin([linha()]), entrada(texto), deps);

    expect(tratada).toBe(true);
    const cargas = (auditMock.mock.calls as unknown as Array<[{ action: string; metadata: Record<string, unknown> }]>).map((c) => c[0]);
    const dessa = cargas.find((c) => c.action === acao);
    expect(dessa).toBeDefined();
    const json = JSON.stringify(dessa).toLowerCase();
    expect(json).not.toContain(texto.toLowerCase());
    expect(Object.keys(dessa!.metadata)).not.toContain("texto");
    expect(Object.keys(dessa!.metadata)).not.toContain("body");
  });

  it.each([
    ["1", "agenda.client_confirmed"],
    ["2", "agenda.client_requested_reschedule"],
  ])("a resposta %s gera exatamente uma auditoria %s com ids e classificação", async (texto, acao) => {
    const tratada = await tratarRespostaDoCliente(admin([linha()]), entrada(texto), deps);

    expect(tratada).toBe(true);
    expect(auditMock).toHaveBeenCalledTimes(1);
    const c = (auditMock.mock.calls as unknown as Array<[{ action: string; organizationId: string; metadata: Record<string, unknown> }]>)[0]![0];
    expect(c.action).toBe(acao);
    expect(c.organizationId).toBe("org-a");
    expect(c.metadata).toMatchObject({ appointment_id: "ap-1", contact_id: "ct-1", message_id: "m-1" });
    expect(Object.keys(c.metadata).sort()).toEqual(
      ["appointment_id", "classificacao", "contact_id", "conversation_id", "message_id", "origem"].sort(),
    );
  });

  it("AC-005.4: as duas ações estão registradas no catálogo de ações de auditoria", () => {
    expect(AUDIT_ACTIONS).toContain("agenda.client_confirmed");
    expect(AUDIT_ACTIONS).toContain("agenda.client_requested_reschedule");
    expect(AUDIT_ACTIONS).toContain("agenda.tipo_lembretes_padrao_ativados");
  });
});

/** O corpo de cada função exportada do arquivo, pelo nome. */
function handlers(arquivo: string): Record<string, string> {
  const src = readFileSync(arquivo, "utf8");
  const partes = src.split(/^export async function /m).slice(1);
  return Object.fromEntries(partes.map((p) => [p.slice(0, p.indexOf("(")), p]));
}

const EFEITO = /\.(insert|update|delete|upsert)\(|\baudit\(|safeParse\(/;

describe("AC-005.5: rotas novas e alteradas da mudança 007", () => {
  const rotas: Array<[string, string[]]> = [
    ["app/api/v1/agenda/tipos/route.ts", ["POST", "PATCH", "DELETE"]],
    ["app/api/v1/agenda/tipos/lembretes-padrao/route.ts", ["POST"]],
  ];

  describe.each(rotas)("%s", (arquivo, metodos) => {
    const h = handlers(arquivo);

    it.each(metodos)("%s declara requireSupportWrite( antes de qualquer efeito, valida com Zod e audita", (metodo) => {
      const corpo = h[metodo]!;
      expect(corpo, `${metodo} não existe em ${arquivo}`).toBeDefined();

      const guarda = corpo.indexOf("requireSupportWrite(");
      const efeito = corpo.search(EFEITO);
      expect(guarda).toBeGreaterThanOrEqual(0);
      expect(guarda).toBeLessThan(efeito);
      expect(corpo).toContain("safeParse(");
      expect(corpo).toContain("await audit(");
    });

    it("filtra organization_id da sessão e nunca do corpo", () => {
      const src = readFileSync(arquivo, "utf8");
      expect(src).not.toMatch(/lido\.data\.organization_id/);
      expect(src).toContain(".eq(\"organization_id\"");
    });
  });
});
