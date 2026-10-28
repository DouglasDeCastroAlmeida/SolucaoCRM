/**
 * Lê do banco o uso de IA do MÊS corrente, por agente e total (AC-004.4).
 *
 * Roda com o cliente da SESSÃO: `fn_uso_de_ia` é `security invoker` e a RLS
 * isola a organização; `p_org` é defesa em profundidade. Falha de leitura
 * devolve `null` e a tela omite a seção — número inventado é pior que ausência.
 *
 * Limite conhecido: a marca "estimado" olha as 1000 chamadas mais recentes do
 * mês (o teto de linhas do PostgREST), não todas. Em instalação de altíssimo
 * volume um modelo sem preço usado só no começo do mês pode não aparecer; o
 * conserto exato é uma função de agregação no banco (migration), item à parte.
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

    const { data: chamadas, error: erroDasChamadas } = await supabase
      .from("llm_calls")
      .select("agent_id, model")
      .eq("organization_id", e.organizationId)
      .gte("created_at", desde)
      .order("created_at", { ascending: false })
      .limit(1000);
    if (erroDasChamadas) throw new Error(erroDasChamadas.message);
    const linhas = (chamadas ?? []) as Array<{ agent_id: string | null; model: string }>;

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
    });
  } catch (err) {
    logger.warn("ai_usage.por_agente_falhou", {
      organization_id: e.organizationId,
      error: err instanceof Error ? err.message : "desconhecido",
    });
    return null;
  }
}
