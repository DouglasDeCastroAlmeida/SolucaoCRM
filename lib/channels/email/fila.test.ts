import { beforeEach, describe, expect, it, vi } from "vitest";

import { criarBancoFalso, type BancoFalso } from "../../../tests/helpers/banco-falso-do-email";
import type { CaixaDeEmail } from "./caixa";
import { FalhaDeEnvio } from "./envio";
import { registrarEnvioFeito } from "./limite";
import { drenarFilaDaCaixa, type DependenciasDaFila } from "./fila";

const ORG = "org-a";
const CAIXA = "caixa-1";
const AGORA = new Date("2026-11-05T03:00:30.000Z");

const caixa = (extra: Partial<CaixaDeEmail["config"]> = {}): CaixaDeEmail => ({
  id: CAIXA,
  endereco: "atendimento@meunegocio.com",
  status: "WORKING",
  archivedAt: null,
  config: {
    usuario: "atendimento@meunegocio.com",
    imap: { host: "m", porta: 993, seguranca: "ssl" },
    smtp: { host: "m", porta: 465, seguranca: "ssl" },
    senha_ultimos4: "",
    assinatura: null,
    teto_diario: 2,
    intervalo_segundos: 0,
    ...extra,
  },
});

const naFila = (id: string, extra: Record<string, unknown> = {}) => ({
  id,
  organization_id: ORG,
  conversation_id: "conv-1",
  channel_session_id: CAIXA,
  contact_id: "c-1",
  direction: "outbound",
  status: "queued",
  type: "text",
  sent_via: "user",
  body: `texto ${id}`,
  created_at: `2026-11-04T1${id.length}:00:00.000Z`,
  metadata: { queued_reason: "teto_diario", adiar_ate: "2026-11-05T03:00:00.000Z" },
  ...extra,
});

let banco: BancoFalso;
let enviar: ReturnType<typeof vi.fn>;
let deps: DependenciasDaFila;

beforeEach(() => {
  banco = criarBancoFalso({
    organizations: [{ id: ORG, timezone: "America/Sao_Paulo" }],
    contacts: [{ id: "c-1", organization_id: ORG, email: "joao@exemplo.com", is_merged_into: null }],
    messages: [naFila("a"), naFila("bb"), naFila("ccc")],
  });
  let n = 0;
  // O envio real conta o dia (envio.ts); o dublê faz o mesmo para o teto valer na drenagem.
  enviar = vi.fn(async () => {
    await registrarEnvioFeito(banco.client, { organizationId: ORG, caixaId: CAIXA, fuso: "America/Sao_Paulo", agora: AGORA });
    return { externalId: `<enviado-${++n}@meunegocio.com>` };
  });
  deps = { agora: () => AGORA, enviar: enviar as never };
});

const drenar = (c = caixa()) => drenarFilaDaCaixa(banco.client, ORG, c, deps);
const msg = (id: string) => banco.tabelas.messages!.find((m) => m.id === id)!;

describe("drenarFilaDaCaixa: o que ficou para o dia seguinte sai quando o dia vira", () => {
  it("AC-005.3: passada a hora de retomada, a fila sai em ordem até o teto do dia novo", async () => {
    const r = await drenar();
    // Teto 2: duas saem, a terceira espera o dia seguinte.
    expect(r).toMatchObject({ enviadas: 2, falhas: 0 });
    expect(msg("a")).toMatchObject({ status: "sent", external_id: "<enviado-1@meunegocio.com>" });
    expect(msg("bb")).toMatchObject({ status: "sent" });
    expect(msg("ccc")).toMatchObject({ status: "queued" });
    expect(enviar).toHaveBeenCalledTimes(2);
  });

  it("AC-005.1: bateu o teto de novo, avisa a Central uma vez e para", async () => {
    await drenar();
    expect(banco.tabelas.agent_inbox_items).toHaveLength(1);
    expect(banco.tabelas.agent_inbox_items![0]).toMatchObject({ kind: "email_teto_atingido", status: "open" });
  });

  it("AC-005.3: o aviso do dia anterior é fechado quando a fila volta a sair", async () => {
    banco.tabelas.agent_inbox_items = [{ id: "i1", organization_id: ORG, kind: "email_teto_atingido", ref_id: CAIXA, status: "open" }];
    banco.tabelas.messages = [naFila("a")];
    await drenar();
    expect(banco.tabelas.agent_inbox_items![0]).toMatchObject({ status: "resolved" });
  });

  it("antes da hora de retomada nada sai", async () => {
    banco.tabelas.messages = [naFila("a", { metadata: { queued_reason: "teto_diario", adiar_ate: "2026-11-05T03:05:00.000Z" } })];
    const r = await drenar();
    expect(r.enviadas).toBe(0);
    expect(enviar).not.toHaveBeenCalled();
    expect(msg("a").status).toBe("queued");
  });

  it("AC-005.2: dentro do intervalo mínimo sai uma por rodada", async () => {
    banco.tabelas.messages = [naFila("a"), naFila("bb")];
    const r = await drenar(caixa({ teto_diario: 200, intervalo_segundos: 30 }));
    expect(r.enviadas).toBe(1);
    expect(msg("bb").status).toBe("queued");
    expect(banco.tabelas.agent_inbox_items ?? []).toHaveLength(0);
  });

  it("a mensagem enviada leva o endereço do contato, a conversa e a caixa da organização", async () => {
    banco.tabelas.messages = [naFila("a")];
    await drenar();
    expect(enviar.mock.calls[0]![1]).toMatchObject({
      organizationId: ORG,
      sessionRef: "atendimento@meunegocio.com",
      para: "joao@exemplo.com",
      conversationId: "conv-1",
      corpo: "texto a",
    });
  });
});

