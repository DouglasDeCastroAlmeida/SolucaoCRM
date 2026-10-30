/**
 * GET|POST|PATCH /api/v1/admin/brands/{id}/planos-cobranca — os planos
 * cobráveis da marca (`cobranca_planos.brand_id`, ADR-002 da mudança 003).
 *
 * Mesma régua dos planos da instalação (`lib/schemas/cobranca-plano.ts`). A
 * marca vem do path; `brand_id` no corpo é recusado. Salvar um plano não cobra
 * ninguém: a cobrança só existe depois de ligar a chave da marca.
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
import { criarPlanoCobravel, editarPlanoCobravel, listarPlanosCobraveis } from "@/lib/brands/cobranca-repo";
import { lerCorpo, respostaDeErro } from "@/lib/brands/rota";
import { CriarPlanoCobravelSchema, EditarPlanoCobravelSchema, UuidSchema } from "@/lib/brands/schemas";
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
    return ok(await listarPlanosCobraveis(id), { requestId });
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
  const corpo = await lerCorpo(req, CriarPlanoCobravelSchema, requestId);
  if (!corpo.ok) return corpo.res;

  try {
    const plano = await criarPlanoCobravel(id, corpo.data, ctx.user.id);
    void audit({
      action: "cobranca.plano_salvo",
      actorUserId: ctx.user.id,
      actingAsPlatformAdmin: true,
      bypassedRls: true,
      resourceType: "cobranca_plano",
      resourceId: plano.id as string,
      requestId,
      metadata: { brand_id: id, op: "created", ...corpo.data },
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
  const corpo = await lerCorpo(req, EditarPlanoCobravelSchema, requestId);
  if (!corpo.ok) return corpo.res;
  const { plan_id, ...campos } = corpo.data;

  try {
    const plano = await editarPlanoCobravel(id, plan_id, campos, ctx.user.id);
    void audit({
      action: campos.arquivado === true ? "cobranca.plano_arquivado" : "cobranca.plano_salvo",
      actorUserId: ctx.user.id,
      actingAsPlatformAdmin: true,
      bypassedRls: true,
      resourceType: "cobranca_plano",
      resourceId: plan_id,
      requestId,
      metadata: { brand_id: id, op: "updated", ...campos },
    });
    return ok(plano, { requestId });
  } catch (err) {
    return respostaDeErro(err, requestId);
  }
}
