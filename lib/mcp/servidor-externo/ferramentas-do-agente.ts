/**
 * Editar as ferramentas de um servidor MCP externo POR AGENTE (mudança 006,
 * AC-007.2 e AC-007.4). Funções puras sobre `tool_ids` e `ai_agents.config`;
 * quem grava é a rota `/api/v1/mcp-servidores/[id]/ferramentas`.
 *
 * - "Ligada" não é coluna: é o id da ferramenta em `tool_ids` da versão
 *   RASCUNHO do agente (versão publicada é imutável; vale ao publicar).
 * - "Pode rodar sem aprovação" mora em `ai_agents.config.mcp_externo_liberadas`
 *   (ver `liberadas.ts`) e vale na hora, no modo automático.
 */
import { TETO_TOOLS_POR_AGENTE } from "@/lib/mcp/tools/selecao-por-pacote";

import { lerToolIdRemoto, SLUG_DO_SERVIDOR_PADRAO, toolIdRemoto, type MarcaRemota } from "./ids";
import { CHAVE_DAS_LIBERADAS, idsLiberadosDaConfig } from "./liberadas";

function ehDaFerramenta(id: string, servidor: string, nome: string): boolean {
  const escolha = lerToolIdRemoto(id);
  if (!escolha || escolha.nome !== nome) return false;
  return (escolha.servidor ?? SLUG_DO_SERVIDOR_PADRAO) === servidor;
}

export type ResultadoDeEdicao = { ok: true; toolIds: string[] } | { ok: false; motivo: "teto" };

/** `marca = null` desliga. Qualquer marca anterior da mesma ferramenta sai antes. */
export function alternarFerramenta(
  toolIds: readonly string[],
  servidor: string,
  nome: string,
  marca: MarcaRemota | null,
): ResultadoDeEdicao {
  const resto = toolIds.filter((id) => !ehDaFerramenta(id, servidor, nome));
  if (marca === null) return { ok: true, toolIds: resto };
  const novos = [...resto, toolIdRemoto(nome, marca, servidor)];
  // Trocar a marca de uma que já estava ligada não aumenta a lista.
  if (novos.length > TETO_TOOLS_POR_AGENTE && novos.length > toolIds.length) return { ok: false, motivo: "teto" };
  return { ok: true, toolIds: novos };
}

/** A marca com que a ferramenta está ligada no agente, ou `null` se está desligada. */
export function marcaDaFerramentaNoAgente(
  toolIds: readonly string[],
  servidor: string,
  nome: string,
): MarcaRemota | null {
  for (const id of toolIds) {
    if (!ehDaFerramenta(id, servidor, nome)) continue;
    return lerToolIdRemoto(id)!.leitura ? "leitura" : "escrita";
  }
  return null;
}

/** A ferramenta está marcada "pode rodar sem aprovação" nesta config? */
export function estaLiberada(config: unknown, servidor: string, nome: string): boolean {
  return idsLiberadosDaConfig(config).some((id) => ehDaFerramenta(id, servidor, nome));
}

/** Nova config com a marca ligada ou tirada; o resto da config é preservado. */
export function alternarLiberacao(
  config: unknown,
  servidor: string,
  nome: string,
  liberar: boolean,
): Record<string, unknown> {
  const base =
    config !== null && typeof config === "object" && !Array.isArray(config)
      ? { ...(config as Record<string, unknown>) }
      : {};
  const outros = idsLiberadosDaConfig(base).filter((id) => !ehDaFerramenta(id, servidor, nome));
  base[CHAVE_DAS_LIBERADAS] = liberar ? [...outros, toolIdRemoto(nome, "escrita", servidor)] : outros;
  return base;
}
