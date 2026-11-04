/**
 * Regra pura: este e-mail é automático (newsletter, notificação, no-reply, aviso de
 * falha de entrega) e por isso NÃO vira conversa? (mudança 005, REQ-003)
 *
 * Sem rede e sem banco: recebe os cabeçalhos já lidos (nomes em minúsculas) e devolve
 * a decisão com o motivo, que vai para a lista de ignorados.
 *
 * Duas precedências que não se negociam:
 * - o e-mail que a PRÓPRIA caixa enviou (o de teste da conexão) é ignorado sempre;
 * - contato que já é conhecido nunca é ignorado por parecer automático (AC-003.5):
 *   o cliente que responde por um app com cabeçalho esquisito não pode sumir.
 *   (O "não é cliente" marcado por uma pessoa é decidido antes, em `ingest.ts`.)
 */

export type MotivoDeIgnorado =
  | "propria_caixa"
  | "lista_de_inscricao"
  | "envio_em_massa"
  | "resposta_automatica"
  | "no_reply"
  | "falha_de_entrega"
  | "nao_e_cliente";

export type CabecalhosDeEmail = Readonly<Record<string, string | undefined>>;

export interface EntradaDaClassificacao {
  remetente: string;
  enderecoDaCaixa: string;
  cabecalhos: CabecalhosDeEmail;
  contatoConhecido: boolean;
}

export type Classificacao = { ignorar: false } | { ignorar: true; motivo: MotivoDeIgnorado };

const PARTE_LOCAL_NO_REPLY = /^(no[-_.]?reply|do[-_.]?not[-_.]?reply|nao[-_.]?responda|naoresponda)(\+.*)?$/i;
const PARTE_LOCAL_DE_FALHA = /^(mailer-daemon|postmaster|mail-daemon)$/i;

function parteLocal(endereco: string): string {
  const i = endereco.lastIndexOf("@");
  return (i < 0 ? endereco : endereco.slice(0, i)).trim();
}

export function classificarAutomatico(e: EntradaDaClassificacao): Classificacao {
  const remetente = e.remetente.trim().toLowerCase();
  if (remetente === e.enderecoDaCaixa.trim().toLowerCase()) return { ignorar: true, motivo: "propria_caixa" };
  if (e.contatoConhecido) return { ignorar: false };

  const h = e.cabecalhos;
  const local = parteLocal(remetente);

  if (PARTE_LOCAL_DE_FALHA.test(local) || /report-type=delivery-status/i.test(h["content-type"] ?? "")) {
    return { ignorar: true, motivo: "falha_de_entrega" };
  }
  if (h["list-unsubscribe"] !== undefined || h["list-id"] !== undefined) {
    return { ignorar: true, motivo: "lista_de_inscricao" };
  }
  if (/^(bulk|list|junk)$/i.test((h.precedence ?? "").trim())) return { ignorar: true, motivo: "envio_em_massa" };
  const autoEnviado = (h["auto-submitted"] ?? "").trim().toLowerCase();
  if (autoEnviado !== "" && autoEnviado !== "no") return { ignorar: true, motivo: "resposta_automatica" };
  if (PARTE_LOCAL_NO_REPLY.test(local)) return { ignorar: true, motivo: "no_reply" };
  return { ignorar: false };
}
