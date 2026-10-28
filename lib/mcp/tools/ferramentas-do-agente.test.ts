import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Ferramentas do agente (mudança SDD 006, T-026): caracteriza o que já existia e fixa o que mudou.
 *
 *   AC-006.1  marcar horário: o recibo de idempotência é pedido ao handler compartilhado
 *             (a repetição em si é provada em tests/api/agenda-idempotencia.test.ts).
 *   AC-006.2  mover etapa: repetir o movimento para a etapa em que o negócio JÁ está não escreve nada
 *             (NOVO — antes a repetição gravava outra atividade "movido de X para X" e outro evento).
 *   AC-006.4  base de conhecimento: o trecho vem com o nome da fonte, e a busca só alcança a organização do agente.
 *   AC-006.6  nenhuma delas atua fora da organização do agente.
 *
 * A criação de tarefa (AC-006.3) tem o arquivo próprio `tarefas.test.ts`.
 */
const deps = vi.hoisted(() => ({
  marcar: vi.fn(),
  mover: vi.fn(),
  embed: vi.fn(async () => ({ embedding: [0.1, 0.2], model: "text-embedding-3-small" })),
}));

vi.mock("@/app/api/v1/agenda/agendamentos/_handler", () => ({
  marcarAgendamentoHandler: deps.marcar,
  horariosLivresHandler: vi.fn(),
  alterarAgendamentoHandler: vi.fn(),
  cancelarAgendamentoHandler: vi.fn(),
}));
vi.mock("@/app/api/v1/leads/_handler", async (original) => ({
  ...(await original<Record<string, unknown>>()),
  moveLeadHandler: deps.mover,
}));
vi.mock("@/lib/ai/embed", () => ({ embedText: deps.embed }));

import { crmBookAppointment } from "./agendamento";
import { crmMoveLeadStage } from "./leads";
import { crmSearchKnowledge } from "./evolucao";

const ORG = "11111111-1111-4111-8111-111111111111";
const LEAD = "22222222-2222-4222-8222-222222222222";
const ETAPA_A = "33333333-3333-4333-8333-333333333333";
const ETAPA_B = "44444444-4444-4444-8444-444444444444";
const AGENTE = "55555555-5555-4555-8555-555555555555";
const FONTE = "66666666-6666-4666-8666-666666666666";
const CONTATO = "77777777-7777-4777-8777-777777777777";

beforeEach(() => {
  vi.clearAllMocks();
});

describe("AC-006.1: marcar horário passa a chave de idempotência ao handler compartilhado", () => {
  const supabase = {
    from: () => ({
      select: () => ({
        eq: () => ({ eq: () => ({ maybeSingle: async () => ({ data: { id: "tipo-1" }, error: null }) }) }),
      }),
    }),
  };

  it("AC-006.1: a chave do chamador e o job do turno chegam ao handler, junto com a organização do contexto", async () => {
    deps.marcar.mockResolvedValue({
      id: "c1",
      status: "confirmed",
      starts_at: "2026-12-01T12:00:00.000Z",
      ends_at: "2026-12-01T13:00:00.000Z",
      time_zone: "America/Sao_Paulo",
      revision: 1,
      meeting_state: "not_requested",
    });
    await crmBookAppointment.handler(
      { event_type_slug: "consulta", starts_at: "2026-12-01T12:00:00.000Z", contact_id: CONTATO } as never,
      {
        supabase,
        organizationId: ORG,
        actor: { type: "ai_agent", id: AGENTE },
        requestId: "r",
        idempotencyKey: "chave-1",
        sourceJobId: "job-1",
      } as never,
    );
    const [, ctxDoHandler] = deps.marcar.mock.calls[0]!;
    expect(ctxDoHandler).toMatchObject({ organization_id: ORG, idempotencyKey: "chave-1", sourceJobId: "job-1" });
  });
});

