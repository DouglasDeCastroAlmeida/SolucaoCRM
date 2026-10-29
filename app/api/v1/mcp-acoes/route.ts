/**
 * GET /api/v1/mcp-acoes — lista as ações PENDENTES de servidor MCP externo da organização da
 * sessão (mudança 006, REQ-007, AC-007.3; ADR-005).
 *
 * - É por aqui que a Central descobre o id de cada ação a aprovar (o item da Central só guarda a
 *   conversa). Filtro opcional `?conversa_id=`.
 * - Gerente ou admin (`requireRole("manager")`), o mesmo papel de aprovar.
 * - `organization_id` vem da sessão e entra no filtro do cliente administrativo. Só sessão.
 * - Devolve id, servidor (nome e identificador), ferramenta, criado_em, conversa_id e estado.
 *   NUNCA os argumentos: a coluna carrega dado do cliente e não sai pela API (a tela diz isso).
 */
import { randomUUID } from "node:crypto";
import { z } from "zod";
import type { NextRequest } from "next/server";

import { ok, fail } from "@/lib/api/wrappers";
import { requireRole } from "@/lib/auth/require-role";
import { traduzir } from "@/lib/i18n/dicionario";
import { listarAcoesPendentes } from "@/lib/mcp/servidor-externo/aprovacao";
import { createAdminClient } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";

const consultaSchema = z.object({ conversa_id: z.uuid().optional() }).strict();

export async function GET(req: NextRequest) {
  const requestId = randomUUID();
  const auth = await requireRole("manager", { requestId, resource: "mcp_acoes" });
  if (!auth.ok) return auth.response;
  const t = (texto: string) => traduzir(texto, auth.user.idioma);

  const consulta = consultaSchema.safeParse(Object.fromEntries(req.nextUrl.searchParams));
  if (!consulta.success) {
    return fail("validation_failed", t("Identificador de conversa inválido."), 422, { requestId });
  }

  const acoes = await listarAcoesPendentes(createAdminClient(), auth.org.orgId, {
    conversaId: consulta.data.conversa_id,
  });
  return ok(acoes, { requestId });
}
