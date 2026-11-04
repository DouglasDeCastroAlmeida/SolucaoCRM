/**
 * O envio de uma resposta por e-mail (mudança 005, Fatia 5): a ponte entre o adaptador de
 * canal e o SMTP da caixa.
 *
 * ─── O que este arquivo garante ──────────────────────────────────────────────
 * - A caixa é achada DENTRO da organização (service role: o filtro é à mão) e tem de estar
 *   ativa. Caixa pausada (senha recusada ou pausa da equipe) não envia: insistir com senha
 *   errada bloquearia a conta do cliente no provedor.
 * - Recusa ANTES de abrir conexão: destinatário malformado e anexos acima do limite.
 * - O servidor SMTP nunca é citado: a falha vira `FalhaDeEnvio` com a frase fixa da causa
 *   (`MENSAGEM_DA_CAUSA`), sem texto do servidor, endereço de terceiro nem senha.
 * - Senha recusada no envio pausa a caixa e avisa, como na leitura (`rodada.ts`).
 * - Só o envio que o servidor aceitou conta no teto do dia.
 *
 * Teto e intervalo NÃO são decididos aqui: o handler pergunta ao adaptador (`admitir`) antes de
 * chamar `send`, e a fila do dia seguinte é da rodada. As dependências de rede entram por
 * parâmetro para o teste usar servidores simulados.
 */
import type { SupabaseClient } from "@supabase/supabase-js";

import type { AnexoDeEmail } from "../types";
import { avisarSenhaRecusada } from "./avisos";
import { acharCaixaPorEndereco } from "./caixa";
import { enviarMensagemSmtp, MENSAGEM_DA_CAUSA, type CausaDaFalha, type ConfigDaCaixa, type DependenciasDaConexao } from "./conexao";
import { lerEstado, pausar } from "./estado";
import { fusoDaOrganizacao, registrarEnvioFeito } from "./limite";
import { assuntoDaResposta, montarMensagemDeEmail, novoMessageId, referenciasDaResposta, type MensagemCitada } from "./resposta";
import { LIMITE_ANEXOS_BYTES } from "./limite-de-anexos";
import { lerSenhaDaCaixa } from "./segredo";

export { LIMITE_ANEXOS_BYTES };

const FORMA_DE_ENDERECO = /^[^\s@<>,;]+@[^\s@<>,;]+\.[^\s@<>,;]+$/;

export type CausaDoEnvio =
  | CausaDaFalha
  | "caixa_nao_encontrada"
  | "caixa_pausada"
  | "senha_ausente"
  | "destinatario_invalido"
  | "anexo_grande_demais"
  | "anexo_indisponivel";

const FRASES_PROPRIAS: Record<Exclude<CausaDoEnvio, CausaDaFalha>, string> = {
  caixa_nao_encontrada: "A caixa de e-mail desta conversa não está mais conectada. Conecte-a de novo em Conexões.",
  caixa_pausada:
    "A caixa de e-mail está pausada e não envia mensagens. Em Conexões, confira a senha ou retome a caixa e tente de novo.",
  senha_ausente: "Não encontramos a senha guardada desta caixa. Em Conexões, informe a senha de novo.",
  destinatario_invalido: "O endereço de e-mail do contato é inválido. Corrija-o no cadastro do contato e tente de novo.",
  anexo_grande_demais: "O anexo é grande demais para um e-mail (o limite é de cerca de 18 MB no total). Envie um arquivo menor.",
  anexo_indisponivel: "Não foi possível ler o anexo para enviar. Anexe o arquivo de novo e tente de novo.",
};

/** Falha de envio com a causa em português. A mensagem NUNCA traz texto do servidor. */
export class FalhaDeEnvio extends Error {
  constructor(readonly causa: CausaDoEnvio) {
    super(causa in FRASES_PROPRIAS ? FRASES_PROPRIAS[causa as keyof typeof FRASES_PROPRIAS] : MENSAGEM_DA_CAUSA[causa as CausaDaFalha]);
    this.name = "FalhaDeEnvio";
  }
}

