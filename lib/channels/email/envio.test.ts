import { beforeEach, describe, expect, it, vi } from "vitest";

import { criarBancoFalso, type BancoFalso } from "../../../tests/helpers/banco-falso-do-email";
import type { AnexoDeEmail } from "../types";
import { assuntoDaResposta } from "./resposta";
import { enviarEmailDaCaixa, FalhaDeEnvio, LIMITE_ANEXOS_BYTES, type DependenciasDoEnvio } from "./envio";

const ORG = "org-a";
const CAIXA = "caixa-1";
const ENDERECO = "atendimento@meunegocio.com";
const SENHA = "S3nh4-Muito-Secreta";
const CLIENTE = "joao@exemplo.com";

const configGuardada = (extra: Record<string, unknown> = {}) => ({
  usuario: ENDERECO,
  imap: { host: "mail.meunegocio.com", porta: 993, seguranca: "ssl" },
  smtp: { host: "mail.meunegocio.com", porta: 465, seguranca: "ssl" },
  senha_ultimos4: "reta",
  assinatura: "Att,\nMaria - Meu Negócio",
  teto_diario: 200,
  intervalo_segundos: 30,
  ...extra,
});

function semear(opcoes: { config?: Record<string, unknown>; inbound?: Record<string, unknown> | null; estado?: Record<string, unknown> } = {}): BancoFalso {
  return criarBancoFalso({
    channel_sessions: [
      { id: CAIXA, organization_id: ORG, provider: "email", email_address: ENDERECO, email_config: configGuardada(opcoes.config), status: "WORKING", archived_at: null },
    ],
    email_sync_estado: [{ channel_session_id: CAIXA, organization_id: ORG, uidvalidity: "1", ultimo_uid: 5, falhas_seguidas: 0, pausa_motivo: null, ...opcoes.estado }],
    messages:
      opcoes.inbound === null
        ? []
        : [
            {
              id: "m-in",
              organization_id: ORG,
              conversation_id: "conv-1",
              channel_session_id: CAIXA,
              direction: "inbound",
              external_id: "<m1@exemplo.com>",
              body: "Quanto custa o site?\nPreciso para o mês que vem.",
              sent_at: "2026-11-03T10:00:00.000Z",
              metadata: { email: { assunto: "Orçamento", de_nome: "João Silva", references: ["<antes@exemplo.com>"] } },
              ...opcoes.inbound,
            },
          ],
  });
}

let banco: BancoFalso;
let enviados: Record<string, unknown>[];
let deps: DependenciasDoEnvio;
let respostaDoSmtp: { erro?: unknown; rejeitados?: string[] };
let avisoDeSenha: ReturnType<typeof vi.fn>;

beforeEach(() => {
  banco = semear();
  enviados = [];
  respostaDoSmtp = {};
  avisoDeSenha = vi.fn().mockResolvedValue({ central: true, emails: 0 });
  deps = {
    agora: () => new Date("2026-11-04T15:00:00.000Z"),
    lerSenha: async () => SENHA,
    resolver: async () => [{ address: "93.184.216.34", family: 4 }],
    criarSmtp: () => ({
      verify: async () => true,
      sendMail: async (m) => {
        if (respostaDoSmtp.erro) throw respostaDoSmtp.erro;
        enviados.push(m);
        return { accepted: respostaDoSmtp.rejeitados ? [] : [CLIENTE], rejected: respostaDoSmtp.rejeitados ?? [], messageId: String(m.messageId) };
      },
      close: () => undefined,
    }),
    avisarSenhaRecusada: avisoDeSenha as never,
  };
});

const enviar = (extra: Partial<Parameters<typeof enviarEmailDaCaixa>[1]> = {}) =>
  enviarEmailDaCaixa(
    banco.client,
    { organizationId: ORG, sessionRef: ENDERECO, para: CLIENTE, conversationId: "conv-1", corpo: "Fica R$ 2.000.", ...extra },
    deps,
  );

describe("assunto da resposta", () => {
  it("AC-004.1: põe um Re: só, sem empilhar", () => {
    expect(assuntoDaResposta("Orçamento")).toBe("Re: Orçamento");
    expect(assuntoDaResposta("Re: Orçamento")).toBe("Re: Orçamento");
    expect(assuntoDaResposta("RES: re: Orçamento")).toBe("Re: Orçamento");
    expect(assuntoDaResposta("")).toBe("Re: (sem assunto)");
    expect(assuntoDaResposta("Linha1\r\nBcc: x@y.com")).toBe("Re: Linha1 Bcc: x@y.com");
  });
});

