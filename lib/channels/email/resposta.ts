/**
 * A montagem da resposta por e-mail (mudança 005, AC-004.1 a AC-004.4): assunto, fio,
 * citação e assinatura. Puro: não toca rede nem banco.
 *
 * - Assunto `Re: <original>`, sem empilhar `Re:`/`Res:`/`Aw:` e sem quebra de linha (um
 *   assunto vindo de fora com CR/LF seria injeção de cabeçalho).
 * - `In-Reply-To` e `References` da última mensagem recebida: é o que mantém a resposta na
 *   mesma conversa na caixa do cliente.
 * - Texto puro. Sem HTML, sem imagem remota, sem `Disposition-Notification-To`: nenhum
 *   recibo de leitura é pedido nem inventado (AC-004.4).
 */
import { randomUUID } from "node:crypto";

import type { AnexoDeEmail } from "../types";

/** Quantas mensagens do fio entram em `References` (as mais recentes). */
const MAXIMO_DE_REFERENCIAS = 20;
const MAXIMO_DE_LINHAS_CITADAS = 40;
const MAXIMO_DE_CARACTERES_CITADOS = 4000;

const PREFIXO_DE_RESPOSTA = /^\s*(?:re|res|aw|sv|rv)\s*:\s*/i;

export function assuntoDaResposta(original: string | null | undefined): string {
  let base = (original ?? "").replace(/[\r\n]+/g, " ").trim();
  while (PREFIXO_DE_RESPOSTA.test(base)) base = base.replace(PREFIXO_DE_RESPOSTA, "");
  return `Re: ${base || "(sem assunto)"}`;
}

export function referenciasDaResposta(anteriores: readonly string[], idDaUltima: string | null): string[] {
  const todas = idDaUltima ? [...anteriores, idDaUltima] : [...anteriores];
  const unicas = todas.filter((id, i) => id && todas.indexOf(id) === i);
  return unicas.slice(-MAXIMO_DE_REFERENCIAS);
}

export interface MensagemCitada {
  nome: string | null;
  endereco: string;
  quando: Date | null;
  texto: string;
}

function citacao(c: MensagemCitada, fuso: string): string {
  const quando = c.quando
    ? new Intl.DateTimeFormat("pt-BR", { dateStyle: "short", timeStyle: "short", timeZone: fuso }).format(c.quando)
    : null;
  const quem = c.nome ? `${c.nome} <${c.endereco}>` : c.endereco;
  const cabecalho = quando ? `Em ${quando}, ${quem} escreveu:` : `${quem} escreveu:`;
  const linhas = c.texto
    .replace(/\r\n?/g, "\n")
    .slice(0, MAXIMO_DE_CARACTERES_CITADOS)
    .split("\n")
    .slice(0, MAXIMO_DE_LINHAS_CITADAS)
    .map((l) => (l.length > 0 ? `> ${l}` : ">"));
  return `${cabecalho}\n${linhas.join("\n")}`;
}

export interface EntradaDaMontagem {
  de: string;
  para: string;
  corpo: string;
  assinatura: string | null;
  assunto: string;
  messageId: string;
  inReplyTo: string | null;
  referencias: string[];
  citada: MensagemCitada | null;
  fuso: string;
  anexos: AnexoDeEmail[];
}

/** O objeto que o nodemailer entende. Só o que a resposta precisa: nada de cabeçalho opcional. */
export function montarMensagemDeEmail(e: EntradaDaMontagem): Record<string, unknown> {
  const partes = [e.corpo.trimEnd()];
  const assinatura = e.assinatura?.trim();
  if (assinatura) partes.push(`-- \n${assinatura}`);
  if (e.citada) partes.push(citacao(e.citada, e.fuso));
  return {
    from: e.de,
    to: e.para,
    subject: e.assunto,
    text: partes.join("\n\n"),
    messageId: e.messageId,
    ...(e.inReplyTo ? { inReplyTo: e.inReplyTo } : {}),
    ...(e.referencias.length > 0 ? { references: e.referencias } : {}),
    ...(e.anexos.length > 0
      ? { attachments: e.anexos.map((a) => ({ filename: a.filename, contentType: a.contentType, content: a.content })) }
      : {}),
  };
}

/** Um Message-ID novo no domínio da própria caixa, na forma `<uuid@dominio>`. */
export function novoMessageId(enderecoDaCaixa: string): string {
  const dominio = enderecoDaCaixa.split("@")[1]?.replace(/[^a-z0-9.-]/gi, "") || "localhost";
  return `<${randomUUID()}@${dominio}>`;
}
