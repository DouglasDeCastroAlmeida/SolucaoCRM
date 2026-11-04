/**
 * POST /api/v1/channels/email/ignorados/[id]/promover — transforma um e-mail ignorado em
 * conversa (AC-003.3): relê o e-mail pelo UID, confere que ainda é o mesmo e o ingere.
 *
 * Só admin; guarda de suporte antes do efeito; auditoria. Com `EMAIL_CANAL=desligado` nada é
 * lido (AC-008.3). O ignorado é achado por (organização do login, id): de outra organização é 404.
 */
import { randomUUID } from "node:crypto";
import type { NextRequest, NextResponse } from "next/server";

import { fail, ok } from "@/lib/api/wrappers";
import { audit } from "@/lib/audit";
import { requireRole } from "@/lib/auth/require-role";
import { emailCanalLigado } from "@/lib/channels/email/chave";
import { promoverIgnorado } from "@/lib/channels/email/ignorados";
import { traduzir } from "@/lib/i18n/dicionario";
import { requireSupportWrite } from "@/lib/impersonate/support";
import { createAdminClient } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function POST(
  _req: NextRequest,
  contexto: { params: Promise<{ id: string }> },
): Promise<NextResponse> {
  const supportDenied = await requireSupportWrite();
  if (supportDenied) return supportDenied;

  const requestId = randomUUID();
  const authz = await requireRole("admin", { requestId, resource: "channels_email" });
  if (!authz.ok) return authz.response;
  const t = (texto: string) => traduzir(texto, authz.user.idioma);
  const { id } = await contexto.params;
  if (!UUID.test(id)) return fail("not_found", t("E-mail ignorado não encontrado."), 404, { requestId });
  if (!emailCanalLigado()) {
    return fail("unavailable", t("O canal de e-mail está desligado nesta instalação."), 503, { requestId });
  }

  const r = await promoverIgnorado(createAdminClient(), authz.org.orgId, id);
  if (r.resultado === "nao_encontrado") return fail("not_found", t("E-mail ignorado não encontrado."), 404, { requestId });
  if (r.resultado === "indisponivel") {
    return fail("channel_unavailable", t("Não foi possível ler esse e-mail agora. Tente de novo em alguns minutos."), 502, { requestId });
  }

  void audit({
    action: "channel.email_ignored_promoted",
    actorUserId: authz.user.id,
    organizationId: authz.org.orgId,
    resourceType: "email_ignorado",
    resourceId: id,
    requestId,
    metadata: { conversation_id: r.conversationId },
  });
  return ok({ conversation_id: r.conversationId }, { requestId });
}
