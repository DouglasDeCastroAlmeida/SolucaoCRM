/**
 * PATCH/DELETE /api/v1/mcp-servidores/:id — ativar, desativar e remover um servidor MCP externo
 * (mudança 006, REQ-008).
 *
 * - Desativar é LÓGICO: a linha, a chave cifrada e a lista de ferramentas ficam; os agentes só
 *   deixam de enxergar o servidor. `DELETE` é o mesmo que desativar (preserva os dados).
 * - O corpo do PATCH só aceita `ativo`; trocar a credencial é cadastrar de novo com outro
 *   identificador (teste de conexão incluso).
 * - Servidor de outra organização é 404, igual a um que não existe.
 */
import { randomUUID } from "node:crypto";
import { z } from "zod";
import type { NextRequest } from "next/server";

import { ok, fail } from "@/lib/api/wrappers";
import { audit } from "@/lib/audit";
import { traduzir } from "@/lib/i18n/dicionario";
import { requireSupportWrite } from "@/lib/impersonate/support";
import { exigirAdminDeServidoresMcp } from "@/lib/mcp/servidor-externo/quem-administra";
import { definirServidorAtivo, ErroDeServidorMcp } from "@/lib/mcp/servidor-externo/repositorio";
import { falhaDoServidorMcp } from "@/lib/mcp/servidor-externo/resposta-de-erro";
import { createAdminClient } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ id: string }> };

const corpoSchema = z.object({ ativo: z.boolean() }).strict();

/** Corpo do PATCH já validado, ou a resposta de erro. */
async function lerPedido(req: Request, requestId: string): Promise<{ ativo: boolean } | Response> {
  let bruto: unknown;
  try {
    bruto = await req.json();
  } catch {
    return fail("invalid_request", "Body JSON inválido.", 400, { requestId });
  }
  const corpo = corpoSchema.safeParse(bruto);
  if (!corpo.success) return fail("validation_failed", "Informe apenas se o servidor fica ativo.", 422, { requestId });
  return corpo.data;
}

/** A parte comum: papel, id, efeito, auditoria. Quem chama JÁ passou por `requireSupportWrite`. */
async function mudarEstado(
  ctx: Ctx,
  requestId: string,
  pedir: () => Promise<{ ativo: boolean } | Response>,
  acao: "mcp.server_updated" | "mcp.server_removed",
) {
  const auth = await exigirAdminDeServidoresMcp(requestId);
  if (!auth.ok) return auth.response;
  const t = (texto: string) => traduzir(texto, auth.user.idioma);

  const { id } = await ctx.params;
  if (!z.uuid().safeParse(id).success) {
    return fail("invalid_request", t("Identificador inválido."), 400, { requestId });
  }

  const decisao = await pedir();
  if (decisao instanceof Response) return decisao;

  const organizationId = auth.org.orgId;
  try {
    const servidor = await definirServidorAtivo(createAdminClient(), organizationId, id, decisao.ativo);
    if (!servidor) return fail("not_found", t("Servidor não encontrado."), 404, { requestId });
    void audit({
      action: acao,
      actorUserId: auth.user.id,
      organizationId,
      resourceType: "mcp_server",
      resourceId: id,
      requestId,
      metadata: { slug: servidor.slug, ativo: servidor.ativo },
    });
    return ok(servidor, { requestId });
  } catch (err) {
    if (err instanceof ErroDeServidorMcp) return falhaDoServidorMcp(err, auth.user.idioma, requestId);
    throw err;
  }
}

export async function PATCH(req: NextRequest, ctx: Ctx) {
  const denied = await requireSupportWrite();
  if (denied) return denied;
  const requestId = randomUUID();
  return mudarEstado(ctx, requestId, () => lerPedido(req, requestId), "mcp.server_updated");
}

export async function DELETE(_req: NextRequest, ctx: Ctx) {
  const denied = await requireSupportWrite();
  if (denied) return denied;
  const requestId = randomUUID();
  return mudarEstado(ctx, requestId, async () => ({ ativo: false }), "mcp.server_removed");
}
