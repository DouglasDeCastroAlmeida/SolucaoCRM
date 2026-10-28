/**
 * GET/PATCH /api/v1/mcp-servidores/:id/ferramentas — as ferramentas de um servidor MCP externo,
 * ligadas e desligadas POR AGENTE (mudança 006, REQ-007; AC-007.2, AC-007.4 e AC-007.8).
 *
 * - "Ligada" = o id da ferramenta em `tool_ids` da versão RASCUNHO do agente (a publicada é
 *   imutável: vale ao publicar). O id é validado contra a lista guardada do servidor.
 * - "Pode rodar sem aprovação" = `ai_agents.config.mcp_externo_liberadas`. Só vale para ferramenta
 *   de ESCRITA, exige `confirmar_sem_aprovacao: true` no corpo (como `confirmar_automatico`) e
 *   deixa rastro na auditoria. No turno só tem efeito no modo automático.
 * - O agente tem de ser da organização da SESSÃO; de outra organização é 404, igual a um que não
 *   existe. Papel: ver `exigirAdminDeServidoresMcp`.
 */
import { randomUUID } from "node:crypto";
import { z } from "zod";
import type { NextRequest } from "next/server";

import { ok, fail } from "@/lib/api/wrappers";
import { audit } from "@/lib/audit";
import { traduzir } from "@/lib/i18n/dicionario";
import { requireSupportWrite } from "@/lib/impersonate/support";
import {
  alternarFerramenta,
  alternarLiberacao,
  estaLiberada,
  marcaDaFerramentaNoAgente,
} from "@/lib/mcp/servidor-externo/ferramentas-do-agente";
import { exigirAdminDeServidoresMcp } from "@/lib/mcp/servidor-externo/quem-administra";
import { obterLinhaDoServidor, paraPublico } from "@/lib/mcp/servidor-externo/repositorio";
import { createAdminClient } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ id: string }> };

const base = { agente_id: z.uuid(), ferramenta: z.string().trim().min(1).max(64) };
const corpoSchema = z.discriminatedUnion("acao", [
  z.object({ acao: z.literal("ligar"), ...base, marca: z.enum(["leitura", "escrita"]).optional() }).strict(),
  z.object({ acao: z.literal("desligar"), ...base }).strict(),
  z
    .object({ acao: z.literal("liberar_sem_aprovacao"), ...base, confirmar_sem_aprovacao: z.boolean().optional() })
    .strict(),
  z.object({ acao: z.literal("exigir_aprovacao"), ...base }).strict(),
]);

type SupabaseAdmin = ReturnType<typeof createAdminClient>;

async function lerAgente(supabase: SupabaseAdmin, organizationId: string, agenteId: string) {
  const { data } = await supabase
    .from("ai_agents")
    .select("id, operation_mode, config, published_version_id")
    .eq("organization_id", organizationId)
    .eq("id", agenteId)
    .maybeSingle();
  return (data ?? null) as {
    id: string;
    operation_mode: string;
    config: unknown;
    published_version_id: string | null;
  } | null;
}

async function lerRascunho(supabase: SupabaseAdmin, organizationId: string, agenteId: string) {
  const { data } = await supabase
    .from("ai_agent_versions")
    .select("id, tool_ids")
    .eq("organization_id", organizationId)
    .eq("agent_id", agenteId)
    .eq("status", "draft")
    .order("version_number", { ascending: false })
    .limit(1)
    .maybeSingle();
  return (data ?? null) as { id: string; tool_ids: string[] | null } | null;
}

export async function GET(req: NextRequest, ctx: Ctx) {
  const requestId = randomUUID();
  const auth = await exigirAdminDeServidoresMcp(requestId);
  if (!auth.ok) return auth.response;
  const t = (texto: string) => traduzir(texto, auth.user.idioma);

  const { id } = await ctx.params;
  const agenteId = req.nextUrl.searchParams.get("agente_id") ?? "";
  if (!z.uuid().safeParse(id).success || !z.uuid().safeParse(agenteId).success) {
    return fail("invalid_request", t("Identificador inválido."), 400, { requestId });
  }

  const organizationId = auth.org.orgId;
  const supabase = createAdminClient();
  const linha = await obterLinhaDoServidor(supabase, organizationId, id);
  if (!linha) return fail("not_found", t("Servidor não encontrado."), 404, { requestId });
  const agente = await lerAgente(supabase, organizationId, agenteId);
  if (!agente) return fail("not_found", t("Agente não encontrado."), 404, { requestId });

  // O rascunho é o que o admin está editando; sem ele, mostra a versão publicada.
  const rascunho = await lerRascunho(supabase, organizationId, agenteId);
  let toolIds: string[] = rascunho?.tool_ids ?? [];
  let versao: "rascunho" | "publicada" | null = rascunho ? "rascunho" : null;
  if (!rascunho && agente.published_version_id) {
    const { data } = await supabase
      .from("ai_agent_versions")
      .select("tool_ids")
      .eq("organization_id", organizationId)
      .eq("id", agente.published_version_id)
      .maybeSingle();
    toolIds = ((data as { tool_ids?: string[] | null } | null)?.tool_ids ?? []) as string[];
    versao = "publicada";
  }

  const servidor = paraPublico(linha);
  return ok(
    {
      servidor_id: servidor.id,
      agente_id: agenteId,
      versao,
      modo_do_agente: agente.operation_mode,
      ferramentas: servidor.ferramentas.map((f) => {
        const marca = marcaDaFerramentaNoAgente(toolIds, linha.slug, f.nome);
        return {
          nome: f.nome,
          ...(f.descricao !== undefined ? { descricao: f.descricao } : {}),
          somente_leitura: f.somente_leitura,
          ligada: marca !== null,
          marca,
          liberada_sem_aprovacao: !f.somente_leitura && estaLiberada(agente.config, linha.slug, f.nome),
        };
      }),
    },
    { requestId },
  );
}

