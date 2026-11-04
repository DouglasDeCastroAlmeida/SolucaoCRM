import { beforeEach, describe, expect, it, vi } from "vitest";

import { criarBancoFalso, type BancoFalso } from "../../../tests/helpers/banco-falso-do-email";
import type { EmailLido } from "./parse";
import { ingerirEmail, type DependenciasDaIngestao } from "./ingest";

const ORG = "org-a";
const OUTRA_ORG = "org-b";
const CAIXA = { id: "caixa-1", endereco: "caixa@meunegocio.com" };

function email(extra: Partial<EmailLido> = {}): EmailLido {
  return {
    messageId: "<m1@exemplo.com>",
    inReplyTo: null,
    references: [],
    assunto: "Orçamento",
    remetente: { endereco: "joao@exemplo.com", nome: "João Silva" },
    data: new Date("2026-11-03T10:00:00.000Z"),
    texto: "Quanto custa o site?",
    html: null,
    cabecalhos: {},
    anexos: [],
    anexosOmitidos: [],
    ...extra,
  };
}

let banco: BancoFalso;
let efeitos: ReturnType<typeof vi.fn>;
let guardarAnexo: ReturnType<typeof vi.fn>;
let deps: DependenciasDaIngestao;

beforeEach(() => {
  banco = criarBancoFalso();
  efeitos = vi.fn().mockResolvedValue(undefined);
  guardarAnexo = vi.fn().mockImplementation(async (a: { messageId: string; indice: number }) => `${a.messageId}/${a.indice}`);
  deps = { aplicarEfeitos: efeitos as never, guardarAnexo: guardarAnexo as never };
});

const ingerir = (e: EmailLido, uid = 1, org = ORG) =>
  ingerirEmail(banco.client, { organizationId: org, caixa: CAIXA, uid, email: e }, deps);

describe("ingerirEmail: o que chega vira conversa", () => {
  it("AC-002.1: o e-mail aparece como mensagem de entrada com assunto, texto e anexos", async () => {
    const r = await ingerir(
      email({ anexos: [{ nome: "a.pdf", tipo: "application/pdf", tamanho: 3, conteudo: Buffer.from("abc") }] }),
    );
    expect(r.resultado).toBe("ingerido");
    const [m] = banco.tabelas.messages!;
    expect(m).toMatchObject({
      organization_id: ORG,
      direction: "inbound",
      external_id: "<m1@exemplo.com>",
      channel_session_id: "caixa-1",
      body: "Quanto custa o site?",
    });
    const meta = m!.metadata as { email: { assunto: string; anexos: Array<{ nome: string; caminho: string | null }> } };
    expect(meta.email.assunto).toBe("Orçamento");
    expect(meta.email.anexos).toEqual([expect.objectContaining({ nome: "a.pdf", caminho: expect.any(String) })]);
    expect(guardarAnexo).toHaveBeenCalledTimes(1);
  });

  it("AC-002.1: carimba a conversa e dispara os efeitos pos-entrada uma vez", async () => {
    await ingerir(email());
    expect(banco.chamadasRpc.filter((c) => c.nome === "fn_mark_conversation_message")).toHaveLength(1);
    expect(efeitos).toHaveBeenCalledTimes(1);
    expect(efeitos.mock.calls[0]![1]).toMatchObject({ organizationId: ORG, canal: "email", origem: "email_imap", texto: "Quanto custa o site?" });
  });

  it("AC-002.2: remetente novo cria contato com o nome do cabecalho e o endereco", async () => {
    await ingerir(email());
    expect(banco.tabelas.contacts).toHaveLength(1);
    expect(banco.tabelas.contacts![0]).toMatchObject({
      organization_id: ORG,
      email: "joao@exemplo.com",
      name: "João Silva",
      source: "email",
    });
  });

  it("AC-002.3: remetente que ja e contato reaproveita o cadastro, sem duplicar", async () => {
    banco = criarBancoFalso({ contacts: [{ id: "c-1", organization_id: ORG, email: "Joao@Exemplo.com", name: "Joao", is_merged_into: null }] });
    await ingerir(email());
    expect(banco.tabelas.contacts).toHaveLength(1);
    expect(banco.tabelas.messages![0]).toMatchObject({ contact_id: "c-1" });
  });

  it("AC-002.3: contato de outra organizacao com o mesmo e-mail nao e reaproveitado", async () => {
    banco = criarBancoFalso({ contacts: [{ id: "c-x", organization_id: OUTRA_ORG, email: "joao@exemplo.com", is_merged_into: null }] });
    await ingerir(email());
    expect(banco.tabelas.contacts).toHaveLength(2);
    expect(banco.tabelas.messages![0]!.contact_id).not.toBe("c-x");
  });

  it("AC-002.4: a resposta a um e-mail anterior cai na mesma conversa, sem abrir outra", async () => {
    await ingerir(email(), 1);
    await ingerir(
      email({ messageId: "<m2@exemplo.com>", inReplyTo: "<m1@exemplo.com>", references: ["<m1@exemplo.com>"], assunto: "Re: Orçamento" }),
      2,
    );
    expect(banco.tabelas.conversations).toHaveLength(1);
    expect(banco.tabelas.messages).toHaveLength(2);
    expect(banco.tabelas.messages![1]!.conversation_id).toBe(banco.tabelas.messages![0]!.conversation_id);
    const meta = banco.tabelas.messages![1]!.metadata as { email: { in_reply_to: string } };
    expect(meta.email.in_reply_to).toBe("<m1@exemplo.com>");
  });

  it("AC-002.5: o mesmo e-mail visto duas vezes gera uma so mensagem e nao repete os efeitos", async () => {
    const a = await ingerir(email());
    const b = await ingerir(email());
    expect(a.resultado).toBe("ingerido");
    expect(b.resultado).toBe("duplicado");
    expect(banco.tabelas.messages).toHaveLength(1);
    expect(efeitos).toHaveBeenCalledTimes(1);
    expect(banco.chamadasRpc.filter((c) => c.nome === "fn_mark_conversation_message")).toHaveLength(1);
  });

  it("AC-002.1: falha ao guardar o anexo nao derruba a ingestao do e-mail", async () => {
    guardarAnexo.mockResolvedValueOnce(null);
    const r = await ingerir(
      email({ anexos: [{ nome: "a.pdf", tipo: "application/pdf", tamanho: 3, conteudo: Buffer.from("abc") }] }),
    );
    expect(r.resultado).toBe("ingerido");
    const meta = banco.tabelas.messages![0]!.metadata as { email: { anexos: Array<{ caminho: string | null }> } };
    expect(meta.email.anexos[0]!.caminho).toBeNull();
  });
});

