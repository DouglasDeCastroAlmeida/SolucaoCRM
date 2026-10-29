import { beforeEach, describe, expect, it, vi } from "vitest";
import { z } from "zod";

/**
 * crm_create_task (mudança SDD 006, T-026/T-027): AC-006.3, AC-006.5 e AC-006.6.
 * O banco é em memória: filtros `eq`/`in` valem de verdade, então o teste de organização
 * mede o que a consulta realmente alcança, e não o que o código diz alcançar.
 */
const deps = vi.hoisted(() => ({
  audit: vi.fn(async () => undefined),
  atividade: vi.fn(async () => undefined),
  recibos: new Map<string, unknown>(),
}));

vi.mock("@/lib/audit", () => ({ audit: deps.audit }));
vi.mock("@/lib/tarefas/atividade", () => ({ registraAtividadeDaTarefa: deps.atividade }));
vi.mock("@/lib/api/idempotency", async (original) => ({
  ...(await original<Record<string, unknown>>()),
  // Recibo em memória: a primeira chamada com a chave executa; a repetição devolve o recibo.
  comIdempotencia: vi.fn(async (e: { chave: string; executar: () => Promise<{ resposta: unknown; status: number }> }) => {
    if (deps.recibos.has(e.chave)) return { tipo: "replay", resposta: deps.recibos.get(e.chave), status: 201 };
    const r = await e.executar();
    deps.recibos.set(e.chave, r.resposta);
    return { tipo: "executou", ...r };
  }),
}));

import { crmCreateTask } from "./tarefas";
import { ALVO_DE_FUNIL } from "@/lib/leads/escopo-de-funil";
import { ESCOPO_DAS_ESCRITAS } from "@/lib/ai/runtime/escopo-das-escritas";
import { TOOL_CATALOG, VALID_TOOL_IDS } from "./catalog";

const ORG = "11111111-1111-4111-8111-111111111111";
const OUTRA_ORG = "99999999-9999-4999-8999-999999999999";
const CONTATO = "22222222-2222-4222-8222-222222222222";
const CONTATO_ALHEIO = "88888888-8888-4888-8888-888888888888";
const OUTRO_CONTATO_DA_ORG = "77777777-7777-4777-8777-777777777777";
const LEAD = "33333333-3333-4333-8333-333333333333";

type Linha = Record<string, unknown>;

function banco(tabelas: Record<string, Linha[]>) {
  const inseridos: Array<{ tabela: string; linha: Linha }> = [];
  const filtrosVistos: Array<{ tabela: string; filtros: Array<[string, unknown]> }> = [];
  const supabase = {
    from(tabela: string) {
      const filtros: Array<[string, unknown]> = [];
      let linhaInserida: Linha | null = null;
      const lidas = () =>
        (tabelas[tabela] ?? []).filter((l) =>
          filtros.every(([campo, valor]) =>
            Array.isArray(valor) ? valor.includes(l[campo]) : l[campo] === valor,
          ),
        );
      const q: Record<string, unknown> = {
        select: () => q,
        eq: (campo: string, valor: unknown) => (filtros.push([campo, valor]), q),
        in: (campo: string, valor: unknown[]) => (filtros.push([campo, valor]), q),
        limit: () => q,
        order: () => q,
        insert: (linha: Linha) => {
          linhaInserida = { id: `tarefa-${(tabelas[tabela]?.length ?? 0) + 1}`, ...linha };
          (tabelas[tabela] ??= []).push(linhaInserida);
          inseridos.push({ tabela, linha: linhaInserida });
          return q;
        },
        maybeSingle: async () => {
          filtrosVistos.push({ tabela, filtros: [...filtros] });
          return { data: linhaInserida ?? lidas()[0] ?? null, error: null };
        },
        single: async () => ({ data: linhaInserida, error: null }),
        then: (resolve: (v: unknown) => void) => {
          filtrosVistos.push({ tabela, filtros: [...filtros] });
          resolve({ data: lidas(), error: null });
        },
      };
      return q;
    },
  };
  return { supabase, tabelas, inseridos, filtrosVistos };
}