describe("drenarFilaDaCaixa: o que NÃO é da fila do e-mail", () => {
  it("mensagem de IA, de automação, de outra caixa ou de outra organização fica onde está", async () => {
    banco.tabelas.messages = [
      naFila("a", { sent_via: "ai" }),
      naFila("bb", { sent_via: "automation" }),
      naFila("ccc", { channel_session_id: "outra" }),
      naFila("dddd", { organization_id: "org-b" }),
      naFila("eeeee", { direction: "inbound" }),
    ];
    const r = await drenar();
    expect(r.enviadas).toBe(0);
    expect(enviar).not.toHaveBeenCalled();
  });

  it("mensagem parada por canal desligado sai quando o canal volta", async () => {
    banco.tabelas.messages = [naFila("a", { metadata: { queued_reason: "email_not_configured" } })];
    const r = await drenar();
    expect(r.enviadas).toBe(1);
  });

  it("mensagem parada por outro motivo (ex.: sessão fora do ar) não é tocada", async () => {
    banco.tabelas.messages = [naFila("a", { metadata: { queued_reason: "channel_session_not_working" } })];
    const r = await drenar();
    expect(r.enviadas).toBe(0);
  });
});

describe("drenarFilaDaCaixa: falha e concorrência", () => {
  it("AC-006.5: falha vira `failed` com a causa, as outras seguem e o contador só conta o que saiu", async () => {
    banco.tabelas.messages = [naFila("a"), naFila("bb")];
    enviar.mockRejectedValueOnce(new FalhaDeEnvio("envio_recusado"));
    const r = await drenar(caixa({ teto_diario: 200 }));
    expect(r).toMatchObject({ enviadas: 1, falhas: 1 });
    expect(msg("a")).toMatchObject({ status: "failed", error_code: "email_error" });
    expect(String(msg("a").error_message)).toMatch(/recusou/);
    expect(msg("bb").status).toBe("sent");
  });

  it("erro inesperado não vaza detalhe na linha da mensagem", async () => {
    banco.tabelas.messages = [naFila("a")];
    enviar.mockRejectedValueOnce(new Error("connect ECONNREFUSED 10.0.0.5 senha=segredo"));
    await drenar();
    expect(msg("a").status).toBe("failed");
    expect(String(msg("a").error_message)).not.toContain("segredo");
    expect(String(msg("a").error_message)).not.toContain("10.0.0.5");
  });

  it("caixa pausada: a fila espera e nada é reivindicado", async () => {
    enviar.mockRejectedValue(new FalhaDeEnvio("caixa_pausada"));
    banco.tabelas.messages = [naFila("a")];
    const r = await drenar();
    expect(r.enviadas).toBe(0);
    expect(msg("a").status).toBe("queued");
  });

  it("duas rodadas ao mesmo tempo não enviam a mesma mensagem duas vezes", async () => {
    banco.tabelas.messages = [naFila("a")];
    const [r1, r2] = await Promise.all([drenar(caixa({ teto_diario: 200 })), drenar(caixa({ teto_diario: 200 }))]);
    expect(r1.enviadas + r2.enviadas).toBe(1);
    expect(enviar).toHaveBeenCalledTimes(1);
  });

  it("contato sem e-mail: falha com a causa, sem tentar", async () => {
    banco.tabelas.contacts = [{ id: "c-1", organization_id: ORG, email: null, is_merged_into: null }];
    banco.tabelas.messages = [naFila("a")];
    const r = await drenar();
    expect(r.falhas).toBe(1);
    expect(enviar).not.toHaveBeenCalled();
    expect(msg("a")).toMatchObject({ status: "failed" });
  });
});
