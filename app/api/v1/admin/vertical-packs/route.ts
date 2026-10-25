/**
 * GET|POST|PATCH /api/v1/admin/vertical-packs — pacotes verticais (AC-008.4).
 * O pacote é COPIADO para a organização na criação (lib/brands/pacote.ts);
 * editar o pacote aqui nunca altera organizações existentes.
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
import { criarPacote, editarPacote, listarPacotes } from "@/lib/brands/admin-repo";
import { lerCorpo, respostaDeErro } from "@/lib/brands/rota";
import { CriarPacoteSchema, EditarPacoteSchema } from "@/lib/brands/schemas";
import { requireSupportWrite } from "@/lib/impersonate/support";

export async function GET() {
  const requestId = randomUUID();
  try {
    await requirePlatformAdmin();
  } catch {
    return fail("forbidden", "Platform admin required", 403, { requestId });
  }
  try {
    return ok(await listarPacotes(), { requestId });
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

  const corpo = await lerCorpo(req, CriarPacoteSchema, requestId);
  if (!corpo.ok) return corpo.res;

  try {
    const pacote = await criarPacote(corpo.data);
    void audit({
      action: "vertical_pack.saved",
      actorUserId: ctx.user.id,
      actingAsPlatformAdmin: true,
      bypassedRls: true,
      resourceType: "vertical_pack",
      resourceId: pacote.id as string,
      requestId,
      metadata: { pack_id: pacote.id, slug: pacote.slug, op: "created" },
    });
    return ok(pacote, { status: 201, requestId });
  } catch (err) {
    return respostaDeErro(err, requestId);
  }
}

export async function PATCH(req: NextRequest) {
  const supportDenied = await requireSupportWrite();
  if (supportDenied) return supportDenied;

  const requestId = randomUUID();
  let ctx: PlatformAdminContext;
  try {
    ctx = await requirePlatformAdminEscrita();
  } catch (err) {
    return falhaDaEscritaDePlatformAdmin(err, requestId);
  }

  const corpo = await lerCorpo(req, EditarPacoteSchema, requestId);
  if (!corpo.ok) return corpo.res;
  const { pack_id, ...campos } = corpo.data;

  try {
    const pacote = await editarPacote(pack_id, campos);
    void audit({
      action: "vertical_pack.saved",
      actorUserId: ctx.user.id,
      actingAsPlatformAdmin: true,
      bypassedRls: true,
      resourceType: "vertical_pack",
      resourceId: pack_id,
      requestId,
      metadata: { pack_id, op: "updated", campos: Object.keys(campos) },
    });
    return ok(pacote, { requestId });
  } catch (err) {
    return respostaDeErro(err, requestId);
  }
}
