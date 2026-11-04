/**
 * POST /api/v1/channels/email/remetentes — "não é cliente" (AC-003.4): os próximos e-mails
 * daquele remetente passam a ser ignorados e a conversa de e-mail dele sai da lista.
 *
 * Agent ou acima (quem atende a conversa decide que ela é ruído). Guarda de suporte antes do
 * efeito; auditoria. O endereço vem da conversa (organização do login) ou é informado; nunca
 * se confia em organização vinda do corpo.
 */
import { randomUUID } from "node:crypto";
import type { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import { fail, ok } from "@/lib/api/wrappers";
import { audit } from "@/lib/audit";
import { requireRole } from "@/lib/auth/require-role";
import { marcarNaoCliente } from "@/lib/channels/email/ignorados";
import { traduzir } from "@/lib/i18n/dicionario";
import { requireSupportWrite } from "@/lib/impersonate/support";
import { createAdminClient } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const corpoSchema = z
  .object({
    conversation_id: z.string().uuid().optional(),
    endereco: z.string().trim().toLowerCase().max(254).email().optional(),
  })
  .strict()
  .refine((v) => Boolean(v.conversation_id) !== Boolean(v.endereco), { message: "informe a conversa ou o endereço" });

export async function POST(req: NextRequest): Promise<NextResponse> {
  const supportDenied = await requireSupportWrite();
  if (supportDenied) return supportDenied;

  const requestId = randomUUID();
  const authz = await requireRole("agent", { requestId, resource: "channels_email" });
  if (!authz.ok) return authz.response;
  const t = (texto: string) => traduzir(texto, authz.user.idioma);

  const parsed = corpoSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return fail("validation_failed", t("Informe o endereço de e-mail do remetente."), 422, { requestId });
  }

  const r = await marcarNaoCliente(createAdminClient(), {
    organizationId: authz.org.orgId,
    userId: authz.user.id,
    conversationId: parsed.data.conversation_id,
    endereco: parsed.data.endereco,
  });
  if (r.resultado === "nao_encontrada") {
    return fail("not_found", t("Conversa de e-mail não encontrada."), 404, { requestId });
  }

  void audit({
    action: "channel.email_sender_blocked",
    actorUserId: authz.user.id,
    organizationId: authz.org.orgId,
    resourceType: "email_remetente",
    requestId,
    metadata: { endereco: r.endereco, conversas_arquivadas: r.conversasArquivadas },
  });
  return ok({ endereco: r.endereco, conversas_arquivadas: r.conversasArquivadas }, { requestId });
}
