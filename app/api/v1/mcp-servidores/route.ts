/**
 * GET/POST /api/v1/mcp-servidores — lista e cadastra servidores MCP externos da organização
 * (mudança 006, REQ-007 e REQ-008; ADR-004).
 *
 * - Quem pode: o administrador da organização SE a chave `MCP_EXTERNO_ADMIN_DA_ORG` estiver ligada;
 *   senão só o administrador da instalação (`exigirAdminDeServidoresMcp`).
 * - POST: Zod estrito, destino `https` seguro, TESTA a conexão e lista as ferramentas (todas nascem
 *   DESLIGADAS), credencial cifrada. A resposta traz da credencial no máximo os 4 últimos caracteres.
 * - `organization_id` vem da sessão, nunca do corpo; só sessão (bearer não entra aqui).
 */
import { randomUUID } from "node:crypto";
import { z } from "zod";
import type { NextRequest } from "next/server";

import { ok, fail } from "@/lib/api/wrappers";
import { audit } from "@/lib/audit";
import { traduzir } from "@/lib/i18n/dicionario";
import { requireSupportWrite } from "@/lib/impersonate/support";
import { ehSlugDeServidor } from "@/lib/mcp/servidor-externo/ids";
import { exigirAdminDeServidoresMcp } from "@/lib/mcp/servidor-externo/quem-administra";
import {
  cadastrarServidor,
  ErroDeServidorMcp,
  listarServidoresPublicos,
} from "@/lib/mcp/servidor-externo/repositorio";
import { falhaDoServidorMcp } from "@/lib/mcp/servidor-externo/resposta-de-erro";
import { hostDoEndpoint } from "@/lib/mcp/servidor-externo/registro";
import { createAdminClient } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";

const corpoSchema = z
  .object({
    slug: z.string().trim().min(1).max(24).refine(ehSlugDeServidor),
    nome: z.string().trim().min(1).max(80),
    endpoint: z.string().trim().min(1).max(500),
    chave: z.string().trim().min(1).max(500),
  })
  .strict();

export async function GET() {
  const requestId = randomUUID();
  const auth = await exigirAdminDeServidoresMcp(requestId);
  if (!auth.ok) return auth.response;

  const servidores = await listarServidoresPublicos(createAdminClient(), auth.org.orgId);
  return ok(servidores, { requestId });
}

export async function POST(req: NextRequest) {
  const denied = await requireSupportWrite();
  if (denied) return denied;

  const requestId = randomUUID();
  const auth = await exigirAdminDeServidoresMcp(requestId);
  if (!auth.ok) return auth.response;
  const t = (texto: string) => traduzir(texto, auth.user.idioma);

  let bruto: unknown;
  try {
    bruto = await req.json();
  } catch {
    return fail("invalid_request", t("Body JSON inválido."), 400, { requestId });
  }
  const corpo = corpoSchema.safeParse(bruto);
  if (!corpo.success) {
    return fail(
      "validation_failed",
      t("Informe um identificador, um nome, o endereço e a chave do servidor."),
      422,
      { requestId },
    );
  }

  const organizationId = auth.org.orgId;
  try {
    const servidor = await cadastrarServidor(createAdminClient(), organizationId, corpo.data);
    void audit({
      action: "mcp.server_added",
      actorUserId: auth.user.id,
      organizationId,
      resourceType: "mcp_server",
      resourceId: servidor.id,
      requestId,
      // Só o host e a contagem: o endereço inteiro pode ter caminho, e a chave nunca entra.
      metadata: { slug: servidor.slug, host: hostDoEndpoint(corpo.data.endpoint), ferramentas: servidor.ferramentas.length },
    });
    return ok(servidor, { status: 201, requestId });
  } catch (err) {
    if (err instanceof ErroDeServidorMcp) return falhaDoServidorMcp(err, auth.user.idioma, requestId);
    throw err;
  }
}
