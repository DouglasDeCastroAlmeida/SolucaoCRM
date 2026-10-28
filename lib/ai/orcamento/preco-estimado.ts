/**
 * PREÇO ESTIMADO PARA O MODELO QUE NÃO TEM PREÇO CONHECIDO (mudança 006, AC-004.6).
 *
 * Modelo fora da tabela do motor e do catálogo da instalação gravava custo
 * NULL, e a régua do teto soma `coalesce(cost_cents, 0)`: o gasto medido era
 * zero e o teto nunca disparava. Aqui o custo ausente ganha uma ESTIMATIVA
 * conservadora — acima do que o modelo provavelmente custa —, porque errar para
 * cima apenas para o agente cedo (o admin vê "estimado" e ajusta o teto), e
 * errar para baixo é o dinheiro saindo sem proteção.
 *
 * ⚠️ Estimativa nunca é preço. Todo resultado daqui carrega `estimado: true`, e
 * quem mostra o número tem de dizer "estimado". O custo CONHECIDO (inclusive o
 * zero de um modelo gratuito de verdade) passa intacto e sem a marca.
 *
 * Unidade: centavos de DÓLAR, fracionados (como `llm_calls.cost_cents`). Sem
 * I/O: o chamador diz se o custo é conhecido (`number`) ou não (`null`).
 */
import type { TokenUsage } from "@/lib/agent-engine/edge/llm/pricing";

export interface PrecoEstimado {
  /** Centavos de dólar por milhão de tokens. */
  entradaCentsPorMilhao: number;
  saidaCentsPorMilhao: number;
}

/**
 * US$ 20 por milhão de entrada e US$ 100 por milhão de saída: acima do modelo
 * mais caro da tabela do motor (US$ 5/25 no Opus de hoje, US$ 15/75 nas
 * gerações antigas). O cache entra pelo preço cheio da entrada — não há
 * desconto presumido para modelo que não conhecemos.
 */
export const PRECO_ESTIMADO_PADRAO: PrecoEstimado = {
  entradaCentsPorMilhao: 2000,
  saidaCentsPorMilhao: 10000,
};

export interface CustoComOrigem {
  costCents: number;
  /** `true` = número estimado, nunca preço real. */
  estimado: boolean;
}

/** A estimativa pura para um uso de tokens. Sempre `estimado: true`. */
export function estimarCusto(
  usage: Pick<TokenUsage, "inputTokens" | "outputTokens">,
  preco: PrecoEstimado = PRECO_ESTIMADO_PADRAO,
): CustoComOrigem {
  const costCents =
    (usage.inputTokens * preco.entradaCentsPorMilhao +
      usage.outputTokens * preco.saidaCentsPorMilhao) /
    1_000_000;
  return { costCents, estimado: true };
}

/**
 * O custo que vale: o conhecido, se houver; senão a estimativa marcada.
 * `null` é "não sei" e é o único valor que dispara a estimativa — `0` é de graça
 * de verdade.
 */
export function custoOuEstimativa(
  conhecido: number | null,
  usage: Pick<TokenUsage, "inputTokens" | "outputTokens">,
  preco: PrecoEstimado = PRECO_ESTIMADO_PADRAO,
): CustoComOrigem {
  if (conhecido !== null) return { costCents: conhecido, estimado: false };
  return estimarCusto(usage, preco);
}
