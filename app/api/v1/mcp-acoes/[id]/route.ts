/**
 * POST /api/v1/mcp-acoes/:id — uma pessoa aprova ou recusa uma ação de ESCRITA de servidor MCP
 * externo que o agente pediu (mudança 006, REQ-007, AC-007.3; ADR-005).
 *
 * - Gerente ou admin (`requireRole("manager")`): aprovar faz algo num sistema fora do CRM, em
 *   nome da empresa. A auditoria precisa de quem (`mcp.action_approved` / `mcp.action_rejected`).
 * - O corpo traz SÓ a decisão. Os argumentos executados são os GUARDADOS na ação (o papel
 *   `authenticated` nem lê essa coluna); um campo a mais no corpo é recusado, para ninguém achar
 *   que dá para trocar o que será feito no momento de aprovar.
 * - `organization_id` vem da sessão, nunca do corpo; ação de outra organização é 404, igual a uma
 *   que não existe.
 * - Decidir é uma troca atômica `pendente → aprovada|recusada`: a segunda decisão recebe 409 e
 *   não executa nada de novo.
 * - Se o sistema externo falhar depois da aprovação, a decisão está registrada: a resposta é 200
 *   com `estado: "falhou"` e a mensagem em português; uma nova tentativa exige uma nova ação.
 */
import { randomUUID } from "node:crypto";
import { z } from "zod";
import type { NextRequest } from "next/server";

import { ok, fail } from "@/lib/api/wrappers";
import { audit } from "@/lib/audit";
import { requireRole } from "@/lib/auth/require-role";
import { traduzir } from "@/lib/i18n/dicionario";
import { requireSupportWrite } from "@/lib/impersonate/support";
import { decidirAcaoPendente } from "@/lib/mcp/servidor-externo/aprovacao";
import { createAdminClient } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";

const corpoSchema = z.object({ decisao: z.enum(["aprovar", "recusar"]) }).strict();

export async function POST(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const denied = await requireSupportWrite();
  if (denied) return denied;

  const requestId = randomUUID();
  const auth = await requireRole("manager", { requestId, resource: "mcp_acoes" });
  if (!auth.ok) return auth.response;
  const t = (texto: string) => traduzir(texto, auth.user.idioma);

  const { id } = await ctx.params;
  if (!z.uuid().safeParse(id).success) {
    return fail("invalid_request", t("Identificador inválido."), 400, { requestId });
  }

  let bruto: unknown;
  try {
    bruto = await req.json();
  } catch {
    return fail("invalid_request", t("Body JSON inválido."), 400, { requestId });
  }
  const corpo = corpoSchema.safeParse(bruto);
  if (!corpo.success) {
    return fail("invalid_request", t("Informe apenas a decisão: aprovar ou recusar."), 400, { requestId });
  }

  const organizationId = auth.org.orgId;
  const resultado = await decidirAcaoPendente(createAdminClient(), organizationId, {
    acaoId: id,
    decisao: corpo.data.decisao,
    usuarioId: auth.user.id,
  });

  if (resultado.tipo === "nao_encontrada") {
    return fail("not_found", t("Ação não encontrada."), 404, { requestId });
  }
  if (resultado.tipo === "ja_decidida") {
    return fail("state_conflict", t("Essa ação já foi decidida por outra pessoa."), 409, { requestId });
  }

  const base = {
    organizationId,
    actorUserId: auth.user.id,
    resourceType: "mcp_action",
    resourceId: id,
    requestId,
  };

  if (resultado.tipo === "recusada") {
    void audit({
      ...base,
      action: "mcp.action_rejected",
      metadata: { servidor: resultado.servidor, ferramenta: resultado.ferramenta },
    });
    return ok({ id, estado: "recusada" }, { requestId });
  }

  if (resultado.tipo === "executada") {
    void audit({
      ...base,
      action: "mcp.action_approved",
      metadata: { ...resultado.resumo, sucesso: true },
    });
    return ok({ id, estado: "executada" }, { requestId });
  }

  void audit({
    ...base,
    action: "mcp.action_approved",
    metadata: { servidor: resultado.servidor, ferramenta: resultado.ferramenta, sucesso: false },
  });
  return ok({ id, estado: "falhou", mensagem: resultado.motivo }, { requestId });
}
