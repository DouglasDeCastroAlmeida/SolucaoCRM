/**
 * GET /api/v1/channels/email/ignorados — o que a rodada deixou de transformar em conversa
 * (AC-003.3): remetente, assunto, data e motivo. Só o cabeçalho; o corpo não é guardado.
 *
 * Só admin (assunto e remetente são dado de terceiros). Filtro por caixa opcional.
 */
import { randomUUID } from "node:crypto";
import type { NextRequest, NextResponse } from "next/server";

import { fail, ok } from "@/lib/api/wrappers";
import { requireRole } from "@/lib/auth/require-role";
import { listarIgnorados } from "@/lib/channels/email/ignorados";
import { traduzir } from "@/lib/i18n/dicionario";
import { createAdminClient } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function GET(req: NextRequest): Promise<NextResponse> {
  const requestId = randomUUID();
  const authz = await requireRole("admin", { requestId, resource: "channels_email" });
  if (!authz.ok) return authz.response;
  const t = (texto: string) => traduzir(texto, authz.user.idioma);

  const caixaId = req.nextUrl.searchParams.get("caixa_id") ?? undefined;
  if (caixaId !== undefined && !UUID.test(caixaId)) {
    return fail("validation_failed", t("Informe uma caixa de e-mail válida."), 422, { requestId });
  }
  const ignorados = await listarIgnorados(createAdminClient(), authz.org.orgId, { caixaId });
  return ok({ ignorados }, { requestId });
}