/** A mídia da mensagem, antes de baixada. */
export interface MidiaParaAnexar {
  url: string;
  mime: string;
  filename?: string;
  /** Tamanho que o armazenamento informou, quando se sabe. */
  tamanho?: number | null;
}

export interface EntradaDoEnvio {
  organizationId: string;
  /** O endereço da caixa (`sessionRef` do canal). */
  sessionRef: string;
  para: string;
  conversationId?: string | null;
  corpo: string;
  assunto?: string;
  inReplyTo?: string;
  references?: string[];
  anexos?: AnexoDeEmail[];
  media?: MidiaParaAnexar;
  /** Última conferência de autoridade, logo antes de falar com o servidor (`beforeSend` do envelope). */
  antesDeEnviar?: () => Promise<void>;
}

export interface DependenciasDoEnvio extends DependenciasDaConexao {
  agora?: () => Date;
  lerSenha?: typeof lerSenhaDaCaixa;
  baixarAnexo?: (m: MidiaParaAnexar) => Promise<AnexoDeEmail>;
  avisarSenhaRecusada?: typeof avisarSenhaRecusada;
  gerarMessageId?: (enderecoDaCaixa: string) => string;
}

interface UltimaRecebida {
  messageId: string | null;
  assunto: string | null;
  referencias: string[];
  citada: MensagemCitada;
}

/** A última mensagem que o contato mandou NESTA conversa. Só da organização informada. */
async function ultimaRecebida(
  admin: SupabaseClient,
  organizationId: string,
  conversationId: string,
  para: string,
): Promise<UltimaRecebida | null> {
  const { data, error } = await admin
    .from("messages")
    .select("external_id, body, sent_at, metadata")
    .eq("organization_id", organizationId)
    .eq("conversation_id", conversationId)
    .eq("direction", "inbound")
    .order("sent_at", { ascending: false })
    .limit(1);
  if (error) throw new Error(`email_contexto_lookup_failed: ${error.message}`);
  const linha = (data as Array<Record<string, unknown>> | null)?.[0];
  if (!linha) return null;
  const email = ((linha.metadata as Record<string, unknown> | null)?.email ?? {}) as {
    assunto?: unknown;
    de_nome?: unknown;
    references?: unknown;
  };
  return {
    messageId: typeof linha.external_id === "string" ? linha.external_id : null,
    assunto: typeof email.assunto === "string" ? email.assunto : null,
    referencias: Array.isArray(email.references) ? email.references.filter((r): r is string => typeof r === "string") : [],
    citada: {
      nome: typeof email.de_nome === "string" && email.de_nome.trim() ? email.de_nome.trim() : null,
      endereco: para,
      quando: typeof linha.sent_at === "string" ? new Date(linha.sent_at) : null,
      texto: typeof linha.body === "string" ? linha.body : "",
    },
  };
}

/** Baixa o anexo da URL assinada, sem passar do limite. A URL é do nosso armazenamento. */
const baixarAnexoPadrao = async (m: MidiaParaAnexar): Promise<AnexoDeEmail> => {
  const r = await fetch(m.url, { redirect: "error", signal: AbortSignal.timeout(30_000) });
  if (!r.ok) throw new FalhaDeEnvio("anexo_indisponivel");
  const informado = Number(r.headers.get("content-length") ?? 0);
  if (informado > LIMITE_ANEXOS_BYTES) throw new FalhaDeEnvio("anexo_grande_demais");
  const bytes = new Uint8Array(await r.arrayBuffer());
  return { filename: m.filename ?? "anexo", contentType: m.mime || "application/octet-stream", content: bytes };
};

