/**
 * A marca "pode rodar sem aprovação" de uma ferramenta de ESCRITA de servidor
 * MCP externo (mudança 006, AC-007.4; decisão do dono: sem migration).
 *
 * Mora em `ai_agents.config.mcp_externo_liberadas`: lista de ids de ferramenta
 * (`mcp_externo:<servidor>:escrita:<nome>`), POR AGENTE. Só quem grava é a rota
 * `/api/v1/mcp-servidores/[id]/ferramentas`, com confirmação explícita; o PATCH
 * do agente descarta a chave (o schema de config não a conhece) e preserva a
 * que já está gravada.
 *
 * Os dois montadores de turno (runtime nativo e motor) leem por aqui e passam
 * ao controle de aprovação os NOMES expostos ao modelo. A marca só vale se a
 * ferramenta está ligada no agente e é de escrita: leitura não precisa dela, e
 * ferramenta desligada não monta.
 */
import { lerToolIdRemoto, SLUG_DO_SERVIDOR_PADRAO, toolIdRemoto } from "./ids";
import type { FerramentaDoAgente } from "./repositorio";

export const CHAVE_DAS_LIBERADAS = "mcp_externo_liberadas";

/** Os ids de escrita gravados na config do agente; qualquer outra coisa é ignorada. */
export function idsLiberadosDaConfig(config: unknown): string[] {
  if (config === null || typeof config !== "object") return [];
  const bruto = (config as Record<string, unknown>)[CHAVE_DAS_LIBERADAS];
  if (!Array.isArray(bruto)) return [];
  return bruto.filter((id): id is string => {
    if (typeof id !== "string") return false;
    const escolha = lerToolIdRemoto(id);
    return escolha !== null && !escolha.leitura;
  });
}

/** Nomes expostos ao modelo das ferramentas ligadas, de escrita e marcadas pelo admin. */
export function nomesLiberadosParaOTurno(
  ligadas: readonly FerramentaDoAgente[] | undefined,
  config: unknown,
): string[] {
  if (!ligadas || ligadas.length === 0) return [];
  const liberados = new Set(idsLiberadosDaConfig(config));
  if (liberados.size === 0) return [];
  return ligadas
    .filter((f) => {
      if (f.escolha.leitura) return false;
      // O id antigo (sem servidor) aponta para o servidor `padrao`: a marca gravada
      // com o slug e a gravada no formato antigo valem para a mesma ferramenta.
      const servidor = f.escolha.servidor ?? SLUG_DO_SERVIDOR_PADRAO;
      return (
        liberados.has(toolIdRemoto(f.escolha.nome, "escrita", servidor)) ||
        (f.escolha.servidor === undefined && liberados.has(toolIdRemoto(f.escolha.nome, "escrita")))
      );
    })
    .map((f) => f.nomeExposto);
}
