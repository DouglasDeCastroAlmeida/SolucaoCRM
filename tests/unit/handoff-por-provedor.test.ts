import { describe, expect, it, vi } from "vitest";

import { comHandoffSeOrcamentoAcabar, RESUMO_DO_HANDOFF_POR_PROVEDOR } from "@/lib/agent-engine/agent/inbound-turn";
import type { DesfechoDoAviso } from "@/lib/agent-engine/agent/aviso-de-escalacao";
import {
  classificarFalhaDoProvedor,
  LlmProvedorIndisponivelError,
} from "@/lib/agent-engine/agent/falha-do-provedor";
import { LlmBudgetExceededError } from "@/lib/agent-engine/edge/llm/run-model-call";
import { montarBriefingDaPassagem } from "@/lib/escalacao/briefing-da-passagem";

/**
 * AC-001.7 (mudança SDD 006): provedor de IA que falha de forma que não passa
 * sozinha (chave revogada, saldo zerado, serviço fora depois das tentativas)
 * leva a conversa à fila humana com o motivo `provedor_indisponivel` e abre UM
 * aviso na Central. Falha passageira segue o retry da fila, sem transferir.
 */
const ORG = "11111111-1111-4111-8111-111111111111";
const LEAD = "22222222-2222-4222-8222-222222222222";
const CONVERSA = "33333333-3333-4333-8333-333333333333";

function erroDaApi(statusCode: number | undefined, message = "falhou") {
  return Object.assign(new Error(message), { name: "AI_APICallError", statusCode });
}

function poolFalso(opts: { falhaEm?: string; avisoJaAberto?: boolean } = {}) {
  const chamadas: Array<{ sql: string; params: unknown[] }> = [];
  const query = vi.fn(async (sql: string, params: unknown[] = []) => {
    chamadas.push({ sql, params });
    if (opts.falhaEm !== undefined && sql.includes(opts.falhaEm)) throw new Error("banco fora");
    return { rows: [], rowCount: 0 };
  });
  return { pool: { query } as never, chamadas };
}

function logFalso() {
  return { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() } as never;
}

function contexto(pool: unknown, extra: { ultimaTentativa?: boolean } = {}) {
  return {
    pool: pool as never,
    tenantId: ORG,
    leadId: LEAD,
    conversationId: CONVERSA,
    briefingDoCheckpoint: async (motivo?: string) =>
      montarBriefingDaPassagem({
        checkpoint: null,
        motivo: { codigo: (motivo ?? "orcamento_de_ia") as never },
      }),
    avisarLead: vi.fn(async (): Promise<DesfechoDoAviso> => ({ avisado: true })),
    log: logFalso(),
    ...extra,
  };
}

