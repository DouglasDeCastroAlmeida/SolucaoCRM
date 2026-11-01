/**
 * O AVISO DE EXCLUSÃO A REVISAR (mudança 003, AC-005.6 — PARCIAL por decisão do dono).
 *
 * O acesso da conta cancelada termina na régua e os dados ficam preservados. Passados
 * 90 dias do fim do período pago (ou do fim do teste, para quem cancelou nele), a
 * plataforma recebe UM aviso para decidir se exclui. NADA é excluído nem anonimizado
 * aqui: a exclusão é decisão manual de quem administra a instalação, por
 * `excluirOrganizacao` (`lib/tenants/exclusao.ts`).
 *
 * O canal é `incidents` (cross-tenant, só o admin da plataforma lê, em Admin ›
 * Incidentes, com o nome da empresa vindo da relação): não pede schema novo. A
 * unicidade é "uma linha deste tipo por empresa, em qualquer situação" — resolvida a
 * linha, o aviso não volta. Uma única rodada de cron por vez grava; a leitura-antes-
 * de-gravar basta e o pior caso de corrida é um aviso a mais, nunca uma exclusão.
 * O payload leva só ids e datas — nenhum dado pessoal.
 */
import type { SupabaseClient } from "@supabase/supabase-js";

import { diaCivilEmSaoPaulo } from "@/lib/cobranca/regua";
import { logger } from "@/lib/logger";

export const PRAZO_DA_REVISAO_DE_EXCLUSAO_DIAS = 90;
export const TIPO_DO_AVISO_DE_EXCLUSAO = "cobranca.conta_cancelada_revisar_exclusao";

/** Estados da organização que já saíram de cena: não há o que revisar. */
const JA_REDIGIDAS = new Set(["redacted", "archived"]);

interface Cancelada {
  organization_id: string;
  proximo_vencimento: string | null;
  vencida_desde: string | null;
  trial_ate: string | null;
}

/** Quantos avisos novos foram gravados nesta rodada. */
export async function avisarContasParaRevisarExclusao(admin: SupabaseClient, agora: () => Date = () => new Date()): Promise<number> {
  const { data, error } = await admin
    .from("cobranca_assinaturas")
    .select("organization_id, proximo_vencimento, vencida_desde, trial_ate")
    .eq("estado", "cancelada")
    .not("organization_id", "is", null);
  if (error) throw new Error(`cobranca: canceladas ilegíveis (${error.code ?? "sem_codigo"})`);

  const hoje = diaCivilEmSaoPaulo(agora().getTime());
  const vencidas: Array<{ org: string; desde: string }> = [];
  for (const l of (data ?? []) as Cancelada[]) {
    // Fim do período pago; sem ele, o início da dívida de cancelamento (que para quem
    // cancelou no teste é `trial_ate`); por último o próprio fim do teste.
    const fim = l.proximo_vencimento ?? l.vencida_desde ?? l.trial_ate;
    if (fim === null) continue;
    if (hoje - diaCivilEmSaoPaulo(Date.parse(fim)) >= PRAZO_DA_REVISAO_DE_EXCLUSAO_DIAS) {
      vencidas.push({ org: l.organization_id, desde: fim });
    }
  }
  if (vencidas.length === 0) return 0;
  const ids = vencidas.map((v) => v.org);

  const { data: orgs, error: erroDasOrgs } = await admin.from("organizations").select("id, status").in("id", ids);
  if (erroDasOrgs) throw new Error(`cobranca: empresas ilegíveis (${erroDasOrgs.code ?? "sem_codigo"})`);
  const vivas = new Set(((orgs ?? []) as Array<{ id: string; status: string }>).filter((o) => !JA_REDIGIDAS.has(o.status)).map((o) => o.id));

  const { data: ja, error: erroDosAvisos } = await admin
    .from("incidents")
    .select("organization_id")
    .eq("type", TIPO_DO_AVISO_DE_EXCLUSAO)
    .in("organization_id", ids);
  if (erroDosAvisos) throw new Error(`cobranca: avisos de exclusão ilegíveis (${erroDosAvisos.code ?? "sem_codigo"})`);
  const jaAvisadas = new Set(((ja ?? []) as Array<{ organization_id: string }>).map((i) => i.organization_id));

  const novos = vencidas
    .filter((v) => vivas.has(v.org) && !jaAvisadas.has(v.org))
    .map((v) => ({
      organization_id: v.org,
      type: TIPO_DO_AVISO_DE_EXCLUSAO,
      severity: "info",
      payload: { acao: "revisar_exclusao", desde: v.desde, dias: PRAZO_DA_REVISAO_DE_EXCLUSAO_DIAS },
    }));
  if (novos.length === 0) return 0;

  const { error: erroDaGravacao } = await admin.from("incidents").insert(novos);
  if (erroDaGravacao) {
    logger.warn("cobranca.aviso_de_exclusao_nao_gravado", { codigo: erroDaGravacao.code ?? null, empresas: novos.length });
    return 0;
  }
  return novos.length;
}
