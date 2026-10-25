/**
 * GET|POST|PATCH /api/v1/admin/brands/{id}/plans — planos da marca (AC-008.3).
 * Plano é só cadastro: nenhuma destas rotas fala com Stripe, Asaas ou qualquer
 * cobrança.
 */
import { randomUUID } from "node:crypto";
import { type NextRequest } from "next/server";

import { audit } from "@/lib/audit";
import { fail, ok } from "@/lib/api/wrappers";
import {
  falhaDaEscritaDePlatformAdmin,
  requirePlatformAdmin,
  requirePlatformAdminEscrita,
  type PlatformAdminContext,
} from "@/lib/auth/requirePlatformAdmin";
import { criarPlano, editarPlano, listarPlanos } from "@/lib/brands/admin-repo";
import { lerCorpo, respostaDeErro } from "@/lib/brands/rota";
import { CriarPlanoSchema, EditarPlanoSchema, UuidSchema } from "@/lib/brands/schemas";
import { requireSupportWrite } from "@/lib/impersonate/support";

type Ctx = { params: Promise<{ id: string }> };

export async function GET(_req: NextRequest, { params }: Ctx) {
  const requestId = randomUUID();
  try {
    await requirePlatformAdmin();
  } catch {
    return fail("forbidden", "Platform admin required", 403, { requestId });
  }
  const { id } = await params;
  if (!UuidSchema.safeParse(id).success) {
    return fail("validation_failed", "Marca inválida.", 400, { requestId });
  }
  try {
    return ok(await listarPlanos(id), { requestId });
  } catch (err) {
    return respostaDeErro(err, requestId);
  }
}

export async function POST(req: NextRequest, { params }: Ctx) {
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
  if (!UuidSchema.safeParse(id).success) {
    return fail("validation_failed", "Marca inválida.", 400, { requestId });
  }
  const corpo = await lerCorpo(req, CriarPlanoSchema, requestId);
  if (!corpo.ok) return corpo.res;

  try {
    const plano = await criarPlano(id, corpo.data);
    void audit({
      action: "brand_plan.saved",
      actorUserId: ctx.user.id,
      actingAsPlatformAdmin: true,
      bypassedRls: true,
      resourceType: "brand_plan",
      resourceId: plano.id as string,
      requestId,
      metadata: { brand_id: id, plan_id: plano.id, op: "created" },
    });
    return ok(plano, { status: 201, requestId });
  } catch (err) {
    return respostaDeErro(err, requestId);
  }
}

export async function PATCH(req: NextRequest, { params }: Ctx) {
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
  if (!UuidSchema.safeParse(id).success) {
    return fail("validation_failed", "Marca inválida.", 400, { requestId });
  }
  const corpo = await lerCorpo(req, EditarPlanoSchema, requestId);
  if (!corpo.ok) return corpo.res;
  const { plan_id, ...campos } = corpo.data;

  try {
    const plano = await editarPlano(id, plan_id, campos);
    void audit({
      action: "brand_plan.saved",
      actorUserId: ctx.user.id,
      actingAsPlatformAdmin: true,
      bypassedRls: true,
      resourceType: "brand_plan",
      resourceId: plan_id,
      requestId,
      metadata: { brand_id: id, plan_id, op: "updated", campos: Object.keys(campos) },
    });
    return ok(plano, { requestId });
  } catch (err) {
    return respostaDeErro(err, requestId);
  }
}