describe("ingerirEmail: o que nao e conversa", () => {
  it("AC-003.1: e-mail automatico vai para os ignorados com o motivo e nao cria contato nem mensagem", async () => {
    const r = await ingerir(email({ cabecalhos: { "list-unsubscribe": "1" } }), 7);
    expect(r).toEqual({ resultado: "ignorado", motivo: "lista_de_inscricao" });
    expect(banco.tabelas.messages ?? []).toHaveLength(0);
    expect(banco.tabelas.contacts ?? []).toHaveLength(0);
    expect(banco.tabelas.email_ignorados![0]).toMatchObject({
      organization_id: ORG,
      channel_session_id: "caixa-1",
      message_id: "<m1@exemplo.com>",
      uid: 7,
      remetente: "joao@exemplo.com",
      assunto: "Orçamento",
      motivo: "lista_de_inscricao",
    });
    expect(efeitos).not.toHaveBeenCalled();
  });

  it("AC-003.1: o e-mail de teste da propria caixa (Auto-Submitted) e ignorado como automatico", async () => {
    const r = await ingerir(
      email({ remetente: { endereco: "caixa@meunegocio.com", nome: null }, cabecalhos: { "auto-submitted": "auto-generated" } }),
    );
    expect(r).toEqual({ resultado: "ignorado", motivo: "propria_caixa" });
  });

  it("AC-003.5: e-mail que parece automatico mas vem de contato conhecido vira conversa", async () => {
    banco = criarBancoFalso({ contacts: [{ id: "c-1", organization_id: ORG, email: "joao@exemplo.com", is_merged_into: null }] });
    const r = await ingerir(email({ cabecalhos: { precedence: "bulk" } }));
    expect(r.resultado).toBe("ingerido");
  });

  it("AC-003.4: remetente marcado como 'nao e cliente' e ignorado, mesmo sendo contato conhecido", async () => {
    banco = criarBancoFalso({
      contacts: [{ id: "c-1", organization_id: ORG, email: "joao@exemplo.com", is_merged_into: null }],
      email_remetentes_ignorados: [{ organization_id: ORG, endereco_normalizado: "joao@exemplo.com" }],
    });
    const r = await ingerir(email());
    expect(r).toEqual({ resultado: "ignorado", motivo: "nao_e_cliente" });
    expect(banco.tabelas.messages ?? []).toHaveLength(0);
  });

  it("AC-003.4: a marca 'nao e cliente' de outra organizacao nao vale aqui", async () => {
    banco = criarBancoFalso({
      email_remetentes_ignorados: [{ organization_id: OUTRA_ORG, endereco_normalizado: "joao@exemplo.com" }],
    });
    const r = await ingerir(email());
    expect(r.resultado).toBe("ingerido");
  });

  it("AC-003.1: o mesmo ignorado visto de novo nao duplica a linha da lista", async () => {
    await ingerir(email({ cabecalhos: { "list-unsubscribe": "1" } }));
    const r = await ingerir(email({ cabecalhos: { "list-unsubscribe": "1" } }));
    expect(r.resultado).toBe("ignorado");
    expect(banco.tabelas.email_ignorados).toHaveLength(1);
  });
});

describe("origem do negocio", () => {
  it("AC-002.2: a conversa de e-mail tem a sua origem, nao a do WhatsApp", async () => {
    const { origemDoNegocioPeloCanal } = await import("@/lib/channels/origem-do-negocio");
    expect(origemDoNegocioPeloCanal("email")).toEqual({
      rotulo: "E-mail",
      source: "email",
      motivo: "primeira mensagem recebida por e-mail",
    });
  });
});

describe("ingerirEmail: erro de banco", () => {
  it("o erro lancado leva so o code, nunca a mensagem do Postgres (pode trazer o endereco)", async () => {
    banco.falharEm("contacts", "select", { code: "XX000", message: "falhou para joao@exemplo.com" });
    const erro = await ingerir(email()).catch((e: Error) => e);
    expect(erro).toBeInstanceOf(Error);
    expect((erro as Error).message).toContain("XX000");
    expect((erro as Error).message).not.toContain("joao@exemplo.com");
  });
});
