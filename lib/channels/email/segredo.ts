/**
 * A senha da caixa de e-mail (mudança 005, ADR-005).
 *
 * Cifrada com o mesmo mecanismo dos segredos de canal e de webhook
 * (`encryptWebhookSecret`), e guardada em `email_credenciais` — tabela que nenhum papel
 * de cliente alcança (a 0727 revoga tudo de anon e authenticated). Ela NÃO vai para
 * `channel_sessions`, que concede SELECT da tabela inteira a authenticated.
 *
 * Regras que este módulo carrega:
 * - sem a chave de cifra, a senha não é gravada: nunca "em claro como alternativa";
 * - toda consulta leva `organization_id` à mão (o client é de service role);
 * - a senha não é logada aqui, nem em caminho de falha;
 * - decifrar só acontece no servidor, no momento de conectar. A tela, a API, a
 *   auditoria e o Sentry só conhecem `ultimosQuatro`.
 */
import type { SupabaseClient } from "@supabase/supabase-js";

import { logger } from "@/lib/logger";
import { decryptWebhookSecret, encryptWebhookSecret } from "@/lib/webhooks/secrets";

const TABELA = "email_credenciais";

/**
 * Os 4 últimos caracteres, para a pessoa reconhecer QUAL senha está guardada. Numa senha
 * curta quatro caracteres já são parte grande dela: abaixo de 8, não mostra nada.
 */
export function ultimosQuatro(senha: string): string {
  return senha.length >= 8 ? senha.slice(-4) : "";
}

export type ResultadoDaGravacao = { ok: true } | { ok: false; motivo: "cifra_indisponivel" | "gravacao_falhou" };

export async function gravarSenhaDaCaixa(
  admin: SupabaseClient,
  input: { organizationId: string; channelSessionId: string; senha: string },
): Promise<ResultadoDaGravacao> {
  const cifrada = await encryptWebhookSecret(admin, input.senha);
  if (!cifrada) return { ok: false, motivo: "cifra_indisponivel" };

  const agora = new Date().toISOString();
  const { data: atualizadas, error: erroDeUpdate } = await admin
    .from(TABELA)
    .update({ senha_encrypted: cifrada, updated_at: agora })
    .eq("organization_id", input.organizationId)
    .eq("channel_session_id", input.channelSessionId)
    .select("channel_session_id");
  if (erroDeUpdate) {
    logger.warn("[email.segredo] atualizar a credencial falhou", { code: erroDeUpdate.code ?? null });
    return { ok: false, motivo: "gravacao_falhou" };
  }
  if ((atualizadas ?? []).length > 0) return { ok: true };

  const { error } = await admin.from(TABELA).insert({
    organization_id: input.organizationId,
    channel_session_id: input.channelSessionId,
    senha_encrypted: cifrada,
    updated_at: agora,
  });
  if (error) {
    logger.warn("[email.segredo] gravar a credencial falhou", { code: error.code ?? null });
    return { ok: false, motivo: "gravacao_falhou" };
  }
  return { ok: true };
}

/** A senha em claro, só para quem vai conectar agora. `null` se não há, ou se não decifra. */
export async function lerSenhaDaCaixa(
  admin: SupabaseClient,
  input: { organizationId: string; channelSessionId: string },
): Promise<string | null> {
  const { data, error } = await admin
    .from(TABELA)
    .select("senha_encrypted")
    .eq("organization_id", input.organizationId)
    .eq("channel_session_id", input.channelSessionId)
    .maybeSingle();
  if (error || !data) return null;
  const cifrada = (data as { senha_encrypted?: string | null }).senha_encrypted;
  if (!cifrada) return null;
  return decryptWebhookSecret(admin, cifrada);
}
