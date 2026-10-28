/**
 * Tarefa interna criada pelo agente (AC-006.3, mudança SDD 006).
 *
 * `crm_create_task` grava um lembrete de trabalho PARA A EQUIPE em `crm_tasks`
 * ("ligar amanhã para confirmar o orçamento"). Nunca fala com o cliente. É a
 * terceira porta do mesmo registro: a tela (`POST /api/v1/tasks`) e a automação
 * (`lib/tarefas/criar-tarefa.ts`) já gravam na mesma tabela, com o mesmo audit e
 * a mesma linha na timeline do negócio — esta só acrescenta o ator "agente".
 *
 * ═══ Idempotência (uma repetição não cria uma segunda tarefa igual) ═══
 *
 * Duas camadas, porque o modelo repete de dois jeitos:
 *   1. RECIBO (`comIdempotencia`, a mesma tabela e a mesma regra do agendamento):
 *      a chave é o `Idempotency-Key` da chamada MCP externa, ou — no turno do
 *      agente — `agent-job:<job>:<hash dos argumentos>`. O retry do job e a
 *      chamada repetida no mesmo turno devolvem o recibo.
 *   2. TAREFA IGUAL AINDA ABERTA: em outro turno não há recibo em comum, e o
 *      cliente que escreve de novo faz o modelo pedir a mesma tarefa. Mesmo
 *      contato, mesmo título e a tarefa ainda aberta (pendente ou em andamento):
 *      devolve a que existe, com `ja_existia: true`. Tarefa concluída ou cancelada
 *      não conta — pedir de novo depois de feita é um pedido novo.
 *
 * ═══ Organização e contato ═══
 *
 * A organização vem de `ctx.organizationId` (token/turno), nunca do argumento, e o
 * contato é conferido contra ela: contato de outra organização é "não encontrado",
 * com a mesma resposta de id inexistente. Dentro de um turno, só o contato da
 * conversa (`ctx.contatoDoTurno`) é aceito. Contato marcado como pessoal está fora
 * da operação e não recebe tarefa.
 *
 * Sem `assigned_to` de propósito: o agente não escolhe responsável (precisaria de um
 * id de usuário que ele não tem como saber). O responsável é o dono do negócio, se
 * houver. Tarefa sem responsável aparece na lista da organização.
 */
import { z } from "zod";

import { audit } from "@/lib/audit";
import { ApiError } from "@/lib/api/types";
import { comIdempotencia, hashDoCorpo } from "@/lib/api/idempotency";
import { resolveActiveLeadForContact, type LeadCandidate } from "@/lib/leads/active-lead";
import { registraAtividadeDaTarefa } from "@/lib/tarefas/atividade";
import { PRIORIDADES_DA_TAREFA } from "@/lib/tarefas/tipos";

import type { McpContext, McpToolDefinition } from "../types";

const ENDPOINT_IDEMPOTENCIA_TAREFA = "mcp:crm_create_task";

const criarTarefaShape = {
  contact_id: z.string().uuid().describe("o contato a quem a tarefa se refere (o cliente desta conversa)"),
  title: z
    .string()
    .trim()
    .min(1)
    .max(255)
    .describe("o que a equipe precisa fazer, numa frase objetiva. Ex.: Ligar para confirmar o orçamento"),
  description: z.string().trim().max(2000).optional().describe("detalhes para quem vai cumprir a tarefa"),
  due_date: z
    .string()
    .datetime({ offset: true })
    .optional()
    .describe("prazo em ISO 8601 com fuso. Omita quando não houver prazo combinado — não invente data"),
  priority: z.enum(PRIORIDADES_DA_TAREFA).optional().describe("low, medium (padrão), high ou urgent"),
};

type EntradaDaTarefa = z.infer<z.ZodObject<typeof criarTarefaShape>>;

const COLUNAS_DA_TAREFA = "id, title, due_date, priority, status, lead_id, contact_id";

type TarefaGravada = {
  id: string;
  title: string;
  due_date: string | null;
  priority: string;
  status: string;
  lead_id: string | null;
  contact_id: string | null;
};

async function negocioAbertoDoContato(
  ctx: McpContext,
  contactId: string,
): Promise<{ leadId: string | null; donoId: string | null }> {
  const { data, error } = await ctx.supabase
    .from("crm_leads")
    .select("id, organization_id, pipeline_id, status, last_activity_at, created_at, owner_user_id")
    .eq("organization_id", ctx.organizationId)
    .eq("contact_id", contactId);
  if (error) throw new ApiError(500, "internal_error", undefined, ctx.requestId, error.message);
  const linhas = (data ?? []) as Array<LeadCandidate & { owner_user_id: string | null }>;
  const r = resolveActiveLeadForContact(linhas);
  if (!r.routed) return { leadId: null, donoId: null };
  return { leadId: r.leadId, donoId: linhas.find((l) => l.id === r.leadId)?.owner_user_id ?? null };
}

