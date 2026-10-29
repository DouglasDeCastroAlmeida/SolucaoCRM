/**
 * O USO DE IA DO PERÍODO, POR AGENTE E TOTAL (mudança 006, AC-004.4 e AC-004.6).
 *
 * A soma é feita no banco (`fn_uso_de_ia`, uma chamada por agente mais uma para o
 * total), nunca em JS sobre linhas: o PostgREST corta em 1000 linhas e o número
 * de um mês cheio sairia menor que o real.
 *
 * ESTIMADO: o custo gravado em `llm_calls` para modelo sem preço conhecido é a
 * estimativa conservadora de `preco-estimado.ts` (sem coluna que a marque por
 * linha), então a marca é CALCULADA na leitura — um agente é "estimado" quando
 * usou, no período, algum modelo que não tem preço na tabela do motor nem no
 * catálogo da instalação. Nunca se mostra estimativa como preço real.
 */
import { temPrecoNoMotor } from "@/lib/agent-engine/edge/llm/pricing";
import { candidatosDeId } from "@/lib/agent-engine/edge/llm/pricing-do-catalogo";

export interface AgregadoDeUso {
  custo_cents: number;
  input_tokens: number;
  output_tokens: number;
}

export interface LinhaDeUsoDoPeriodo {
  /** `null` na linha do total. */
  agentId: string | null;
  nome: string;
  /** Entrada + saída (a entrada já inclui a parte lida do cache). */
  tokens: number;
  /** Centavos de DÓLAR, fracionado como `llm_calls.cost_cents`. */
  custoCents: number;
  estimado: boolean;
}

export interface UsoDoPeriodo {
  /** `null` = sem teto configurado. */
  tetoCents: number | null;
  total: LinhaDeUsoDoPeriodo;
  porAgente: LinhaDeUsoDoPeriodo[];
  /** A leitura dos modelos usados não esgotou o mês: o selo é conservador. */
  possivelmenteEstimado: boolean;
}

export interface EntradaDoUso {
  tetoCents: number;
  total: AgregadoDeUso;
  agentes: Array<{ id: string; nome: string; uso: AgregadoDeUso }>;
  agentesComModeloSemPreco: ReadonlySet<string>;
  algumModeloSemPreco: boolean;
  possivelmenteEstimado?: boolean;
}

export function montarUsoDoPeriodo(e: EntradaDoUso): UsoDoPeriodo {
  const duvida = e.possivelmenteEstimado === true;
  return {
    possivelmenteEstimado: duvida,
    tetoCents: e.tetoCents > 0 ? e.tetoCents : null,
    total: {
      agentId: null,
      nome: "",
      tokens: e.total.input_tokens + e.total.output_tokens,
      custoCents: e.total.custo_cents,
      estimado: e.algumModeloSemPreco || duvida,
    },
    porAgente: e.agentes.map((a) => ({
      agentId: a.id,
      nome: a.nome,
      tokens: a.uso.input_tokens + a.uso.output_tokens,
      custoCents: a.uso.custo_cents,
      estimado: e.agentesComModeloSemPreco.has(a.id) || (duvida && a.uso.custo_cents > 0),
    })),
  };
}

export interface LinhaDoCatalogo {
  model_id: string;
  input_price_per_million_cents: number | string | null;
  output_price_per_million_cents: number | string | null;
}

/** Os candidatos de id de todos os modelos, para uma ida só ao catálogo. */
export function candidatosDosModelos(modelos: readonly string[]): string[] {
  return [...new Set(modelos.flatMap((m) => candidatosDeId(m)))];
}

/**
 * Os modelos, dentre `modelos`, sem preço conhecido: fora da tabela do motor e
 * sem linha de catálogo com ALGUM preço (linha com as duas taxas nulas é "conhece
 * o modelo e não sabe o preço" - não conta).
 */
export function modelosSemPrecoConhecido(
  modelos: readonly string[],
  catalogo: readonly LinhaDoCatalogo[],
): Set<string> {
  const comPreco = new Set(
    catalogo
      .filter((l) => l.input_price_per_million_cents !== null || l.output_price_per_million_cents !== null)
      .map((l) => l.model_id),
  );
  const sem = new Set<string>();
  for (const m of new Set(modelos)) {
    if (temPrecoNoMotor(m)) continue;
    if (candidatosDeId(m).some((c) => comPreco.has(c))) continue;
    sem.add(m);
  }
  return sem;
}
