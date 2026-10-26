/**
 * O que o app faz ANTES de pedir ao GoTrue um e-mail de acesso (ADR-003):
 *
 *  1. grava `brand_email_context` (e-mail, ação, marca) — é por ela que o gancho
 *     `/api/hooks/auth/send-email` sabe de que marca é o e-mail;
 *  2. reserva o envio: no máximo um por (e-mail, ação) a cada 60 s. Clique duplo,
 *     ou tentar de novo logo depois de uma falha, não gera dois e-mails (AC-006.3).
 *
 * A reserva é um compare-and-swap em `last_sent_at`: dois pedidos simultâneos
 * leem o mesmo valor e só um consegue trocá-lo. Falha do banco NUNCA bloqueia o
 * usuário (devolve `liberado`, sem trava): o contexto é um enriquecimento, e o
 * GoTrue tem o limite dele por usuário.
 */
import { logger } from "@/lib/logger";
import { createAdminClient } from "@/lib/supabase/admin";

export const TRAVA_DE_REENVIO_SEGUNDOS = 60;

export interface BancoDoContexto {
  gravarContexto(e: { email: string; action: string; brandId: string }): Promise<void>;
  ultimoEnvio(email: string, action: string): Promise<string | null>;
  /** `true` se trocou `esperado` (pode ser `null`) por `agoraIso`. */
  marcarEnvio(email: string, action: string, esperado: string | null, agoraIso: string): Promise<boolean>;
}

export const bancoDoContexto: BancoDoContexto = {
  async gravarContexto({ email, action, brandId }) {
    // O upsert só envia estas colunas: `last_sent_at` de uma linha existente fica.
    const { error } = await createAdminClient()
      .from("brand_email_context")
      .upsert({ email, action, brand_id: brandId }, { onConflict: "email,action" });
    if (error) throw new Error(`brand_email_context: ${error.code ?? "erro"}`);
  },

  async ultimoEnvio(email, action) {
    const { data, error } = await createAdminClient()
      .from("brand_email_context")
      .select("last_sent_at")
      .eq("email", email)
      .eq("action", action)
      .maybeSingle();
    if (error) throw new Error(`brand_email_context: ${error.code ?? "erro"}`);
    return (data?.last_sent_at as string | null | undefined) ?? null;
  },

  async marcarEnvio(email, action, esperado, agoraIso) {
    const base = createAdminClient()
      .from("brand_email_context")
      .update({ last_sent_at: agoraIso })
      .eq("email", email)
      .eq("action", action);
    const { data, error } = await (esperado === null ? base.is("last_sent_at", null) : base.eq("last_sent_at", esperado)).select("email");
    if (error) throw new Error(`brand_email_context: ${error.code ?? "erro"}`);
    return (data?.length ?? 0) > 0;
  },
};

export type ResultadoDaReserva = "liberado" | "travado";

export async function reservarEnvioDeAcesso(
  e: { email: string; acao: string; brandId: string },
  deps: { banco: BancoDoContexto; agoraMs: () => number } = { banco: bancoDoContexto, agoraMs: () => Date.now() },
): Promise<ResultadoDaReserva> {
  // A marca embutida (banco fora do ar ou chave desligada) não tem linha: nada a gravar.
  if (e.brandId === "padrao-embutida") return "liberado";
  const email = e.email.trim().toLowerCase();
  try {
    await deps.banco.gravarContexto({ email, action: e.acao, brandId: e.brandId });
    const anterior = await deps.banco.ultimoEnvio(email, e.acao);
    const agora = deps.agoraMs();
    if (anterior !== null && agora - Date.parse(anterior) < TRAVA_DE_REENVIO_SEGUNDOS * 1000) return "travado";
    return (await deps.banco.marcarEnvio(email, e.acao, anterior, new Date(agora).toISOString())) ? "liberado" : "travado";
  } catch (erro) {
    logger.warn("contexto de e-mail: não deu para gravar/reservar; segue sem trava", {
      detalhe: erro instanceof Error ? erro.message : String(erro),
    });
    return "liberado";
  }
}