function mundo(extra: Partial<Record<string, Linha[]>> = {}) {
  return banco({
    contacts: [
      { id: CONTATO, organization_id: ORG, is_personal: false },
      { id: OUTRO_CONTATO_DA_ORG, organization_id: ORG, is_personal: false },
      { id: CONTATO_ALHEIO, organization_id: OUTRA_ORG, is_personal: false },
    ],
    crm_leads: [
      {
        id: LEAD,
        organization_id: ORG,
        contact_id: CONTATO,
        pipeline_id: "p1",
        status: "open",
        owner_user_id: null,
        last_activity_at: "2026-10-01T00:00:00Z",
        created_at: "2026-10-01T00:00:00Z",
      },
    ],
    crm_tasks: [],
    ...extra,
  } as Record<string, Linha[]>);
}

function ctx(m: ReturnType<typeof mundo>, extra: Record<string, unknown> = {}) {
  return {
    supabase: m.supabase,
    organizationId: ORG,
    actor: { type: "ai_agent", id: "agente-1" },
    requestId: "req-1",
    role: "ai_operator",
    apiTokenId: "tok",
    ...extra,
  } as never;
}

const ENTRADA = { contact_id: CONTATO, title: "Ligar amanhã para confirmar o orçamento" } as never;

beforeEach(() => {
  vi.clearAllMocks();
  deps.recibos.clear();
});

describe("AC-006.3: criar tarefa vinculada ao contato", () => {
  it("AC-006.3: grava uma tarefa da organização do agente, ligada ao contato e ao único negócio aberto", async () => {
    const m = mundo();
    const r = (await crmCreateTask.handler(ENTRADA, ctx(m))) as Record<string, unknown>;
    expect(r.criada).toBe(true);
    expect(m.inseridos).toHaveLength(1);
    expect(m.inseridos[0]!.linha).toMatchObject({
      organization_id: ORG,
      contact_id: CONTATO,
      lead_id: LEAD,
      title: "Ligar amanhã para confirmar o orçamento",
      status: "pending",
      priority: "medium",
      created_by: null,
    });
    expect(deps.audit).toHaveBeenCalledWith(
      expect.objectContaining({ action: "crm_task.created", organizationId: ORG }),
    );
    expect(deps.atividade).toHaveBeenCalledTimes(1);
  });

  it("AC-006.3: a repetição com a mesma chave de idempotência devolve o recibo e não cria outra", async () => {
    const m = mundo();
    const c = ctx(m, { idempotencyKey: "chave-1" });
    const primeira = (await crmCreateTask.handler(ENTRADA, c)) as Record<string, unknown>;
    const segunda = (await crmCreateTask.handler(ENTRADA, c)) as Record<string, unknown>;
    expect(m.tabelas.crm_tasks).toHaveLength(1);
    expect(segunda).toEqual(primeira);
  });

  it("AC-006.3: sem chave, a repetição do mesmo job do agente com os mesmos dados não cria outra", async () => {
    const m = mundo();
    const c = ctx(m, { sourceJobId: "job-1" });
    await crmCreateTask.handler(ENTRADA, c);
    await crmCreateTask.handler(ENTRADA, c);
    expect(m.tabelas.crm_tasks).toHaveLength(1);
  });

  it("AC-006.3: em outro turno, tarefa igual ainda aberta para o mesmo contato não é duplicada", async () => {
    const m = mundo();
    await crmCreateTask.handler(ENTRADA, ctx(m, { sourceJobId: "job-1" }));
    const r = (await crmCreateTask.handler(ENTRADA, ctx(m, { sourceJobId: "job-2" }))) as Record<string, unknown>;
    expect(m.tabelas.crm_tasks).toHaveLength(1);
    expect(r).toMatchObject({ criada: false, ja_existia: true });
  });

  it("AC-006.3: título igual para OUTRO contato é outra tarefa", async () => {
    const m = mundo();
    await crmCreateTask.handler(ENTRADA, ctx(m, { sourceJobId: "job-1" }));
    await crmCreateTask.handler(
      { ...(ENTRADA as object), contact_id: OUTRO_CONTATO_DA_ORG } as never,
      ctx(m, { sourceJobId: "job-2" }),
    );
    expect(m.tabelas.crm_tasks).toHaveLength(2);
  });
});

