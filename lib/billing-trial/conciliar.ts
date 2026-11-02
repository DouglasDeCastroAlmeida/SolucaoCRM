/**
 * A conciliação do trial com cartão (mudança 003, AC-008.3 e AC-008.5), chamada pela rodada horária.
 *
 * O caso que a motivou (medido em 2/11/2026): a pessoa pagou no Checkout do Asaas, o retorno para o
 * app nunca voltou, o webhook não tem como achar a empresa (a linha ainda não conhece o cliente do
 * Asaas) e a conta ficou suspensa. A rodada procura as linhas `trial_com_cartao` ainda em
 * `pagamento_inicial_pendente`, acha a assinatura pelo id do checkout (ADR-007) e confirma pelo MESMO
 * `confirmarTrialDoCheckout`, que reativa pelo caminho único do `sincronizar`.
 *
 * Só confirma: assinatura que ainda não existe é silêncio (a pessoa pode estar pagando agora), e duas
 * assinaturas para o mesmo checkout NÃO são escolhidas — vira um aviso na Central da plataforma
 * (`incidents`, um por empresa) e o acesso fica exatamente como estava.
 */
import type { SupabaseClient } from "@supabase/supabase-js";

import { confirmarTrialDoCheckout, type DependenciasDoConfirmar } from "@/lib/billing-trial/confirmar";
import { idDoCheckoutDaUrl } from "@/lib/cobranca/checkout-id";
import { logger } from "@/lib/logger";

export const TIPO_DO_AVISO_DE_DIVERGENCIA = "cobranca.divergencia_nao_resolvida";

/** Por rodada: o resto fica para a próxima hora. */
export const LIMITE_DA_CONCILIACAO_DO_TRIAL = 50;
/** Checkout vencido há mais que isto já não será pago: sai da fila (a pessoa abre outro). */
const TOLERANCIA_DO_CHECKOUT_VENCIDO_MS = 7 * 24 * 3_600_000;

export interface ResumoDaConciliacaoDoTrial {
  confirmadas: number;
  reativadas: number;
  /** Avisos NOVOS abertos nesta rodada (o repetido não conta: rodada que só repete não audita). */
  divergencias: number;
  falhas: number;
}

interface Candidata {
  organization_id: string;
  checkout_provedor_id: string | null;
  checkout_url: string | null;
  checkout_expira_em: string | null;
}

export async function conciliarTrialsPendentes(
  admin: SupabaseClient,
  deps: DependenciasDoConfirmar = {},
): Promise<ResumoDaConciliacaoDoTrial> {
  const resumo: ResumoDaConciliacaoDoTrial = { confirmadas: 0, reativadas: 0, divergencias: 0, falhas: 0 };
  const agora = (deps.agora ?? (() => new Date()))().getTime();

  const { data, error } = await admin
    .from("cobranca_assinaturas")
    .select("organization_id, checkout_provedor_id, checkout_url, checkout_expira_em")
    .eq("trial_com_cartao", true)
    .eq("pagamento_inicial_pendente", true)
    .limit(LIMITE_DA_CONCILIACAO_DO_TRIAL);
  if (error) throw new Error(`cobranca: trials pendentes ilegíveis (${error.code ?? "sem_codigo"})`);

  const fila = ((data ?? []) as Candidata[]).filter((l) => {
    if ((l.checkout_provedor_id ?? idDoCheckoutDaUrl(l.checkout_url)) === null) return false;
    return l.checkout_expira_em === null || Date.parse(l.checkout_expira_em) > agora - TOLERANCIA_DO_CHECKOUT_VENCIDO_MS;
  });

  for (const { organization_id: orgId } of fila) {
    try {
      const r = await confirmarTrialDoCheckout(admin, { orgId, resultado: "ok", conciliacao: true }, deps);
      if (r.tipo === "confirmada" && r.primeiraVez) resumo.confirmadas += 1;
      if (r.tipo === "confirmada" && r.reativada) resumo.reativadas += 1;
      if (r.tipo === "provedor_fora" && r.motivo === "assinatura_ambigua" && (await avisarDivergencia(admin, orgId))) {
        resumo.divergencias += 1;
      }
    } catch (e) {
      resumo.falhas += 1;
      logger.error("cobranca.conciliacao_do_trial_falhou", { organization_id: orgId, erro: e instanceof Error ? e.name : "desconhecido" });
    }
  }
  return resumo;
}

/**
 * Um aviso por empresa, em qualquer situação (o resolvido não reabre sozinho). Leitura-antes-de-gravar,
 * como `nota.ts`: sob concorrência pode sair um aviso a mais, nunca um a menos. `true` = abriu agora.
 */
async function avisarDivergencia(admin: SupabaseClient, orgId: string): Promise<boolean> {
  const { data } = await admin.from("incidents").select("id").eq("organization_id", orgId).eq("type", TIPO_DO_AVISO_DE_DIVERGENCIA).limit(1);
  if (Array.isArray(data) && data.length > 0) return false;
  const { error } = await admin.from("incidents").insert({
    organization_id: orgId,
    type: TIPO_DO_AVISO_DE_DIVERGENCIA,
    severity: "warning",
    payload: { acao: "conferir_assinaturas_do_checkout", codigo: "assinatura_ambigua" },
  });
  if (error) {
    logger.warn("cobranca.aviso_de_divergencia_nao_gravado", { organization_id: orgId, codigo: error.code ?? null });
    return false;
  }
  return true;
}
