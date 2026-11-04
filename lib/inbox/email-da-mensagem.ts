/**
 * O que a conversa mostra de um e-mail RECEBIDO (`messages.metadata.email`, gravado pela
 * ingestão: `lib/channels/email/ingest.ts`). É o ÚNICO leitor desse formato do lado da tela: o
 * balão recebe o resultado já validado e nunca o JSON cru (mesma regra do remetente de grupo).
 *
 * Devolve `null` quando a mensagem não é um e-mail recebido — é o dado, e não o nome do canal,
 * que diz como desenhar o balão.
 */

export interface AnexoDoEmail {
  /** Posição na lista: é o `?anexo=N` da rota de download. */
  indice: number;
  nome: string;
  tipo: string | null;
  tamanho: number | null;
  /** `false` quando o arquivo não chegou a ser guardado (não há o que baixar). */
  disponivel: boolean;
}

export interface EmailDaMensagem {
  assunto: string | null;
  /** HTML JÁ higienizado pela ingestão (sem script, formulário, estilo ou imagem remota). */
  html: string | null;
  anexos: AnexoDoEmail[];
  /** Quantos anexos ficaram de fora por serem grandes demais. */
  omitidos: number;
}

const texto = (v: unknown): string | null => (typeof v === "string" && v.trim() ? v : null);

export function lerEmailDaMensagem(metadata: unknown): EmailDaMensagem | null {
  const bruto = (metadata as { email?: unknown } | null | undefined)?.email;
  if (!bruto || typeof bruto !== "object") return null;
  const e = bruto as Record<string, unknown>;
  const anexos = Array.isArray(e.anexos)
    ? e.anexos.map((a, indice): AnexoDoEmail => {
        const x = (a ?? {}) as Record<string, unknown>;
        return {
          indice,
          nome: texto(x.nome) ?? "anexo",
          tipo: texto(x.tipo),
          tamanho: typeof x.tamanho === "number" && x.tamanho >= 0 ? x.tamanho : null,
          disponivel: typeof x.caminho === "string" && x.caminho.length > 0,
        };
      })
    : [];
  return {
    assunto: texto(e.assunto),
    html: texto(e.html),
    anexos,
    omitidos: Array.isArray(e.anexos_omitidos) ? e.anexos_omitidos.length : 0,
  };
}

/** Os motivos pelos quais uma resposta de e-mail ficou na fila, e só eles têm aviso na bolha. */
export type MotivoDeAdiamento = "teto_diario" | "intervalo";

export function lerAdiamento(metadata: unknown): { motivo: MotivoDeAdiamento; ate: string } | null {
  const m = (metadata ?? {}) as Record<string, unknown>;
  const motivo = m.queued_reason;
  if ((motivo !== "teto_diario" && motivo !== "intervalo") || typeof m.adiar_ate !== "string") return null;
  return Number.isFinite(Date.parse(m.adiar_ate)) ? { motivo, ate: m.adiar_ate } : null;
}