describe("enviarEmailDaCaixa: a resposta sai pela caixa", () => {
  it("AC-004.1: assunto Re:, In-Reply-To e References da última mensagem recebida", async () => {
    const r = await enviar();
    expect(enviados).toHaveLength(1);
    const m = enviados[0]!;
    expect(m).toMatchObject({
      from: ENDERECO,
      to: CLIENTE,
      subject: "Re: Orçamento",
      inReplyTo: "<m1@exemplo.com>",
      references: ["<antes@exemplo.com>", "<m1@exemplo.com>"],
    });
    expect(r.externalId).toBe(m.messageId);
    expect(String(r.externalId)).toMatch(/^<[^@\s>]+@meunegocio\.com>$/);
  });

  it("AC-004.2: cita a mensagem anterior e inclui a assinatura da caixa", async () => {
    await enviar();
    const texto = String(enviados[0]!.text);
    expect(texto.startsWith("Fica R$ 2.000.")).toBe(true);
    expect(texto).toContain("-- \nAtt,\nMaria - Meu Negócio");
    expect(texto).toContain(`João Silva <${CLIENTE}> escreveu:`);
    expect(texto).toContain("> Quanto custa o site?");
    expect(texto).toContain("> Preciso para o mês que vem.");
    expect(texto.indexOf("-- \n")).toBeLessThan(texto.indexOf("escreveu:"));
  });

  it("AC-004.2: caixa sem assinatura não leva separador de assinatura", async () => {
    banco = semear({ config: { assinatura: null } });
    await enviar();
    expect(String(enviados[0]!.text)).not.toContain("-- \n");
  });

  it("AC-004.4: sai sem recibo de leitura nem rastreador", async () => {
    await enviar();
    const m = enviados[0]!;
    const cabecalhos = Object.keys((m.headers as Record<string, string> | undefined) ?? {}).map((c) => c.toLowerCase());
    for (const proibido of ["disposition-notification-to", "return-receipt-to", "x-confirm-reading-to"]) {
      expect(cabecalhos).not.toContain(proibido);
      expect(Object.keys(m).map((c) => c.toLowerCase())).not.toContain(proibido);
    }
    expect(m.html).toBeUndefined();
  });

  it("AC-004.4: conta o envio no dia da caixa", async () => {
    await enviar();
    expect(banco.tabelas.email_envios_dia![0]).toMatchObject({ channel_session_id: CAIXA, dia: "2026-11-04", quantidade: 1 });
  });

  it("AC-004.1: conversa sem e-mail recebido usa o assunto do envelope", async () => {
    banco = semear({ inbound: null });
    await enviar({ assunto: "Proposta" });
    expect(enviados[0]).toMatchObject({ subject: "Re: Proposta" });
    expect(enviados[0]!.inReplyTo).toBeUndefined();
  });

  it("a conversa de outra organização nunca fornece o fio", async () => {
    banco.tabelas.messages![0]!.organization_id = "org-b";
    await enviar();
    expect(enviados[0]!.inReplyTo).toBeUndefined();
    expect(enviados[0]!.subject).toBe("Re: (sem assunto)");
  });
});

describe("enviarEmailDaCaixa: anexos", () => {
  const anexo = (tamanho: number): AnexoDeEmail => ({ filename: "proposta.pdf", contentType: "application/pdf", content: new Uint8Array(tamanho) });

  it("AC-004.3: anexo dentro do limite chega com nome e tipo", async () => {
    await enviar({ anexos: [anexo(1024)] });
    const lista = enviados[0]!.attachments as Array<{ filename: string; contentType: string; content: Uint8Array }>;
    expect(lista).toHaveLength(1);
    expect(lista[0]).toMatchObject({ filename: "proposta.pdf", contentType: "application/pdf" });
    expect(lista[0]!.content.byteLength).toBe(1024);
  });

  it("AC-004.3: acima do limite recusa antes de abrir conexão", async () => {
    const criar = vi.fn();
    deps.criarSmtp = criar as never;
    await expect(enviar({ anexos: [anexo(LIMITE_ANEXOS_BYTES), anexo(1)] })).rejects.toMatchObject({ causa: "anexo_grande_demais" });
    expect(criar).not.toHaveBeenCalled();
    expect(banco.tabelas.email_envios_dia ?? []).toHaveLength(0);
  });

  it("AC-004.3: a mídia da mensagem é baixada pelo ponto injetado e entra como anexo", async () => {
    const baixar = vi.fn(async () => anexo(10));
    deps.baixarAnexo = baixar;
    await enviar({ media: { url: "https://armazenamento.exemplo/arquivo?assinatura=x", mime: "application/pdf", filename: "proposta.pdf" } });
    expect(baixar).toHaveBeenCalledTimes(1);
    expect((enviados[0]!.attachments as unknown[]).length).toBe(1);
  });

  it("AC-004.3: mídia que o armazenamento informa maior que o limite é recusada sem baixar", async () => {
    const baixar = vi.fn();
    deps.baixarAnexo = baixar as never;
    await expect(
      enviar({ media: { url: "https://x/y", mime: "application/pdf", tamanho: LIMITE_ANEXOS_BYTES + 1 } }),
    ).rejects.toMatchObject({ causa: "anexo_grande_demais" });
    expect(baixar).not.toHaveBeenCalled();
  });
});

