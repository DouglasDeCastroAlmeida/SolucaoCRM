/**
 * POST /api/v1/mcp-servidores/:id/atualizar-ferramentas — "atualizar ferramentas" (mudança 006,
 * revisão de segurança B2).
 *
 * Ação EXPLÍCITA do admin: refaz a lista pela rede e ADOTA o que o servidor anuncia agora (descrição,
 * esquema e aviso de somente leitura, que a renovação automática nunca aceita sozinha). Devolve o que
 * mudou (novas, removidas, alteradas) para a tela mostrar antes de o admin ligar qualquer coisa.
 * Ferramenta nova nunca entra ligada em agente nenhum. O corpo é vazio.
 */
import { randomUUID } from "node:crypto";
import { z } from "zod";
import type { NextRequest } from "next/server";

import { ok, fail } from "@/lib/api/wrappers";
import { audit } from "@/lib/audit";
import { traduzir } from "@/lib/i18n/dicionario";
import { requireSupportWrite } from "@/lib/impersonate/support";
import { exigirAdminDeServidoresMcp } from "@/lib/mcp/servidor-externo/quem-administra";
import { atualizarFerramentasDoServidor, ErroDeServidorMcp } from "@/lib/mcp/servidor-externo/repositorio";
import { falhaDoServidorMcp } from "@/lib/mcp/servidor-externo/resposta-de-erro";
import { createAdminClient } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";

const corpoSchema = z.object({}).strict();

export async function POST(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const denied = await requireSupportWrite();
  if (denied) return denied;

  const requestId = randomUUID();
  const auth = await exigirAdminDeServidoresMcp(requestId);
  if (!auth.ok) return auth.response;
  const t = (texto: string) => traduzir(texto, auth.user.idioma);

  const { id } = await ctx.params;
  if (!z.uuid().safeParse(id).success) {
    return fail("invalid_request", t("Identificador inválido."), 400, { requestId });
  }

  // Corpo opcional: vazio ou `{}`. Qualquer campo é recusado para ninguém achar que dá para escolher o que adotar.
  const texto = await req.text();
  let bruto: unknown = {};
  if (texto.trim() !== "") {
    try {
      bruto = JSON.parse(texto);
    } catch {
      return fail("invalid_request", t("Body JSON inválido."), 400, { requestId });
    }
  }
  if (!corpoSchema.safeParse(bruto).success) {
    return fail("validation_failed", t("Esta ação não recebe campos."), 422, { requestId });
  }

  const organizationId = auth.org.orgId;
  try {
    const resultado = await atualizarFerramentasDoServidor(createAdminClient(), organizationId, id, {
      aceitarMudancas: true,
    });
    if (!resultado) return fail("not_found", t("Servidor não encontrado."), 404, { requestId });

    void audit({
      action: "mcp.tools_refreshed",
      actorUserId: auth.user.id,
      organizationId,
      resourceType: "mcp_server",
      resourceId: id,
      requestId,
      // Só contagens: os nomes são texto de um servidor de terceiros.
      metadata: {
        novas: resultado.mudancas.novas.length,
        removidas: resultado.mudancas.removidas.length,
        alteradas: resultado.mudancas.alteradas.length,
      },
    });
    return ok(resultado, { requestId });
  } catch (err) {
    if (err instanceof ErroDeServidorMcp) return falhaDoServidorMcp(err, auth.user.idioma, requestId);
    throw err;
  }
}