async function executarCriacao(
  ctx: McpContext,
  input: EntradaDaTarefa,
  lead: { leadId: string | null; donoId: string | null },
): Promise<Record<string, unknown>> {
  const titulo = input.title.trim();

  // Tarefa igual ainda aberta para o mesmo contato: devolve a que existe.
  const { data: abertas, error: erroDaBusca } = await ctx.supabase
    .from("crm_tasks")
    .select(COLUNAS_DA_TAREFA)
    .eq("organization_id", ctx.organizationId)
    .eq("contact_id", input.contact_id)
    .eq("title", titulo)
    .in("status", ["pending", "in_progress"])
    .limit(1);
  if (erroDaBusca) throw new ApiError(500, "internal_error", undefined, ctx.requestId, erroDaBusca.message);
  const existente = ((abertas ?? []) as TarefaGravada[])[0];
  if (existente) return { criada: false, ja_existia: true, tarefa: existente };

  const { data, error } = await ctx.supabase
    .from("crm_tasks")
    .insert({
      organization_id: ctx.organizationId,
      title: titulo,
      description: input.description ?? null,
      due_date: input.due_date ?? null,
      priority: input.priority ?? "medium",
      status: "pending",
      lead_id: lead.leadId,
      contact_id: input.contact_id,
      assigned_to: lead.donoId,
      // O agente não é uma linha de `auth.users`: sem autor humano, como na tarefa automática.
      created_by: null,
    })
    .select(COLUNAS_DA_TAREFA)
    .single();
  if (error || !data) {
    throw new ApiError(500, "internal_error", undefined, ctx.requestId, error?.message ?? "tarefa não gravada");
  }
  const tarefa = data as TarefaGravada;

  // Perder o audit ou a linha da timeline não desfaz a tarefa que já existe.
  await audit({
    organizationId: ctx.organizationId,
    action: "crm_task.created",
    resourceType: "crm_task",
    resourceId: tarefa.id,
    requestId: ctx.requestId,
    metadata: {
      origem: "mcp:crm_create_task",
      lead_id: tarefa.lead_id,
      contact_id: tarefa.contact_id,
      prioridade: tarefa.priority,
    },
  });
  await registraAtividadeDaTarefa(ctx.supabase, {
    organizationId: ctx.organizationId,
    tarefa,
    tipo: "task_created",
    actor: ctx.actor,
  });

  return { criada: true, ja_existia: false, tarefa };
}

export const crmCreateTask: McpToolDefinition<typeof criarTarefaShape> = {
  name: "crm_create_task",
  description:
    "Cria uma TAREFA INTERNA para a equipe, ligada ao contato desta conversa — um lembrete de trabalho " +
    "('ligar amanhã', 'enviar o contrato'). O cliente não fica sabendo e nada é enviado a ele. " +
    "Use quando algo precisa ser feito por uma PESSOA depois da conversa. Não use para voltar a falar " +
    "com o cliente (isso é `crm_schedule_followup`) nem para marcar horário com ele (isso é a agenda). " +
    "Pedir a mesma tarefa de novo não cria outra: se já existe uma igual aberta, a resposta traz " +
    "`ja_existia: true`. Informe `due_date` só se houver prazo combinado; não invente data.",
  inputSchema: criarTarefaShape,
  category: "write",
  requiresRole: "ai_operator",
  requiresScope: "mcp:write",
  handler: async (input, ctx) => {
    // Contexto de CONFIANÇA do runtime: a conversa é com um cliente, e tarefa sobre outro
    // cliente não é dela. Recusa com motivo em texto (molde de `crm_get_contact`).
    if (ctx.contatoDoTurno && input.contact_id !== ctx.contatoDoTurno) {
      return {
        permitido: false,
        motivo: "fora_da_conversa",
        mensagem:
          "esta conversa é com outra pessoa — a tarefa é sobre o cliente desta conversa; " +
          "siga com quem está falando.",
      };
    }

    const { data: contato, error } = await ctx.supabase
      .from("contacts")
      .select("id, is_personal")
      .eq("organization_id", ctx.organizationId)
      .eq("id", input.contact_id)
      .maybeSingle();
    if (error) throw new ApiError(500, "internal_error", undefined, ctx.requestId, error.message);
    if (!contato) {
      // A mesma resposta para id inexistente e para contato de outra organização.
      throw new ApiError(
        404,
        "not_found",
        undefined,
        ctx.requestId,
        "contato não encontrado nesta organização — confira o contact_id do cliente desta conversa.",
      );
    }
    if ((contato as { is_personal?: boolean }).is_personal === true) {
      return {
        permitido: false,
        motivo: "contato_pessoal",
        mensagem:
          "este contato foi marcado como pessoal — ele está fora da operação e não recebe tarefa; " +
          "siga a conversa com quem está falando.",
      };
    }

    const lead = await negocioAbertoDoContato(ctx, input.contact_id);

    const chave =
      ctx.idempotencyKey ??
      (ctx.sourceJobId ? `agent-job:${ctx.sourceJobId}:${hashDoCorpo(input)}` : null);
    if (chave === null) return executarCriacao(ctx, input, lead);

    const desfecho = await comIdempotencia({
      db: ctx.supabase,
      organizationId: ctx.organizationId,
      endpoint: ENDPOINT_IDEMPOTENCIA_TAREFA,
      chave,
      corpo: input,
      executar: async () => ({ resposta: await executarCriacao(ctx, input, lead), status: 201 }),
    });
    if (desfecho.tipo === "conflito") {
      throw new ApiError(
        409,
        "idempotency_conflict",
        undefined,
        ctx.requestId,
        "Esta chave de idempotência já foi usada com outro conteúdo.",
      );
    }
    if (desfecho.tipo === "em_curso") {
      throw new ApiError(
        409,
        "idempotency_in_progress",
        undefined,
        ctx.requestId,
        "A mesma requisição ainda está em curso. Tente de novo em instantes.",
      );
    }
    return desfecho.resposta;
  },
};
