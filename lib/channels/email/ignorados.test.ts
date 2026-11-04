import { describe, expect, it, vi } from "vitest";

import { criarBancoFalso } from "../../../tests/helpers/banco-falso-do-email";
import { listarIgnorados, marcarNaoCliente, podarIgnorados, promoverIgnorado } from "./ignorados";
import type { LeitorDeCaixa } from "./leitura-imap";

const ORG = "org-a";
const OUTRA = "org-b";

const caixaLinha = (id = "caixa-1") => ({
  id,
  organization_id: ORG,
  provider: "email",
  email_address: "caixa@meunegocio.com",
  email_config: {
    usuario: "caixa@meunegocio.com",
    imap: { host: "imap.x.com", porta: 993, seguranca: "ssl" },
    smtp: { host: "smtp.x.com", porta: 465, seguranca: "ssl" },
    senha_ultimos4: "1234",
  },
  status: "WORKING",
  archived_at: null,
});

const ignorado = (extra: Record<string, unknown> = {}) => ({
  id: "ign-1",
  organization_id: ORG,
  channel_session_id: "caixa-1",
  message_id: "<promo@loja.com>",
  uid: 42,
  remetente: "ofertas@loja.com",
  assunto: "Promoção",
  recebido_em: "2026-11-03T10:00:00.000Z",
  motivo: "envio_em_massa",
  created_at: "2026-11-03T10:00:01.000Z",
  ...extra,
});

const mimeDaLoja = Buffer.from(
  ["From: Loja <ofertas@loja.com>", "Subject: Promoção", "Message-ID: <promo@loja.com>", "Precedence: bulk", "", "Tudo em oferta", ""].join("\r\n"),
);

const leitorQue = (cru: Buffer | null) => {
  const leitor: LeitorDeCaixa = {
    uidValidity: "10",
    uidNext: 100,
    listarDesde: async () => [],
    baixar: vi.fn(async () => cru),
    fechar: vi.fn(async () => undefined),
  };
  return leitor;
};

describe("listarIgnorados", () => {
  it("AC-003.3: mostra remetente, assunto, data e motivo, so da organizacao", async () => {
    const banco = criarBancoFalso({
      email_ignorados: [ignorado(), ignorado({ id: "ign-2", organization_id: OUTRA, remetente: "outro@x.com" })],
    });
    const lista = await listarIgnorados(banco.client, ORG, {});
    expect(lista).toEqual([
      {
        id: "ign-1",
        caixa_id: "caixa-1",
        remetente: "ofertas@loja.com",
        assunto: "Promoção",
        recebido_em: "2026-11-03T10:00:00.000Z",
        motivo: "envio_em_massa",
      },
    ]);
  });
});

describe("promoverIgnorado", () => {
  it("AC-003.3: relê o e-mail pelo UID, vira conversa e sai da lista", async () => {
    const banco = criarBancoFalso({ email_ignorados: [ignorado()], channel_sessions: [caixaLinha()] });
    const leitor = leitorQue(mimeDaLoja);
    const efeitos = vi.fn().mockResolvedValue(undefined);
    const r = await promoverIgnorado(banco.client, ORG, "ign-1", {
      abrirLeitor: async () => leitor,
      lerSenha: async () => "senha",
      ingestao: { aplicarEfeitos: efeitos as never },
    });
    expect(r.resultado).toBe("promovido");
    expect(leitor.baixar).toHaveBeenCalledWith(42);
    expect(banco.tabelas.messages).toHaveLength(1);
    expect(banco.tabelas.messages![0]).toMatchObject({ external_id: "<promo@loja.com>" });
    expect(banco.tabelas.email_ignorados).toHaveLength(0);
    expect(leitor.fechar).toHaveBeenCalled();
  });

  it("AC-003.3: o UID agora aponta para outro e-mail (UIDVALIDITY mudou): nao promove o errado", async () => {
    const banco = criarBancoFalso({ email_ignorados: [ignorado({ message_id: "<outro@loja.com>" })], channel_sessions: [caixaLinha()] });
    const r = await promoverIgnorado(banco.client, ORG, "ign-1", {
      abrirLeitor: async () => leitorQue(mimeDaLoja),
      lerSenha: async () => "senha",
    });
    expect(r.resultado).toBe("indisponivel");
    expect(banco.tabelas.messages ?? []).toHaveLength(0);
    expect(banco.tabelas.email_ignorados).toHaveLength(1);
  });

  it("AC-003.3: ignorado de outra organizacao e nao encontrado", async () => {
    const banco = criarBancoFalso({ email_ignorados: [ignorado({ organization_id: OUTRA })], channel_sessions: [caixaLinha()] });
    const r = await promoverIgnorado(banco.client, ORG, "ign-1", { abrirLeitor: async () => leitorQue(mimeDaLoja), lerSenha: async () => "senha" });
    expect(r.resultado).toBe("nao_encontrado");
  });

  it("AC-003.4: promover um 'nao e cliente' tambem libera o remetente", async () => {
    const banco = criarBancoFalso({
      email_ignorados: [ignorado({ motivo: "nao_e_cliente" })],
      channel_sessions: [caixaLinha()],
      email_remetentes_ignorados: [{ organization_id: ORG, endereco_normalizado: "ofertas@loja.com" }],
    });
    const r = await promoverIgnorado(banco.client, ORG, "ign-1", {
      abrirLeitor: async () => leitorQue(mimeDaLoja),
      lerSenha: async () => "senha",
      ingestao: { aplicarEfeitos: (async () => undefined) as never },
    });
    expect(r.resultado).toBe("promovido");
    expect(banco.tabelas.email_remetentes_ignorados).toHaveLength(0);
  });
});

