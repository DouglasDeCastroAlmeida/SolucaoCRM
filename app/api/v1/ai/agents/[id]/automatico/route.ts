/**
 * POST /api/v1/ai/agents/:id/automatico — o admin confirma que o agente passa a responder sozinho.
 *
 * Mudança 006, REQ-003. O padrão de um agente novo é `assisted` (uma pessoa aprova cada
 * resposta). Ir para `automatic` é a decisão que fala com o cliente sem ninguém no meio e gasta
 * a chave de IA da empresa, então exige `confirmar_automatico: true` no corpo — a tela abre um
 * diálogo, mas quem cobra é este servidor.
 *
 * - Só sessão de admin (`requireRole("admin")`): a confirmação é um ato de uma pessoa, e a
 *   auditoria precisa de quem. Bearer não entra aqui.
 * - `organization_id` vem da sessão, nunca do corpo; o admin client filtra a organização à mão.
 * - Já automático: devolve 200 sem gravar e sem auditar de novo (nada mudou).
 */
import { randomUUID } from "node:crypto";
import { z } from "zod";
import type { NextRequest } from "next/server";
import { requireSupportWrite } from "@/lib/impersonate/support";
import { requireRole } from "@/lib/auth/require-role";
import { ok, fail } from "@/lib/api/wrappers";
import { audit } from "@/lib/audit";
import { createAdminClient } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";

const COLUNAS =
  "id, organization_id, name, description, model, is_active, is_default, kind, channel, priority, published_version_id, paused_at, operation_mode, operation_revision, archived_at, created_at, updated_at";

const corpoSchema = z.object({ confirmar_automatico: z.literal(true) });

export async function POST(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const denied = await requireSupportWrite();
  if (denied) return denied;

  const requestId = randomUUID();
  const auth = await requireRole("admin", { requestId, resource: "ai_agents" });
  if (!auth.ok) return auth.response;

  const { id } = await ctx.params;
  if (!z.uuid().safeParse(id).success) {
    return fail("invalid_request", "id inválido.", 400, { requestId });
  }

  let bruto: unknown;
  try {
    bruto = await req.json();
  } catch {
    return fail("invalid_request", "Body JSON inválido.", 400, { requestId });
  }
  if (!corpoSchema.safeParse(bruto).success) {
    return fail(
      "ai_confirmacao_exigida",
      "Para ligar o modo automático é preciso confirmar. O agente passará a responder sozinho.",
      422,
      { requestId },
    );
  }

  const organizationId = auth.org.orgId;
  const admin = createAdminClient();
  const { data: atual, error: erroLeitura } = await admin
    .from("ai_agents")
    .select(COLUNAS)
    .eq("id", id)
    .eq("organization_id", organizationId)
    .maybeSingle();
  if (erroLeitura) return fail("internal_error", "Erro ao carregar agent.", 500, { requestId });
  if (!atual) return fail("not_found", "Agent não encontrado.", 404, { requestId });
  if (atual.operation_mode === "automatic") return ok(atual, { requestId });

  const { data: atualizado, error: erroGravacao } = await admin
    .from("ai_agents")
    .update({ operation_mode: "automatic" })
    .eq("id", id)
    .eq("organization_id", organizationId)
    .select(COLUNAS)
    .single();
  if (erroGravacao || !atualizado) {
    return fail("internal_error", "Erro ao atualizar agent.", 500, { requestId });
  }

  void audit({
    action: "ai_agent.automatic_confirmed",
    actorUserId: auth.user.id,
    organizationId,
    resourceType: "ai_agent",
    resourceId: id,
    requestId,
    metadata: {
      confirmed_at: new Date().toISOString(),
      previous_mode: atual.operation_mode,
    },
  });

  return ok(atualizado, { requestId });
}
