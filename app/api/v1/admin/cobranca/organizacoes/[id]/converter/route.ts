/**
 * POST /api/v1/admin/cobranca/organizacoes/{id}/converter — converte uma
 * organização de cortesia (sem assinatura) em cobrada (mudança 003, AC-002.3).
 *
 * Só admin da plataforma com escrita, `requireSupportWrite(` antes do efeito
 * (AC-009.4), auditoria `cobranca.org_convertida`. A organização vem do path e a
 * marca é lida do banco, nunca do corpo.
 */
import { randomUUID } from "node:crypto";
import { type NextRequest } from "next/server";
import { z } from "zod";

import { audit } from "@/lib/audit";
import { fail, ok } from "@/lib/api/wrappers";
import { falhaDaEscritaDePlatformAdmin, requirePlatformAdminEscrita, type PlatformAdminContext } from "@/lib/auth/requirePlatformAdmin";
import { converterCortesia } from "@/lib/cobranca/converter";
import { requireSupportWrite } from "@/lib/impersonate/support";
import { logger } from "@/lib/logger";
import { createAdminClient } from "@/lib/supabase/admin";

type Ctx = { params: Promise<{ id: string }> };

export async function POST(_req: NextRequest, { params }: Ctx) {
  const supportDenied = await requireSupportWrite();
  if (supportDenied) return supportDenied;

  const requestId = randomUUID();
  let ctx: PlatformAdminContext;
  try {
    ctx = await requirePlatformAdminEscrita();
  } catch (err) {
    return falhaDaEscritaDePlatformAdmin(err, requestId);
  }

  const { id } = await params;
  if (!z.string().uuid().safeParse(id).success) {
    return fail("validation_failed", "Empresa inválida.", 400, { requestId });
  }

  try {
    const r = await converterCortesia(createAdminClient(), id, { ator: ctx.user.id });
    if (r.tipo === "org_inexistente") return fail("not_found", "Empresa não encontrada.", 404, { requestId });
    if (r.tipo === "ja_cobrada") return fail("state_conflict", "Esta empresa já tem cobrança.", 409, { requestId });
    if (r.tipo === "marca_nao_cobra") {
      return fail("state_conflict", "A marca desta empresa não tem a cobrança ligada.", 409, { requestId });
    }
    if (r.tipo === "marca_sem_plano") {
      return fail("cobranca_marca_sem_plano", "A marca não tem plano padrão para cobrar.", 422, { requestId });
    }
    void audit({
      action: "cobranca.org_convertida",
      actorUserId: ctx.user.id,
      actingAsPlatformAdmin: true,
      bypassedRls: true,
      organizationId: id,
      resourceType: "organization",
      resourceId: id,
      requestId,
      metadata: { brand_id: r.marcaId, plano_id: r.planoId },
    });
    return ok({ converted: true, brand_id: r.marcaId, plano_id: r.planoId }, { requestId });
  } catch (err) {
    logger.error("cobranca.conversao_falhou", { organization_id: id, erro: err instanceof Error ? err.message : "desconhecido" });
    return fail("internal_error", "Não foi possível converter a empresa.", 500, { requestId });
  }
}
