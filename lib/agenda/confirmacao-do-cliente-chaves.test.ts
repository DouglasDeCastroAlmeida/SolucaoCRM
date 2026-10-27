/**
 * AC-005.1 e AC-005.2: as duas chaves da confirmação do cliente (por tipo e de
 * instalação). Com qualquer uma desligada, "1" e "2" seguem o fluxo normal da
 * conversa e NENHUM dado é apagado nem alterado.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const auditMock = vi.fn(async () => undefined);
vi.mock("@/lib/audit", () => ({ audit: (...a: unknown[]) => (auditMock as (...x: unknown[]) => unknown)(...a) }));

import {
  confirmacaoDoClienteLigadaNaInstalacao,
  tratarRespostaDoCliente,
} from "@/lib/agenda/aplicar-confirmacao-do-cliente";

const AGORA = new Date("2026-10-27T12:00:00.000Z");
const H = 3_600_000;

/** Um PostgREST de mentira que registra toda operação que NÃO seja leitura. */
function admin(compromissos: Array<Record<string, unknown>>) {
  const escritas: string[] = [];
  const client = {
    from(tabela: string) {
      const b: Record<string, unknown> = {};
      for (const m of ["eq", "in", "gt", "is", "not", "order", "limit", "select"]) b[m] = () => b;
      for (const m of ["update", "delete", "insert", "upsert"]) {
        b[m] = () => {
          escritas.push(`${m}:${tabela}`);
          return b;
        };
      }
      b.maybeSingle = async () => ({ data: null, error: null });
      b.then = (ok: (v: unknown) => unknown) => ok({ data: compromissos, error: null });
      return b;
    },
  };
  return { client: client as never, escritas };
}

const linha = (tipoLigado: boolean) => ({
  id: "ap-1",
  title: "Consulta",
  starts_at: new Date(AGORA.getTime() + 24 * H).toISOString(),
  status: "confirmed",
  client_confirmed_at: null,
  client_reschedule_requested_at: null,
  reminder_sent_at: new Date(AGORA.getTime() - H).toISOString(),
  calendar_event_types: { name: "Avaliação", client_confirmation_enabled: tipoLigado },
});

const entrada = (texto: string) => ({
  organizationId: "org-a",
  contactId: "ct-1",
  conversationId: "cv-1",
  messageId: "m-1",
  texto,
  origem: "entrada_de_teste",
});

let enviar: ReturnType<typeof vi.fn>;
beforeEach(() => {
  auditMock.mockClear();
  enviar = vi.fn(async () => undefined);
});

describe.each([["1"], ["2"]])("resposta %s", (texto) => {
  it(`AC-005.1: tipo com a chave desligada: "${texto}" segue o fluxo normal e nada é escrito`, async () => {
    const { client, escritas } = admin([linha(false)]);

    const tratada = await tratarRespostaDoCliente(client, entrada(texto), {
      agora: () => AGORA,
      enviar: enviar as never,
      instalacaoLigada: () => true,
    });

    expect(tratada).toBe(false);
    expect(escritas).toEqual([]);
    expect(enviar).not.toHaveBeenCalled();
    expect(auditMock).not.toHaveBeenCalled();
  });

  it(`AC-005.2: chave de instalação desligada: "${texto}" segue o fluxo normal e nada é escrito`, async () => {
    const { client, escritas } = admin([linha(true)]);

    const tratada = await tratarRespostaDoCliente(client, entrada(texto), {
      agora: () => AGORA,
      enviar: enviar as never,
      instalacaoLigada: () => false,
    });

    expect(tratada).toBe(false);
    expect(escritas).toEqual([]);
    expect(enviar).not.toHaveBeenCalled();
    expect(auditMock).not.toHaveBeenCalled();
  });
});

describe("AC-005.2: a chave de instalação AGENDA_CONFIRMACAO_CLIENTE", () => {
  const original = process.env.AGENDA_CONFIRMACAO_CLIENTE;
  afterEach(() => {
    if (original === undefined) delete process.env.AGENDA_CONFIRMACAO_CLIENTE;
    else process.env.AGENDA_CONFIRMACAO_CLIENTE = original;
  });

  it.each([["desligado"], ["false"], ["0"], ["OFF"], [" no "]])("o valor %j desliga", (v) => {
    process.env.AGENDA_CONFIRMACAO_CLIENTE = v;
    expect(confirmacaoDoClienteLigadaNaInstalacao()).toBe(false);
  });

  it.each([["ligado"], [""], ["qualquer coisa"]])("o valor %j mantém ligada (padrão ligado)", (v) => {
    process.env.AGENDA_CONFIRMACAO_CLIENTE = v;
    expect(confirmacaoDoClienteLigadaNaInstalacao()).toBe(true);
  });

  it("a variável está declarada em lib/env.ts e documentada no .env.example", async () => {
    const { readFileSync } = await import("node:fs");
    expect(readFileSync("lib/env.ts", "utf8")).toContain("AGENDA_CONFIRMACAO_CLIENTE");
    expect(readFileSync(".env.example", "utf8")).toContain("AGENDA_CONFIRMACAO_CLIENTE");
  });
});
