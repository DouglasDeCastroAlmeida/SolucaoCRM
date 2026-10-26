/**
 * POST   /api/v1/admin/brands/{id}/domains — cadastra domínio; duplicado = 409
 *        `brand_domain_exists` (AC-008.2). A unicidade é do banco, então repetir
 *        o clique não cria duplicata.
 * DELETE /api/v1/admin/brands/{id}/domains?domain_id=<uuid> — remove o domínio.
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
import { adicionarDominio, removerDominio } from "@/lib/brands/admin-repo";
import { lerCorpo, respostaDeErro } from "@/lib/brands/rota";
import { CriarDominioSchema, UuidSchema } from "@/lib/brands/schemas";
import { requireSupportWrite } from "@/lib/impersonate/support";

type Ctx = { params: Promise<{ id: string }> };

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
  const corpo = await lerCorpo(req, CriarDominioSchema, requestId);
  if (!corpo.ok) return corpo.res;

  try {
    const dominio = await adicionarDominio(id, corpo.data.host, corpo.data.kind);
    void audit({
      action: "brand_domain.added",
      actorUserId: ctx.user.id,
      actingAsPlatformAdmin: true,
      bypassedRls: true,
      resourceType: "brand_domain",
      resourceId: dominio.id as string,
      requestId,
      metadata: { brand_id: id, host: corpo.data.host, kind: corpo.data.kind },
    });
    return ok(dominio, { status: 201, requestId });
  } catch (err) {
    return respostaDeErro(err, requestId);
  }
}

export async function DELETE(req: NextRequest, { params }: Ctx) {
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
  const domainId = req.nextUrl.searchParams.get("domain_id");
  if (!UuidSchema.safeParse(id).success || !UuidSchema.safeParse(domainId).success) {
    return fail("validation_failed", "Marca ou domínio inválido.", 400, { requestId });
  }

  try {
    const { host } = await removerDominio(id, domainId as string);
    void audit({
      action: "brand_domain.removed",
      actorUserId: ctx.user.id,
      actingAsPlatformAdmin: true,
      bypassedRls: true,
      resourceType: "brand_domain",
      resourceId: domainId as string,
      requestId,
      metadata: { brand_id: id, host },
    });
    return ok({ removed: true }, { requestId });
  } catch (err) {
    return respostaDeErro(err, requestId);
  }
}
