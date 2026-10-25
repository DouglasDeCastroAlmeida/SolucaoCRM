/**
 * GET  /api/v1/admin/brands  — lista marcas (com domínios).
 * POST /api/v1/admin/brands  — cria marca (AC-008.1, AC-008.7).
 * Só admin da plataforma (AC-008.6); escrita exige scope full + MFA.
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
import { criarMarca, listarMarcas } from "@/lib/brands/admin-repo";
import { lerCorpo, respostaDeErro } from "@/lib/brands/rota";
import { CriarMarcaSchema } from "@/lib/brands/schemas";
import { requireSupportWrite } from "@/lib/impersonate/support";

export async function GET() {
  const requestId = randomUUID();
  try {
    await requirePlatformAdmin();
  } catch {
    return fail("forbidden", "Platform admin required", 403, { requestId });
  }
  try {
    return ok(await listarMarcas(), { requestId });
  } catch (err) {
    return respostaDeErro(err, requestId);
  }
}

export async function POST(req: NextRequest) {
  const supportDenied = await requireSupportWrite();
  if (supportDenied) return supportDenied;

  const requestId = randomUUID();
  let ctx: PlatformAdminContext;
  try {
    ctx = await requirePlatformAdminEscrita();
  } catch (err) {
    return falhaDaEscritaDePlatformAdmin(err, requestId);
  }

  const corpo = await lerCorpo(req, CriarMarcaSchema, requestId);
  if (!corpo.ok) return corpo.res;

  try {
    const marca = await criarMarca(corpo.data);
    void audit({
      action: "brand.created",
      actorUserId: ctx.user.id,
      actingAsPlatformAdmin: true,
      bypassedRls: true,
      resourceType: "brand",
      resourceId: marca.id as string,
      requestId,
      metadata: { brand_id: marca.id, slug: marca.slug },
    });
    return ok(marca, { status: 201, requestId });
  } catch (err) {
    return respostaDeErro(err, requestId);
  }
}
