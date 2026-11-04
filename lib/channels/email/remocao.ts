/**
 * Remover uma caixa de e-mail (mudança 005, REQ-008): a leitura e o envio acabam, a senha
 * guardada é apagada, e a linha da caixa é ARQUIVADA, nunca apagada.
 *
 * Arquivar é o mesmo caminho dos outros canais (`channel_sessions.archived_at`): as conversas e
 * mensagens apontam para a caixa com ON DELETE RESTRICT e continuam intactas. Reconectar o mesmo
 * endereço ressuscita a linha (`acharCaixaPorEndereco` + `reactivateChannelSession`), que pede a
 * senha de novo e posiciona o cursor no fim da caixa.
 *
 * A senha sai ANTES do arquivamento: se o arquivamento falhar, a caixa segue ativa (sem senha, ela
 * se pausa sozinha como `senha_ausente` e a pessoa pode tentar remover de novo). O inverso deixaria
 * uma senha guardada numa caixa que a tela já não mostra.
 *
 * Client de service role: toda consulta leva `organization_id` à mão.
 */
import type { SupabaseClient } from "@supabase/supabase-js";

import { resolverAvisoSenhaRecusada } from "./avisos";
import { acharCaixa } from "./caixa";

export type ResultadoDaRemocao = { resultado: "removida"; endereco: string } | { resultado: "nao_encontrada" };

export interface DependenciasDaRemocao {
  resolverAviso?: typeof resolverAvisoSenhaRecusada;
  agora?: () => Date;
}

export async function removerCaixa(
  admin: SupabaseClient,
  organizationId: string,
  caixaId: string,
  deps: DependenciasDaRemocao = {},
): Promise<ResultadoDaRemocao> {
  const caixa = await acharCaixa(admin, organizationId, caixaId);
  if (!caixa) return { resultado: "nao_encontrada" };

  const { error: erroDaSenha } = await admin
    .from("email_credenciais")
    .delete()
    .eq("organization_id", organizationId)
    .eq("channel_session_id", caixaId);
  if (erroDaSenha) throw new Error(`email_caixa_remocao_failed: senha ${erroDaSenha.code ?? ""}`.trim());

  const agora = (deps.agora ?? (() => new Date()))().toISOString();
  const { error } = await admin
    .from("channel_sessions")
    .update({ archived_at: agora, status: "STOPPED", last_status_change_at: agora })
    .eq("organization_id", organizationId)
    .eq("provider", "email")
    .eq("id", caixaId)
    .is("archived_at", null);
  if (error) throw new Error(`email_caixa_remocao_failed: arquivar ${error.code ?? ""}`.trim());

  // Best-effort: o aviso aberto aponta para uma caixa que a tela já não mostra.
  try {
    await (deps.resolverAviso ?? resolverAvisoSenhaRecusada)(admin, organizationId, caixaId);
  } catch {
    // a remoção já aconteceu; o aviso velho some na próxima varredura da Central
  }
  return { resultado: "removida", endereco: caixa.endereco };
}
