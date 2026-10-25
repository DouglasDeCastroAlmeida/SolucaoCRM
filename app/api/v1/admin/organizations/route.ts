/**
 * GET /api/v1/admin/organizations — todas as contas de todas as marcas, com a
 * marca de cada uma (AC-008.5). Abrir o acesso de suporte é a rota que já
 * existe: POST /api/v1/admin/tenants/{id}/impersonate (guarda de efeito e
 * auditoria próprias). Filtros só pela query, nunca pelo corpo.
 */
import { randomUUID } from "node:crypto";
import { type NextRequest } from "next/server";
import { z } from "zod";

import { fail, ok } from "@/lib/api/wrappers";
import { requirePlatformAdmin } from "@/lib/auth/requirePlatformAdmin";
import { listarContasComMarca } from "@/lib/brands/admin-repo";
import { respostaDeErro } from "@/lib/brands/rota";

const querySchema = z.object({
  brand_id: z.string().uuid().optional(),
  q: z.string().trim().max(100).optional(),
  limit: z.coerce.number().int().min(1).max(200).default(50),
});

export async function GET(req: NextRequest) {
  const requestId = randomUUID();
  try {
    await requirePlatformAdmin();
  } catch {
    return fail("forbidden", "Platform admin required", 403, { requestId });
  }

  const query = querySchema.safeParse(Object.fromEntries(req.nextUrl.searchParams));
  if (!query.success) return fail("validation_failed", "Filtro inválido.", 400, { requestId });

  try {
    const linhas = await listarContasComMarca({
      brandId: query.data.brand_id,
      q: query.data.q || undefined,
      limit: query.data.limit,
    });
    return ok(linhas, { requestId });
  } catch (err) {
    return respostaDeErro(err, requestId);
  }
}
