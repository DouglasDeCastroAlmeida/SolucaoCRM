/**
 * POST /api/v1/cobranca/assinatura/reembolso — o reembolso de arrependimento
 * (mudança 003, AC-006.3 a AC-006.5). Até 7 dias depois da 1ª cobrança paga; um pedido
 * por cobrança; vira item na Central da plataforma e cancela a conta. A janela é
 * conferida AQUI, no servidor: o botão sumir da tela não é a proteção. A organização
 * vem da sessão, nunca do corpo (a rota nem lê corpo).
 */
import { randomUUID } from "node:crypto";

import { pedirReembolso } from "@/lib/billing-trial/reembolso";
import { fail, ok } from "@/lib/api/wrappers";
import { audit } from "@/lib/audit";
import { requireRole } from "@/lib/auth/require-role";
import { limiteDoProvedorPorOrg } from "@/lib/cobranca/falhas";
import { requireSupportWrite } from "@/lib/impersonate/support";
import { moduloLigado } from "@/lib/instalacao/modulos";
import { createAdminClient } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";

export async function POST() {
  const supportDenied = await requireSupportWrite();
  if (supportDenied) return supportDenied;
  const requestId = randomUUID();
  const authz = await requireRole("admin", { requestId, resource: "cobranca_reembolsos", permiteOrgSuspensa: true });
  if (!authz.ok) return authz.response;
  const admin = createAdminClient();
  if (!(await moduloLigado(admin, "cobranca"))) return fail("not_found", "Not found", 404, { requestId });
  const orgId = authz.org.orgId;
  if (!(await limiteDoProvedorPorOrg(orgId))) {
    return fail("rate_limited", "Muitas tentativas seguidas. Aguarde um minuto e tente de novo.", 429, { requestId, headers: { "Retry-After": "60" } });
  }

  const r = await pedirReembolso(admin, orgId);
  if (r.tipo === "recusado") return fail(r.code, r.message, r.status, { requestId });
  if (r.tipo === "ja_pedido") return ok({ changed: false }, { requestId });
  void audit({
    action: "cobranca.reembolso_pedido",
    actorUserId: authz.user.id,
    organizationId: orgId,
    resourceType: "cobranca_reembolso",
    resourceId: orgId,
    requestId,
    metadata: { pagamento_ref: r.pagamentoRef },
  });
  return ok({ changed: true }, { requestId, status: 201 });
}