function nomeSeguro(nome: string): string {
  return nome.replace(/[\r\n"\\/]/g, "_").slice(0, 200) || "anexo";
}

/**
 * Envia a resposta. LANÇA `FalhaDeEnvio` (causa em português) e nunca devolve texto do
 * servidor. Devolve o `Message-ID` gerado, que é o `external_id` da mensagem.
 */
export async function enviarEmailDaCaixa(
  admin: SupabaseClient,
  entrada: EntradaDoEnvio,
  deps: DependenciasDoEnvio = {},
): Promise<{ externalId: string }> {
  const agora = (deps.agora ?? (() => new Date()))();
  const para = entrada.para.trim();
  if (!FORMA_DE_ENDERECO.test(para)) throw new FalhaDeEnvio("destinatario_invalido");

  const caixa = await acharCaixaPorEndereco(admin, entrada.organizationId, entrada.sessionRef);
  if (!caixa || caixa.archivedAt) throw new FalhaDeEnvio("caixa_nao_encontrada");
  const estado = await lerEstado(admin, entrada.organizationId, caixa.id);
  if (estado?.pausaMotivo) throw new FalhaDeEnvio("caixa_pausada");

  // Anexos: antes de abrir qualquer conexão, para recusar sem custo.
  const anexos: AnexoDeEmail[] = [...(entrada.anexos ?? [])];
  const somar = () => anexos.reduce((n, a) => n + a.content.byteLength, 0);
  if (somar() > LIMITE_ANEXOS_BYTES) throw new FalhaDeEnvio("anexo_grande_demais");
  if (entrada.media) {
    if ((entrada.media.tamanho ?? 0) > LIMITE_ANEXOS_BYTES) throw new FalhaDeEnvio("anexo_grande_demais");
    try {
      const baixado = await (deps.baixarAnexo ?? baixarAnexoPadrao)(entrada.media);
      anexos.push({ ...baixado, filename: nomeSeguro(baixado.filename) });
    } catch (erro) {
      throw erro instanceof FalhaDeEnvio ? erro : new FalhaDeEnvio("anexo_indisponivel");
    }
    if (somar() > LIMITE_ANEXOS_BYTES) throw new FalhaDeEnvio("anexo_grande_demais");
  }

  const senha = await (deps.lerSenha ?? lerSenhaDaCaixa)(admin, { organizationId: entrada.organizationId, channelSessionId: caixa.id });
  if (!senha) throw new FalhaDeEnvio("senha_ausente");

  const fuso = await fusoDaOrganizacao(admin, entrada.organizationId);
  const ultima = entrada.conversationId
    ? await ultimaRecebida(admin, entrada.organizationId, entrada.conversationId, para)
    : null;

  const messageId = (deps.gerarMessageId ?? novoMessageId)(caixa.endereco);
  const mensagem = montarMensagemDeEmail({
    de: caixa.endereco,
    para,
    corpo: entrada.corpo,
    assinatura: caixa.config.assinatura,
    assunto: assuntoDaResposta(ultima?.assunto ?? entrada.assunto),
    messageId,
    inReplyTo: ultima?.messageId ?? entrada.inReplyTo ?? null,
    referencias: referenciasDaResposta(ultima?.referencias ?? entrada.references ?? [], ultima?.messageId ?? entrada.inReplyTo ?? null),
    citada: ultima?.citada ?? null,
    fuso,
    anexos,
  });

  const cfg: ConfigDaCaixa = {
    endereco: caixa.endereco,
    usuario: caixa.config.usuario,
    senha,
    imap: caixa.config.imap,
    smtp: caixa.config.smtp,
  };
  await entrada.antesDeEnviar?.();
  const r = await enviarMensagemSmtp(cfg, mensagem, deps);
  if (!r.ok) {
    if (r.causa === "senha_recusada" || r.causa === "verificacao_em_duas_etapas") {
      await pausar(admin, entrada.organizationId, caixa.id, "senha_recusada").catch(() => undefined);
      await (deps.avisarSenhaRecusada ?? avisarSenhaRecusada)(admin, {
        organizationId: entrada.organizationId,
        caixaId: caixa.id,
        endereco: caixa.endereco,
      }).catch(() => undefined);
    }
    throw new FalhaDeEnvio(r.causa);
  }

  await registrarEnvioFeito(admin, { organizationId: entrada.organizationId, caixaId: caixa.id, fuso, agora });
  return { externalId: messageId };
}