describe("marcarNaoCliente", () => {
  const cenario = () =>
    criarBancoFalso({
      contacts: [{ id: "c-1", organization_id: ORG, email: "joao@exemplo.com", is_merged_into: null }],
      conversations: [
        { id: "v-1", organization_id: ORG, contact_id: "c-1", channel_session_id: "caixa-1", channel: "email", status: "open" },
        { id: "v-2", organization_id: ORG, contact_id: "c-1", channel_session_id: "wa-1", channel: "whatsapp", status: "open" },
      ],
    });

  it("AC-003.4: ignora os proximos e-mails do remetente e tira a conversa de e-mail da lista", async () => {
    const banco = cenario();
    const r = await marcarNaoCliente(banco.client, { organizationId: ORG, userId: "u-1", conversationId: "v-1" });
    expect(r).toEqual({ resultado: "marcado", endereco: "joao@exemplo.com", conversasArquivadas: 1 });
    expect(banco.tabelas.email_remetentes_ignorados![0]).toMatchObject({
      organization_id: ORG,
      endereco_normalizado: "joao@exemplo.com",
      created_by: "u-1",
    });
    expect(banco.tabelas.conversations!.find((c) => c.id === "v-1")!.status).toBe("archived");
  });

  it("AC-003.4: a conversa de WhatsApp do mesmo contato nao e tocada", async () => {
    const banco = cenario();
    await marcarNaoCliente(banco.client, { organizationId: ORG, userId: "u-1", conversationId: "v-1" });
    expect(banco.tabelas.conversations!.find((c) => c.id === "v-2")!.status).toBe("open");
  });

  it("AC-003.4: conversa que nao e de e-mail, ou de outra organizacao, nao e marcada", async () => {
    const banco = cenario();
    expect(await marcarNaoCliente(banco.client, { organizationId: ORG, userId: "u-1", conversationId: "v-2" })).toEqual({ resultado: "nao_encontrada" });
    expect(await marcarNaoCliente(banco.client, { organizationId: OUTRA, userId: "u-1", conversationId: "v-1" })).toEqual({ resultado: "nao_encontrada" });
    expect(banco.tabelas.email_remetentes_ignorados ?? []).toHaveLength(0);
  });

  it("AC-003.4: marcar duas vezes e inofensivo", async () => {
    const banco = cenario();
    await marcarNaoCliente(banco.client, { organizationId: ORG, userId: "u-1", conversationId: "v-1" });
    const r = await marcarNaoCliente(banco.client, { organizationId: ORG, userId: "u-1", conversationId: "v-1" });
    expect(r.resultado).toBe("marcado");
    expect(banco.tabelas.email_remetentes_ignorados).toHaveLength(1);
  });

  it("AC-003.4: por endereco, sem conversa, tambem ignora os proximos", async () => {
    const banco = criarBancoFalso();
    const r = await marcarNaoCliente(banco.client, { organizationId: ORG, userId: "u-1", endereco: " Spam@Loja.com " });
    expect(r).toEqual({ resultado: "marcado", endereco: "spam@loja.com", conversasArquivadas: 0 });
  });
});

describe("podarIgnorados", () => {
  it("AC-003.3: apaga so os ignorados mais velhos que o prazo de retencao", async () => {
    const agora = new Date("2026-11-04T00:00:00.000Z");
    const banco = criarBancoFalso({
      email_ignorados: [
        ignorado({ id: "velho", created_at: "2026-09-01T00:00:00.000Z" }),
        ignorado({ id: "novo", message_id: "<n@x>", created_at: "2026-10-25T00:00:00.000Z" }),
      ],
    });
    const n = await podarIgnorados(banco.client, agora, 30);
    expect(n).toBe(1);
    expect(banco.tabelas.email_ignorados!.map((i) => i.id)).toEqual(["novo"]);
  });
});
