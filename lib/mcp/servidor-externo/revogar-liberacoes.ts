/**
 * Tira a marca "pode rodar sem aprovação" (`ai_agents.config.mcp_externo_liberadas`) das ferramentas
 * de UM servidor MCP externo, em todos os agentes de UMA organização (mudança 006, M2).
 *
 * Quem usa: "atualizar ferramentas". O admin adota o que o servidor anuncia agora, e uma ferramenta
 * de escrita que já rodava sozinha continuaria rodando com a descrição e o esquema NOVOS, que ninguém
 * conferiu. Revogar a marca das alteradas e das removidas faz a ferramenta voltar a pedir aprovação.
 *
 * O serviço usa a chave que ignora a RLS: todo acesso filtra `organization_id`, que vem da sessão.
 * O resto da config do agente é preservado (`alternarLiberacao`).
 */
import type { SupabaseClient } from "@supabase/supabase-js";

import { alternarLiberacao, estaLiberada } from "./ferramentas-do-agente";

export interface RevogacaoDeLiberacoes {
  /** Quantos agentes tiveram ao menos uma marca tirada. */
  agentes: number;
  /** Nomes (sem repetir) das ferramentas que voltaram a pedir aprovação em algum agente. */
  ferramentas: string[];
}

export async function revogarLiberacoesDasFerramentas(
  supabase: SupabaseClient,
  organizationId: string,
  servidorSlug: string,
  nomes: readonly string[],
): Promise<RevogacaoDeLiberacoes> {
  const vazio: RevogacaoDeLiberacoes = { agentes: 0, ferramentas: [] };
  if (nomes.length === 0) return vazio;

  const { data, error } = await supabase.from("ai_agents").select("id, config").eq("organization_id", organizationId);
  if (error || !data) throw new Error("revogacao de liberacoes: nao foi possivel ler os agentes");

  const afetadas = new Set<string>();
  let agentes = 0;
  for (const agente of data as Array<{ id: string; config: unknown }>) {
    const marcadas = nomes.filter((nome) => estaLiberada(agente.config, servidorSlug, nome));
    if (marcadas.length === 0) continue;
    const config = marcadas.reduce<unknown>(
      (atual, nome) => alternarLiberacao(atual, servidorSlug, nome, false),
      agente.config,
    ) as Record<string, unknown>;

    const { error: erroDeGravacao } = await supabase
      .from("ai_agents")
      .update({ config })
      .eq("id", agente.id)
      .eq("organization_id", organizationId);
    if (erroDeGravacao) throw new Error("revogacao de liberacoes: nao foi possivel gravar a config do agente");

    agentes += 1;
    for (const nome of marcadas) afetadas.add(nome);
  }
  return { agentes, ferramentas: [...afetadas] };
}