describe("AC-001.7: classificação da falha do provedor", () => {
  it("AC-001.7: chave recusada (401 e 403) é permanente", () => {
    expect(classificarFalhaDoProvedor(erroDaApi(401))).toMatchObject({ tipo: "permanente", causa: "chave_recusada" });
    expect(classificarFalhaDoProvedor(erroDaApi(403))).toMatchObject({ tipo: "permanente", causa: "chave_recusada" });
  });

  it("AC-001.7: saldo zerado (402 ou a frase do provedor, mesmo com 400/429) é permanente", () => {
    expect(classificarFalhaDoProvedor(erroDaApi(402))).toMatchObject({ tipo: "permanente", causa: "sem_saldo" });
    expect(
      classificarFalhaDoProvedor(erroDaApi(400, "Your credit balance is too low to access the API")),
    ).toMatchObject({ tipo: "permanente", causa: "sem_saldo" });
    expect(
      classificarFalhaDoProvedor(erroDaApi(429, "You exceeded your current quota, insufficient_quota")),
    ).toMatchObject({ tipo: "permanente", causa: "sem_saldo" });
  });

  it("AC-001.7: limite de ritmo (429 comum) e 5xx isolado são passageiros", () => {
    expect(classificarFalhaDoProvedor(erroDaApi(429, "Rate limit reached"))).toEqual({ tipo: "transitoria" });
    expect(classificarFalhaDoProvedor(erroDaApi(503))).toEqual({ tipo: "transitoria" });
    expect(classificarFalhaDoProvedor(erroDaApi(undefined, "fetch failed"))).toEqual({ tipo: "transitoria" });
  });

  it("AC-001.7: 5xx ou rede só viram permanentes na ÚLTIMA tentativa da fila", () => {
    expect(classificarFalhaDoProvedor(erroDaApi(503), { ultimaTentativa: true })).toMatchObject({
      tipo: "permanente",
      causa: "provedor_fora",
    });
    expect(classificarFalhaDoProvedor(erroDaApi(undefined, "fetch failed"), { ultimaTentativa: true })).toMatchObject({
      tipo: "permanente",
      causa: "provedor_fora",
    });
    // 429 de ritmo na última tentativa continua não sendo "provedor fora".
    expect(classificarFalhaDoProvedor(erroDaApi(429, "Rate limit"), { ultimaTentativa: true })).toEqual({
      tipo: "transitoria",
    });
  });

  it("AC-001.7: o erro embrulhado em nova tentativa do SDK é lido pela causa", () => {
    const embrulhado = Object.assign(new Error("Failed after 3 attempts"), {
      name: "AI_RetryError",
      lastError: erroDaApi(401),
    });
    expect(classificarFalhaDoProvedor(embrulhado)).toMatchObject({ tipo: "permanente", causa: "chave_recusada" });
  });

  it("AC-001.7: erro de ferramenta COM status 401/402/503 não é falha do provedor", () => {
    const daFerramenta = Object.assign(new Error("x"), { statusCode: 401 });
    expect(classificarFalhaDoProvedor(daFerramenta)).toEqual({ tipo: "transitoria" });
    expect(classificarFalhaDoProvedor(Object.assign(new Error("x"), { status: 402 }))).toEqual({ tipo: "transitoria" });
    expect(
      classificarFalhaDoProvedor(Object.assign(new Error("x"), { statusCode: 503 }), { ultimaTentativa: true }),
    ).toEqual({ tipo: "transitoria" });
    const embrulhado = Object.assign(new Error("tool failed"), {
      name: "AI_ToolExecutionError",
      cause: Object.assign(new Error("agenda"), { statusCode: 401 }),
    });
    expect(classificarFalhaDoProvedor(embrulhado)).toEqual({ tipo: "transitoria" });
  });

  it("AC-001.7: erro que não veio do provedor nunca é classificado (ferramenta com 401 própria)", () => {
    expect(classificarFalhaDoProvedor(new Error("401 unauthorized ao chamar a agenda"))).toEqual({
      tipo: "transitoria",
    });
    expect(classificarFalhaDoProvedor(new Error("fetch failed"), { ultimaTentativa: true })).toEqual({
      tipo: "transitoria",
    });
  });
});

