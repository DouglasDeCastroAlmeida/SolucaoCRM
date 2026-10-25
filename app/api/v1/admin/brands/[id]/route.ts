/**
 * PATCH  /api/v1/admin/brands/{id} — edita a marca (AC-008.1).
 * DELETE /api/v1/admin/brands/{id} — DESATIVA a marca (não apaga linha).
 */
import { randomUUID } from "node:crypto";
import { type NextRequest } from "next/server";

import { audit } from "@/lib/audit";
import { fail, ok } from "@/lib/api/wrappers";
import {
  falhaDaEscritaDePlatformAdmin,
  requirePlatformAdminEscrita,
  type PlatformAdminContext,
} from "@/lib/auth/requirePlatformAdmin";
import { desativarMarca, editarMarca } from "@/lib/brands/admin-repo";
import { lerCorpo, respostaDeErro } from "@/lib/brands/rota";
import { EditarMarcaSchema, UuidSchema } from "@/lib/brands/schemas";
import { requireSupportWrite } from "@/lib/impersonate/support";

type Ctx = { params: Promise<{ id: string }> };

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
  const corpo = await lerCorpo(req, EditarMarcaSchema, requestId);
  if (!corpo.ok) return corpo.res;

  try {
    const marca = await editarMarca(id, corpo.data);
    void audit({
      action: "brand.updated",
      actorUserId: ctx.user.id,
      actingAsPlatformAdmin: true,
      bypassedRls: true,
      resourceType: "brand",
      resourceId: id,
      requestId,
      metadata: { brand_id: id, campos: Object.keys(corpo.data) },
    });
    return ok(marca, { requestId });
  } catch (err) {
    return respostaDeErro(err, requestId);
  }
}

export async function DELETE(_req: NextRequest, { params }: Ctx) {
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

  try {
    const marca = await desativarMarca(id);
    void audit({
      action: "brand.deactivated",
      actorUserId: ctx.user.id,
      actingAsPlatformAdmin: true,
      bypassedRls: true,
      resourceType: "brand",
      resourceId: id,
      requestId,
      metadata: { brand_id: id },
    });
    return ok(marca, { requestId });
  } catch (err) {
    return respostaDeErro(err, requestId);
  }
}
