/**
 * Lê do banco o uso de IA do MÊS corrente, por agente e total (AC-004.4).
 *
 * Roda com o cliente da SESSÃO: `fn_uso_de_ia` é `security invoker` e a RLS
 * isola a organização; `p_org` é defesa em profundidade. Falha de leitura
 * devolve `null` e a tela omite a seção — número inventado é pior que ausência.
 *
 * A marca "estimado" precisa saber QUAIS modelos o mês usou. As chamadas são lidas
 * por páginas de 1000 (o teto de linhas do PostgREST) até esgotar o mês, com
 * limite de `MAX_PAGINAS`. Se o limite for atingido sem esgotar, a leitura é
 * incompleta e a tela NÃO omite o selo na dúvida: total e agentes com custo
 * ficam "estimado" e `possivelmenteEstimado` pede a nota "pode incluir
 * estimativa". Sem migration; a agregação exata no banco seria item à parte.
 */
import type { SupabaseClient } from "@supabase/supabase-js";

import { logger } from "@/lib/logger";

import { usoDeIaSchema } from "../usage/aggregate";
import {
  candidatosDosModelos,
  modelosSemPrecoConhecido,
  montarUsoDoPeriodo,
  type LinhaDoCatalogo,
  type UsoDoPeriodo,
} from "./uso-por-agente";

/** 10 páginas = 10 mil chamadas lidas no mês; acima disso vale o selo conservador. */
const TAMANHO_DA_PAGINA = 1000;
const MAX_PAGINAS = 10;

export interface EntradaDaLeitura {
  organizationId: string;
  agentes: ReadonlyArray<{ id: string; name: string }>;
  tetoCents: number;
  agora?: Date;
}

export async function carregarUsoDoPeriodo(
  supabase: SupabaseClient,
  e: EntradaDaLeitura,
): Promise<UsoDoPeriodo | null> {
  const agora = e.agora ?? new Date();
  const desde = new Date(Date.UTC(agora.getUTCFullYear(), agora.getUTCMonth(), 1)).toISOString();
  const ate = agora.toISOString();

  try {
    const ler = async (agentId?: string) => {
      const { data, error } = await supabase.rpc("fn_uso_de_ia", {
        p_org: e.organizationId,
        p_desde: desde,
        p_ate: ate,
        p_agent_id: agentId,
      });
      if (error) throw new Error(error.message);
      const lido = usoDeIaSchema.safeParse(data);
      if (!lido.success) throw new Error("formato inesperado");
      return lido.data.totais;
    };

    const [total, ...porAgente] = await Promise.all([ler(), ...e.agentes.map((a) => ler(a.id))]);
    if (total === undefined) return null;

    const linhas: Array<{ agent_id: string | null; model: string }> = [];
    let esgotou = false;
    for (let pagina = 0; pagina < MAX_PAGINAS && !esgotou; pagina += 1) {
      const { data, error } = await supabase
        .from("llm_calls")
        .select("agent_id, model")
        .eq("organization_id", e.organizationId)
        .gte("created_at", desde)
        .order("created_at", { ascending: false })
        .range(pagina * TAMANHO_DA_PAGINA, (pagina + 1) * TAMANHO_DA_PAGINA - 1);
      if (error) throw new Error(error.message);
      const lote = (data ?? []) as Array<{ agent_id: string | null; model: string }>;
      linhas.push(...lote);
      esgotou = lote.length < TAMANHO_DA_PAGINA;
    }
    const possivelmenteEstimado = !esgotou;

    const modelos = [...new Set(linhas.map((l) => l.model))];
    let catalogo: LinhaDoCatalogo[] = [];
    if (modelos.length > 0) {
      const { data, error } = await supabase
        .from("ai_models")
        .select("model_id, input_price_per_million_cents, output_price_per_million_cents")
        .in("model_id", candidatosDosModelos(modelos))
        .limit(1000);
      if (error) throw new Error(error.message);
      catalogo = (data ?? []) as LinhaDoCatalogo[];
    }
    const semPreco = modelosSemPrecoConhecido(modelos, catalogo);
    const agentesComModeloSemPreco = new Set(
      linhas.filter((l) => l.agent_id !== null && semPreco.has(l.model)).map((l) => l.agent_id as string),
    );

    return montarUsoDoPeriodo({
      tetoCents: e.tetoCents,
      total,
      agentes: e.agentes.map((a, i) => ({
        id: a.id,
        nome: a.name,
        uso: porAgente[i] ?? { custo_cents: 0, input_tokens: 0, output_tokens: 0 },
      })),
      agentesComModeloSemPreco,
      algumModeloSemPreco: semPreco.size > 0,
      possivelmenteEstimado,
    });
  } catch (err) {
    logger.warn("ai_usage.por_agente_falhou", {
      organization_id: e.organizationId,
      error: err instanceof Error ? err.message : "desconhecido",
    });
    return null;
  }
}
