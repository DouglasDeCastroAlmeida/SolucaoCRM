/**
 * PATCH /api/v1/admin/organizations/{id}/brand — troca a marca da organização
 * (AC-003.5). Chama a RPC `fn_set_org_brand` com a SESSÃO do admin (não o
 * service role): a função confere `fn_is_platform_admin_full()` com `auth.uid()`
 * e grava `org.brand_changed` em `api_audit_log` na mesma transação, por isso a
 * rota não chama `audit()` (duplicaria a entrada).
 */
import { randomUUID } from "node:crypto";
import { type NextRequest } from "next/server";

import { fail, ok } from "@/lib/api/wrappers";
import {
  falhaDaEscritaDePlatformAdmin,
  requirePlatformAdminEscrita,
} from "@/lib/auth/requirePlatformAdmin";
import { lerCorpo } from "@/lib/brands/rota";
import { TrocarMarcaDaOrganizacaoSchema, UuidSchema } from "@/lib/brands/schemas";
import { requireSupportWrite } from "@/lib/impersonate/support";
import { createClient } from "@/lib/supabase/server";

type Ctx = { params: Promise<{ id: string }> };

export async function PATCH(req: NextRequest, { params }: Ctx) {
  const { id } = await params;
  const supportDenied = await requireSupportWrite(UuidSchema.safeParse(id).success ? id : undefined);
  if (supportDenied) return supportDenied;

  const requestId = randomUUID();
  try {
    await requirePlatformAdminEscrita();
  } catch (err) {
    return falhaDaEscritaDePlatformAdmin(err, requestId);
  }

  if (!UuidSchema.safeParse(id).success) {
    return fail("validation_failed", "Organização inválida.", 400, { requestId });
  }
  const corpo = await lerCorpo(req, TrocarMarcaDaOrganizacaoSchema, requestId);
  if (!corpo.ok) return corpo.res;

  const db = await createClient();
  const { error } = await db.rpc("fn_set_org_brand", {
    p_org_id: id,
    p_brand_id: corpo.data.brand_id,
  });
  if (error) {
    if (error.code === "42501") return fail("forbidden", "Platform admin required", 403, { requestId });
    if (error.code === "P0002") return fail("not_found", "Organização ou marca não encontrada.", 404, { requestId });
    return fail("internal_error", "Não foi possível trocar a marca.", 500, { requestId });
  }
  return ok({ organization_id: id, brand_id: corpo.data.brand_id }, { requestId });
}