describe("AC-006.2: mover etapa sem efeito duplicado", () => {
  function ctxComLead(lead: Record<string, unknown> | null) {
    const filtros: Array<[string, unknown]> = [];
    const q: Record<string, unknown> = {
      select: () => q,
      eq: (c: string, v: unknown) => (filtros.push([c, v]), q),
      maybeSingle: async () => ({ data: lead, error: null }),
    };
    return {
      ctx: {
        supabase: { from: () => q },
        organizationId: ORG,
        actor: { type: "ai_agent", id: AGENTE },
        requestId: "r",
      } as never,
      filtros,
    };
  }
  const lead = { id: LEAD, organization_id: ORG, stage_id: ETAPA_A, pipeline_id: "p" };

  it("AC-006.2: o negócio que já está na etapa pedida não é escrito de novo", async () => {
    const { ctx, filtros } = ctxComLead(lead);
    const r = (await crmMoveLeadStage.handler({ lead_id: LEAD, to_stage_id: ETAPA_A } as never, ctx)) as Record<string, unknown>;
    expect(deps.mover).not.toHaveBeenCalled();
    expect(r).toMatchObject({ ja_estava_na_etapa: true });
    expect((r.lead as Record<string, unknown>).id).toBe(LEAD);
    // a leitura que decide isso filtra pela organização do agente
    expect(filtros).toContainEqual(["organization_id", ORG]);
  });

  it("AC-006.2: mover para outra etapa segue pelo handler compartilhado (o movimento de verdade)", async () => {
    deps.mover.mockResolvedValue({ id: LEAD, stage_id: ETAPA_B });
    const { ctx } = ctxComLead(lead);
    const r = (await crmMoveLeadStage.handler({ lead_id: LEAD, to_stage_id: ETAPA_B } as never, ctx)) as Record<string, unknown>;
    expect(deps.mover).toHaveBeenCalledTimes(1);
    expect(r).toEqual({ lead: { id: LEAD, stage_id: ETAPA_B } });
  });

  it("AC-006.2: pedir posição, ganho ou perda na etapa atual continua indo ao handler (não é repetição)", async () => {
    deps.mover.mockResolvedValue({ id: LEAD });
    for (const extra of [{ position_in_stage: 5 }, { won_reason: "fechou" }, { lost_reason: "preco" }]) {
      const { ctx } = ctxComLead(lead);
      await crmMoveLeadStage.handler({ lead_id: LEAD, to_stage_id: ETAPA_A, ...extra } as never, ctx);
    }
    expect(deps.mover).toHaveBeenCalledTimes(3);
  });

  it("AC-006.2/AC-006.6: negócio de outra organização não é achado e o handler decide (404), sem atalho", async () => {
    deps.mover.mockRejectedValue(new Error("Lead não encontrado."));
    const { ctx } = ctxComLead(null);
    await expect(
      crmMoveLeadStage.handler({ lead_id: LEAD, to_stage_id: ETAPA_A } as never, ctx),
    ).rejects.toThrow(/não encontrado/);
    expect(deps.mover).toHaveBeenCalledTimes(1);
  });
});

describe("AC-006.4 e AC-006.6: base de conhecimento cita a fonte e só alcança a organização do agente", () => {
  function supabaseDoAcervo() {
    const rpc = vi.fn(async () => ({
      data: [
        { chunk_id: "k1", knowledge_source_id: FONTE, source_name: "Manual de preços 2026", content: "A consulta custa R$ 200.", similarity: 0.82 },
        { chunk_id: "k2", knowledge_source_id: FONTE, source_name: "Manual de preços 2026", content: "Aceitamos PIX.", similarity: 0.1 },
      ],
      error: null,
    }));
    const consultas: Array<{ tabela: string; filtros: Array<[string, unknown]> }> = [];
    const supabase = {
      rpc,
      from(tabela: string) {
        const filtros: Array<[string, unknown]> = [];
        const q: Record<string, unknown> = {
          select: () => q,
          eq: (c: string, v: unknown) => (filtros.push([c, v]), q),
          maybeSingle: async () => {
            consultas.push({ tabela, filtros: [...filtros] });
            return tabela === "ai_agents"
              ? { data: { active_kb_version_id: null, published_version_id: "v1" }, error: null }
              : { data: { knowledge_source_ids: [FONTE] }, error: null };
          },
        };
        return q;
      },
    };
    return { supabase, rpc, consultas };
  }
  const ctx = (supabase: unknown) =>
    ({ supabase, organizationId: ORG, actor: { type: "ai_agent", id: AGENTE }, requestId: "r" }) as never;

  it("AC-006.4: o trecho vem com o nome do material de onde saiu, e só passa o que está acima do limiar", async () => {
    const { supabase } = supabaseDoAcervo();
    const r = (await crmSearchKnowledge.handler({ pergunta: "quanto custa a consulta?", quantidade: 5 } as never, ctx(supabase))) as {
      trechos: Array<{ source_name: string; content: string }>;
      melhor_similaridade: number;
    };
    expect(r.trechos).toHaveLength(1);
    expect(r.trechos[0]).toMatchObject({ source_name: "Manual de preços 2026", content: "A consulta custa R$ 200." });
    expect(r.melhor_similaridade).toBe(0.82);
  });

  it("AC-006.6: a organização da busca vem do contexto, e o acervo é resolvido por agente DA organização", async () => {
    const { supabase, rpc, consultas } = supabaseDoAcervo();
    await crmSearchKnowledge.handler({ pergunta: "preço", quantidade: 5 } as never, ctx(supabase));
    expect(rpc).toHaveBeenCalledWith(
      "fn_buscar_trechos_das_fontes",
      expect.objectContaining({ p_organization_id: ORG, p_source_ids: [FONTE] }),
    );
    expect(deps.embed).toHaveBeenCalledWith("preço", expect.objectContaining({ organizationId: ORG }));
    for (const { tabela, filtros } of consultas) expect(filtros, tabela).toContainEqual(["organization_id", ORG]);
  });

  it("AC-006.6: a organização não é argumento — o agente não escolhe de quem é o acervo", () => {
    expect(Object.keys(crmSearchKnowledge.inputSchema)).not.toContain("organization_id");
  });

  it("AC-006.4: agente de outra organização não tem acervo (nada é buscado)", async () => {
    const rpc = vi.fn();
    const q: Record<string, unknown> = { select: () => q, eq: () => q, maybeSingle: async () => ({ data: null, error: null }) };
    const r = (await crmSearchKnowledge.handler(
      { pergunta: "preço", quantidade: 5 } as never,
      ctx({ rpc, from: () => q }),
    )) as Record<string, unknown>;
    expect(rpc).not.toHaveBeenCalled();
    expect(r).toMatchObject({ trechos: [], aviso: "assistente_sem_acervo_publicado" });
  });
});