export async function PATCH(req: NextRequest, ctx: Ctx) {
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

  let bruto: unknown;
  try {
    bruto = await req.json();
  } catch {
    return fail("invalid_request", t("Body JSON inválido."), 400, { requestId });
  }
  const parse = corpoSchema.safeParse(bruto);
  if (!parse.success) {
    return fail("validation_failed", t("Campos inválidos."), 422, { requestId });
  }
  const corpo = parse.data;

  // Liberar sem aprovação é o ato mais pesado desta rota: a confirmação vem ANTES de qualquer leitura.
  if (corpo.acao === "liberar_sem_aprovacao" && corpo.confirmar_sem_aprovacao !== true) {
    return fail(
      "ai_confirmacao_exigida",
      t("Para deixar esta ferramenta rodar sem aprovação é preciso confirmar. O agente fará a ação sozinho."),
      422,
      { requestId },
    );
  }

  const organizationId = auth.org.orgId;
  const supabase = createAdminClient();

  const linha = await obterLinhaDoServidor(supabase, organizationId, id);
  if (!linha) return fail("not_found", t("Servidor não encontrado."), 404, { requestId });
  const ferramenta = paraPublico(linha).ferramentas.find((f) => f.nome === corpo.ferramenta);
  if (!ferramenta) {
    return fail(
      "not_found",
      t("Ferramenta não encontrada neste servidor. Use \"atualizar ferramentas\" e tente de novo."),
      404,
      { requestId },
    );
  }
  const agente = await lerAgente(supabase, organizationId, corpo.agente_id);
  if (!agente) return fail("not_found", t("Agente não encontrado."), 404, { requestId });

  const auditoria = {
    actorUserId: auth.user.id,
    organizationId,
    resourceType: "ai_agent",
    resourceId: agente.id,
    requestId,
  };
  const detalhe = { servidor: linha.slug, ferramenta: ferramenta.nome, agente_id: agente.id };

  // ─── Ligar e desligar: tool_ids do rascunho ──────────────────────────────
  if (corpo.acao === "ligar" || corpo.acao === "desligar") {
    if (corpo.acao === "ligar" && !linha.ativo) {
      return fail("state_conflict", t("Este servidor está desativado. Ative-o antes de ligar ferramentas."), 409, { requestId });
    }
    if (corpo.acao === "ligar" && corpo.marca === "leitura" && !ferramenta.somente_leitura) {
      return fail(
        "validation_failed",
        t("O servidor não declarou esta ferramenta como somente de leitura."),
        422,
        { requestId },
      );
    }
    const rascunho = await lerRascunho(supabase, organizationId, agente.id);
    if (!rascunho) {
      return fail(
        "mcp_sem_rascunho",
        t("Este agente não tem um rascunho. Crie uma nova versão do agente para ligar ferramentas."),
        409,
        { requestId },
      );
    }
    const marca = corpo.acao === "desligar" ? null : (corpo.marca ?? "escrita");
    const novo = alternarFerramenta(rascunho.tool_ids ?? [], linha.slug, ferramenta.nome, marca);
    if (!novo.ok) {
      return fail("validation_failed", t("O agente já está com o máximo de ferramentas."), 422, { requestId });
    }
    const { error } = await supabase
      .from("ai_agent_versions")
      .update({ tool_ids: novo.toolIds })
      .eq("id", rascunho.id)
      .eq("organization_id", organizationId)
      .eq("status", "draft");
    if (error) return fail("internal_error", t("Não foi possível salvar agora."), 500, { requestId });

    void audit({
      ...auditoria,
      action: corpo.acao === "ligar" ? "mcp.tool_enabled" : "mcp.tool_disabled",
      metadata: { ...detalhe, marca },
    });
    return ok(
      {
        agente_id: agente.id,
        ferramenta: ferramenta.nome,
        ligada: marca !== null,
        marca,
        versao: "rascunho",
        liberada_sem_aprovacao: !ferramenta.somente_leitura && estaLiberada(agente.config, linha.slug, ferramenta.nome),
        modo_do_agente: agente.operation_mode,
      },
      { requestId },
    );
  }

  // ─── Liberar e voltar a exigir aprovação: ai_agents.config ───────────────
  const liberar = corpo.acao === "liberar_sem_aprovacao";
  if (liberar && ferramenta.somente_leitura) {
    return fail(
      "validation_failed",
      t("Só ferramentas que fazem alguma alteração precisam desta marca. As de leitura já rodam sem aprovação."),
      422,
      { requestId },
    );
  }
  if (liberar && !linha.ativo) {
    return fail("state_conflict", t("Este servidor está desativado. Ative-o antes de liberar ferramentas."), 409, { requestId });
  }
  const config = alternarLiberacao(agente.config, linha.slug, ferramenta.nome, liberar);
  const { error } = await supabase
    .from("ai_agents")
    .update({ config })
    .eq("id", agente.id)
    .eq("organization_id", organizationId);
  if (error) return fail("internal_error", t("Não foi possível salvar agora."), 500, { requestId });

  void audit({
    ...auditoria,
    action: liberar ? "mcp.tool_released_without_approval" : "mcp.tool_release_revoked",
    metadata: { ...detalhe, modo_do_agente: agente.operation_mode, vale_no_modo_automatico: true },
  });
  return ok(
    {
      agente_id: agente.id,
      ferramenta: ferramenta.nome,
      liberada_sem_aprovacao: liberar,
      modo_do_agente: agente.operation_mode,
      // Aviso para a tela: a marca só tem efeito com o agente em modo automático.
      vale_so_no_modo_automatico: true,
    },
    { requestId },
  );
}
