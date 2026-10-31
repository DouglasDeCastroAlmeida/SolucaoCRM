/**
 * Leituras e a reativação que as rotas do dono da cobrança compartilham
 * (`app/api/v1/admin/tenants/[id]/assinatura/**` e `app/api/v1/admin/tenants`).
 *
 * O cliente entra por parâmetro: é o de serviço, porque o painel de plataforma
 * opera várias empresas. O portão de escrita NÃO mora aqui, de propósito: a
 * cerca `admin-escrita-exige-scope-full` só enxerga `requirePlatformAdminEscrita`
 * chamado no próprio arquivo da rota.
 */
import type { SupabaseClient } from "@supabase/supabase-js";

import { lerEscopoDoCadastro } from "@/lib/cobranca/cadastro";
import { logger } from "@/lib/logger";
import { ehOperante, type TipoDeSuspensao } from "@/lib/organizacao/operante";

export interface OrgDoTenant {
  id: string;
  status: string;
  suspended_kind: string | null;
  /** A marca da empresa (`organizations.brand_id`); nulo = a marca padrão. */
  brand_id?: string | null;
}
export interface PlanoLido {
  id: string;
  intervalo: string;
  trial_dias: number;
  max_assentos: number | null;
  max_canais: number | null;
  arquivado_em: string | null;
  /** Dono do plano: nulo = a instalação; senão, a marca (ADR-002). */
  brand_id?: string | null;
}

/** `"erro"` = o banco não respondeu; `null` = não existe. */
export async function lerOrgDoTenant(db: SupabaseClient, id: string): Promise<OrgDoTenant | null | "erro"> {
  const { data, error } = await db.from("organizations").select("id, status, suspended_kind, brand_id").eq("id", id).maybeSingle();
  if (error) return "erro";
  return (data as OrgDoTenant | null) ?? null;
}

/** O plano, arquivado ou não: quem chama decide. `"erro"` = o banco não respondeu. */
export async function lerPlano(db: SupabaseClient, id: string): Promise<PlanoLido | null | "erro"> {
  const { data, error } = await db
    .from("cobranca_planos")
    .select("id, intervalo, trial_dias, max_assentos, max_canais, arquivado_em, brand_id")
    .eq("id", id)
    .maybeSingle();
  if (error) return "erro";
  return (data as PlanoLido | null) ?? null;
}

/**
 * O plano serve a esta empresa? Os da instalação (`brand_id` nulo) servem a quem
 * a marca NÃO cobra; os da marca servem só às empresas dela, quando ela cobra.
 * Nunca se misturam. `null` no escopo = a leitura da marca falhou (recusa).
 */
export async function planoServeAEmpresa(
  db: SupabaseClient,
  plano: Pick<PlanoLido, "brand_id">,
  org: Pick<OrgDoTenant, "brand_id">,
): Promise<boolean | null> {
  const escopo = await lerEscopoDoCadastro(db, org.brand_id ?? null);
  if (!escopo) return null;
  return (plano.brand_id ?? null) === escopo.brandId;
}

const KIND_DE_COBRANCA: TipoDeSuspensao = "cobranca";

/**
 * "Dar prazo" e "Tornar isenta" reativam na hora quem a cobrança suspendeu
 * (D-6). Só chama a função se a suspensão é de cobrança. A própria função
 * recusa os outros tipos (`p_kind_exigido`), e a administrativa nunca sai por
 * aqui. `null` = a função falhou.
 */
export async function reativarSeSuspensaPorCobranca(
  db: SupabaseClient,
  org: OrgDoTenant,
  ator: string,
): Promise<{ reativada: boolean } | null> {
  if (ehOperante(org.status) || org.suspended_kind !== KIND_DE_COBRANCA) return { reativada: false };
  const { data, error } = await db.rpc("fn_reativar_organizacao", {
    p_org: org.id,
    p_kind_exigido: KIND_DE_COBRANCA,
    p_ator: ator,
  });
  if (error) {
    logger.error("cobrança: reativação da empresa falhou", { org: org.id, codigo: error.code });
    return null;
  }
  return { reativada: (data as { changed?: unknown } | null)?.changed === true };
}