describe("AC-006.5: argumentos inválidos devolvem erro claro e não gravam", () => {
  const schema = z.object(crmCreateTask.inputSchema);

  it.each([
    ["contato que não é um id", { contact_id: "joao", title: "x" }],
    ["título vazio", { contact_id: CONTATO, title: "   " }],
    ["título longo demais", { contact_id: CONTATO, title: "a".repeat(256) }],
    ["prazo sem data", { contact_id: CONTATO, title: "x", due_date: "amanhã" }],
    ["prioridade fora da lista", { contact_id: CONTATO, title: "x", priority: "altissima" }],
    ["sem contato", { title: "x" }],
  ])("AC-006.5: recusa %s antes de qualquer gravação", (_nome, entrada) => {
    expect(schema.safeParse(entrada).success).toBe(false);
  });

  it("AC-006.5: contato que não existe vira erro claro ao modelo e nada é gravado", async () => {
    const m = mundo();
    await expect(
      crmCreateTask.handler(
        { contact_id: "55555555-5555-4555-8555-555555555555", title: "x" } as never,
        ctx(m, { sourceJobId: "job-1" }),
      ),
    ).rejects.toThrow(/contato/i);
    expect(m.inseridos).toHaveLength(0);
    expect(deps.audit).not.toHaveBeenCalled();
  });

  it("AC-006.5: contato marcado como pessoal é recusado com motivo e nada é gravado", async () => {
    const m = mundo({ contacts: [{ id: CONTATO, organization_id: ORG, is_personal: true }] });
    const r = (await crmCreateTask.handler(ENTRADA, ctx(m))) as Record<string, unknown>;
    expect(r).toMatchObject({ permitido: false, motivo: "contato_pessoal" });
    expect(m.inseridos).toHaveLength(0);
  });
});

describe("AC-006.6: só atua dentro da organização do agente", () => {
  it("AC-006.6: a organização não é argumento da ferramenta", () => {
    expect(Object.keys(crmCreateTask.inputSchema)).not.toContain("organization_id");
    expect(Object.keys(crmCreateTask.inputSchema)).not.toContain("assigned_to");
  });

  it("AC-006.6: contato de outra organização é 'não encontrado' e nada é gravado", async () => {
    const m = mundo();
    await expect(
      crmCreateTask.handler(
        { contact_id: CONTATO_ALHEIO, title: "invadir" } as never,
        ctx(m, { sourceJobId: "job-1" }),
      ),
    ).rejects.toThrow(/contato/i);
    expect(m.inseridos).toHaveLength(0);
    // toda leitura de tabela do tenant filtrou pela organização do contexto
    for (const { tabela, filtros } of m.filtrosVistos) {
      expect(filtros, tabela).toContainEqual(["organization_id", ORG]);
    }
  });

  it("AC-006.6: com contato do turno, tarefa para outro cliente é recusada", async () => {
    const m = mundo();
    const r = (await crmCreateTask.handler(
      { contact_id: OUTRO_CONTATO_DA_ORG, title: "x" } as never,
      ctx(m, { contatoDoTurno: CONTATO }),
    )) as Record<string, unknown>;
    expect(r).toMatchObject({ permitido: false, motivo: "fora_da_conversa" });
    expect(m.inseridos).toHaveLength(0);
  });
});

describe("T-027: a ferramenta está onde o agente a enumera", () => {
  it("o catálogo, os ids válidos e as tabelas de escopo conhecem crm_create_task", () => {
    expect(TOOL_CATALOG.some((t) => t.name === "crm_create_task" && t.category === "write")).toBe(true);
    expect(VALID_TOOL_IDS).toContain("crm_create_task");
    expect(ALVO_DE_FUNIL.crm_create_task).toBeDefined();
    expect(ESCOPO_DAS_ESCRITAS.crm_create_task).toEqual({ contact_id: "contato" });
  });
});
