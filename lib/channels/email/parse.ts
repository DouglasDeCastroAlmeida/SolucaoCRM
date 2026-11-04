/**
 * Lê o MIME cru de um e-mail (mudança 005): assunto, texto, HTML higienizado, anexos
 * com limite, `Message-ID` e os cabeçalhos de encadeamento.
 *
 * Nunca lança por e-mail ruim: devolve `{ ok: false, motivo }` para a rodada pular a
 * mensagem com o motivo (AC-006.3). Não registra conteúdo em log.
 */
import { createHash } from "node:crypto";

import { simpleParser, type AddressObject, type ParsedMail } from "mailparser";

import type { CabecalhosDeEmail } from "./automatico";
import { higienizarHtml } from "./html-seguro";

export const LIMITE_DO_ANEXO_BYTES = 10 * 1024 * 1024;
export const LIMITE_TOTAL_DE_ANEXOS_BYTES = 25 * 1024 * 1024;
const TEXTO_MAXIMO = 200_000;

export interface AnexoLido {
  nome: string;
  tipo: string;
  tamanho: number;
  conteudo: Buffer;
}

export interface AnexoOmitido {
  nome: string;
  tipo: string;
  tamanho: number;
}

export interface EmailLido {
  messageId: string;
  inReplyTo: string | null;
  references: string[];
  assunto: string;
  remetente: { endereco: string; nome: string | null };
  data: Date | null;
  texto: string;
  html: string | null;
  cabecalhos: CabecalhosDeEmail;
  anexos: AnexoLido[];
  anexosOmitidos: AnexoOmitido[];
}

export type ResultadoDaLeitura =
  | { ok: true; email: EmailLido }
  | { ok: false; motivo: "sem_remetente" | "ilegivel" };

function valorDoCabecalho(v: unknown): string {
  if (typeof v === "string") return v;
  if (v instanceof Date) return v.toISOString();
  if (Array.isArray(v)) return v.map(valorDoCabecalho).join(", ");
  if (v && typeof v === "object") {
    const o = v as { value?: unknown; params?: Record<string, string>; text?: unknown };
    if (typeof o.value === "string") {
      const params = Object.entries(o.params ?? {}).map(([k, val]) => `${k}=${val}`);
      return [o.value, ...params].join("; ");
    }
    if (typeof o.text === "string") return o.text;
    return "1"; // presente, é o que importa (ex.: List-Unsubscribe estruturado)
  }
  return "";
}

function cabecalhosDe(p: ParsedMail): CabecalhosDeEmail {
  const saida: Record<string, string> = {};
  for (const [nome, valor] of p.headers) {
    // O mailparser junta os List-* (Unsubscribe, Id, Post...) num único item "list".
    if (nome === "list" && valor && typeof valor === "object") {
      for (const sub of Object.keys(valor)) saida[`list-${sub.toLowerCase()}`] = "1";
      continue;
    }
    saida[nome.toLowerCase()] = valorDoCabecalho(valor);
  }
  return saida;
}

function primeiroEndereco(campo: AddressObject | AddressObject[] | undefined) {
  const obj = Array.isArray(campo) ? campo[0] : campo;
  const item = obj?.value?.find((a) => a.address);
  if (!item?.address) return null;
  return { endereco: item.address.trim().toLowerCase(), nome: item.name?.trim() ? item.name.trim() : null };
}

function listaDeIds(v: string | string[] | undefined): string[] {
  if (!v) return [];
  const bruto = Array.isArray(v) ? v.join(" ") : v;
  return bruto.split(/\s+/).filter((x) => x.startsWith("<") && x.endsWith(">"));
}

export async function lerEmail(
  fonte: Buffer,
  opcoes: { limiteDoAnexoBytes?: number; limiteTotalBytes?: number } = {},
): Promise<ResultadoDaLeitura> {
  const limiteAnexo = opcoes.limiteDoAnexoBytes ?? LIMITE_DO_ANEXO_BYTES;
  const limiteTotal = opcoes.limiteTotalBytes ?? LIMITE_TOTAL_DE_ANEXOS_BYTES;

  let p: ParsedMail;
  try {
    p = await simpleParser(fonte);
  } catch {
    return { ok: false, motivo: "ilegivel" };
  }
  const remetente = primeiroEndereco(p.from);
  if (!remetente) return { ok: false, motivo: "sem_remetente" };

  const anexos: AnexoLido[] = [];
  const anexosOmitidos: AnexoOmitido[] = [];
  let acumulado = 0;
  for (const a of p.attachments) {
    // Imagem embutida no corpo (logo da assinatura) não é anexo de ninguém.
    if (a.related) continue;
    const nome = a.filename?.trim() || "anexo";
    const tamanho = a.size ?? a.content.length;
    if (tamanho > limiteAnexo || acumulado + tamanho > limiteTotal) {
      anexosOmitidos.push({ nome, tipo: a.contentType, tamanho });
      continue;
    }
    acumulado += tamanho;
    anexos.push({ nome, tipo: a.contentType, tamanho, conteudo: a.content });
  }

  const html = typeof p.html === "string" ? higienizarHtml(p.html).trim() : "";
  const texto = (p.text ?? "").slice(0, TEXTO_MAXIMO);
  const messageId =
    p.messageId?.trim() || `<sem-id-${createHash("sha1").update(fonte).digest("hex")}@canal-email.local>`;

  return {
    ok: true,
    email: {
      messageId,
      inReplyTo: p.inReplyTo?.trim() || null,
      references: listaDeIds(p.references),
      assunto: (p.subject ?? "").trim(),
      remetente,
      data: p.date ?? null,
      texto,
      html: html || null,
      cabecalhos: cabecalhosDe(p),
      anexos,
      anexosOmitidos,
    },
  };
}