describe("enviarEmailDaCaixa: falha com causa e nova tentativa", () => {
  it("AC-006.5: o servidor recusa a mensagem e a causa vem em português, sem o texto dele", async () => {
    respostaDoSmtp.erro = Object.assign(new Error(`550 5.7.1 recusado para ${CLIENTE} senha ${SENHA}`), { code: "EMESSAGE", responseCode: 550 });
    const falha = await enviar().catch((e: unknown) => e);
    expect(falha).toBeInstanceOf(FalhaDeEnvio);
    const f = falha as FalhaDeEnvio;
    expect(f.causa).toBe("envio_recusado");
    expect(f.message).toMatch(/recusou/i);
    expect(f.message).not.toContain(CLIENTE);
    expect(f.message).not.toContain(SENHA);
    expect(banco.tabelas.email_envios_dia ?? []).toHaveLength(0);
  });

  it("AC-006.5: tentar de novo funciona e só o envio que saiu conta no dia", async () => {
    respostaDoSmtp.erro = Object.assign(new Error("timeout"), { code: "ETIMEDOUT" });
    await expect(enviar()).rejects.toBeInstanceOf(FalhaDeEnvio);
    respostaDoSmtp = {};
    const r = await enviar();
    expect(r.externalId).toBeTruthy();
    expect(banco.tabelas.email_envios_dia![0]).toMatchObject({ quantidade: 1 });
  });

  it("AC-006.5: todos os destinatários rejeitados é falha, não envio", async () => {
    respostaDoSmtp.rejeitados = [CLIENTE];
    await expect(enviar()).rejects.toMatchObject({ causa: "envio_recusado" });
  });

  it("senha recusada no envio pausa a caixa e avisa, sem insistir", async () => {
    respostaDoSmtp.erro = Object.assign(new Error("535 senha errada"), { code: "EAUTH", responseCode: 535 });
    await expect(enviar()).rejects.toMatchObject({ causa: "senha_recusada" });
    expect(banco.tabelas.email_sync_estado![0]).toMatchObject({ pausa_motivo: "senha_recusada" });
    expect(avisoDeSenha).toHaveBeenCalledTimes(1);
  });

  it("caixa pausada não envia nem abre conexão", async () => {
    banco = semear({ estado: { pausa_motivo: "senha_recusada" } });
    const criar = vi.fn();
    deps.criarSmtp = criar as never;
    await expect(enviar()).rejects.toMatchObject({ causa: "caixa_pausada" });
    expect(criar).not.toHaveBeenCalled();
  });

  it("caixa de outra organização ou arquivada não envia", async () => {
    await expect(enviar({ organizationId: "org-b" })).rejects.toMatchObject({ causa: "caixa_nao_encontrada" });
    banco.tabelas.channel_sessions![0]!.archived_at = "2026-11-01T00:00:00.000Z";
    await expect(enviar()).rejects.toMatchObject({ causa: "caixa_nao_encontrada" });
  });

  it("AC-001.4: servidor que resolve para rede interna é recusado e nada é enviado", async () => {
    deps.resolver = async () => [{ address: "10.0.0.5", family: 4 }];
    await expect(enviar()).rejects.toMatchObject({ causa: "destino_proibido" });
    expect(enviados).toHaveLength(0);
  });

  it("sem senha legível não tenta enviar", async () => {
    deps.lerSenha = async () => null;
    await expect(enviar()).rejects.toMatchObject({ causa: "senha_ausente" });
    expect(enviados).toHaveLength(0);
  });

  it("destinatário malformado é recusado antes de qualquer conexão", async () => {
    await expect(enviar({ para: "isso nao e email" })).rejects.toMatchObject({ causa: "destinatario_invalido" });
    await expect(enviar({ para: "a@b.com\r\nBcc: c@d.com" })).rejects.toMatchObject({ causa: "destinatario_invalido" });
  });
});