describe("AC-001.7: a escolta leva a conversa à fila humana quando o provedor falha", () => {
  it("AC-001.7: chave recusada -> passagem com o motivo provedor_indisponivel e UM aviso na Central", async () => {
    const { pool, chamadas } = poolFalso();
    const ctx = contexto(pool);

    const erro = await comHandoffSeOrcamentoAcabar(ctx, async () => {
      throw erroDaApi(401, "Incorrect API key provided: sk-ant-abcdefghijklmnop");
    }).catch((e: unknown) => e);

    // A fila lê `terminal`: a conversa já está com uma pessoa, retentar é ruído.
    expect(erro).toBeInstanceOf(LlmProvedorIndisponivelError);
    expect((erro as LlmProvedorIndisponivelError).terminal).toBe(true);
    expect((erro as Error).message, "segredo do provedor na mensagem do erro").not.toContain("sk-ant");

    const conversa = chamadas.find((c) => c.sql.includes("update conversations"));
    expect(conversa?.sql).toContain("'ai_handling' then 'pending'");
    expect(conversa?.params?.[0]).toBe(ORG);
    expect(conversa?.params?.[1]).toBe(CONVERSA);

    const passagem = chamadas.find((c) => c.sql.includes("insert into passagens_de_atendimento"));
    expect(passagem?.params).toContain("provedor_indisponivel");
    expect(passagem?.params).toContain("runtime_nativo");
    expect(
      passagem?.params?.some((p) => typeof p === "string" && p.includes(RESUMO_DO_HANDOFF_POR_PROVEDOR)),
      "o resumo de quem assume tem de dizer que o serviço de IA falhou",
    ).toBe(true);

    const itens = chamadas.filter(
      (c) => c.sql.includes("insert into agent_inbox_items") && c.sql.includes("ia_provedor_indisponivel"),
    );
    expect(itens, "nenhum aviso ia_provedor_indisponivel na Central").toHaveLength(1);
    // Isolamento e idempotência: filtra a organização e não duplica enquanto houver aviso vivo.
    expect(itens[0]?.params?.[0]).toBe(ORG);
    expect(itens[0]?.sql).toMatch(/not exists/iu);
    expect(itens[0]?.sql).toMatch(/status in \('open', ?'ack'\)/iu);
    // Texto claro, sem código nem segredo.
    const texto = (itens[0]?.params ?? []).filter((p) => typeof p === "string").join(" ");
    expect(texto).toContain("Configurações");
    expect(texto).not.toContain("sk-ant");
    expect(texto).not.toContain("provedor_indisponivel");
  });

  it("AC-001.7: o lead é avisado ANTES da trava, como no teto de gasto", async () => {
    const { pool, chamadas } = poolFalso();
    const ctx = contexto(pool);
    let naChamada = -1;
    ctx.avisarLead.mockImplementation(async () => {
      naChamada = chamadas.length;
      return { avisado: true };
    });
    await comHandoffSeOrcamentoAcabar(ctx, async () => {
      throw erroDaApi(402);
    }).catch(() => undefined);
    const iForceHuman = chamadas.findIndex((c) => c.sql.includes("set force_human = true"));
    expect(ctx.avisarLead).toHaveBeenCalledTimes(1);
    expect(naChamada).toBeLessThanOrEqual(iForceHuman);
  });

  it("AC-001.7: falha passageira NÃO transfere e sobe igual (retry da fila)", async () => {
    const { pool, chamadas } = poolFalso();
    const passageira = erroDaApi(503);
    await expect(comHandoffSeOrcamentoAcabar(contexto(pool), async () => { throw passageira; })).rejects.toBe(passageira);
    expect(chamadas).toEqual([]);
  });

  it("AC-001.7: 5xx na última tentativa transfere", async () => {
    const { pool, chamadas } = poolFalso();
    await expect(
      comHandoffSeOrcamentoAcabar(contexto(pool, { ultimaTentativa: true }), async () => {
        throw erroDaApi(503);
      }),
    ).rejects.toBeInstanceOf(LlmProvedorIndisponivelError);
    expect(chamadas.some((c) => c.sql.includes("insert into passagens_de_atendimento"))).toBe(true);
  });

  it("AC-001.7: falha ao abrir o aviso da Central não derruba a passagem", async () => {
    const { pool, chamadas } = poolFalso({ falhaEm: "ia_provedor_indisponivel" });
    await expect(
      comHandoffSeOrcamentoAcabar(contexto(pool), async () => {
        throw erroDaApi(401);
      }),
    ).rejects.toBeInstanceOf(LlmProvedorIndisponivelError);
    expect(chamadas.some((c) => c.sql.includes("insert into passagens_de_atendimento"))).toBe(true);
  });

  it("AC-001.7: orçamento esgotado segue com o próprio motivo (sem aviso de provedor)", async () => {
    const { pool, chamadas } = poolFalso();
    await expect(
      comHandoffSeOrcamentoAcabar(contexto(pool), async () => {
        throw new LlmBudgetExceededError();
      }),
    ).rejects.toBeInstanceOf(LlmBudgetExceededError);
    expect(chamadas.some((c) => c.sql.includes("ia_provedor_indisponivel"))).toBe(false);
  });
});
