import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/atendimento/fronteira-server", () => ({ guardServiceEffect: vi.fn(async () => {}) }));
vi.mock("@/lib/escalacao/disponibilidade", () => ({
  expectativaDeAtendimento: vi.fn(async () => ({ frase: "A equipe dará continuidade." })),
}));
vi.mock("@/lib/leads/agent-activity", () => ({ emitAgentActivityForContact: vi.fn(async () => true) }));
vi.mock("@/lib/agent-engine/cron/scheduler", () => ({ cancelPendingCronsForLead: vi.fn(async () => {}) }));

import {
  applyRequestHumanHandoff,
  detectHumanHandoffRequest,
  isLeadInHandoff,
  performHumanHandoff,
} from "@/lib/agent-engine/agent/human-handoff";
import { AGENT_TOOL_DEFS, descricaoDaFerramentaDePassagem } from "@/lib/agent-engine/agent/inbound-turn";
import { FRASE_DO_MOTIVO } from "@/lib/escalacao/passagem";

/**
 * Caracterização do handoff que JÁ EXISTE (mudança SDD 006, T-023): AC-005.1, 005.2 e 005.4.
 * Fixa o comportamento atual; não acrescenta nenhum. O que NÃO existia (contador de erros
 * de ferramenta, AC-005.3) tem o seu próprio arquivo: lib/ai/handoff/falhas-de-ferramenta.test.ts.
 */
const ids = { tenantId: "org-teste", leadId: "contato-teste", conversationId: "conversa-teste" };
const consultas: Array<{ sql: string; params: readonly unknown[] }> = [];
const db = {
  query: vi.fn(async (sql: string, params: readonly unknown[] = []) => {
    consultas.push({ sql, params });
    if (/select \(\s*c\.force_human/.test(sql)) return { rows: [{ handoff: true }], rowCount: 1 };
    return { rows: [], rowCount: 0 };
  }),
};
const log = { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn(), child: () => log };

function consulta(padrao: RegExp) {
  const achada = consultas.find(({ sql }) => padrao.test(sql));
  expect(achada, `consulta esperada: ${padrao}`).toBeDefined();
  return achada!;
}

beforeEach(() => {
  consultas.length = 0;
  vi.clearAllMocks();
});

describe("AC-005.1: o cliente pede uma pessoa", () => {
  it("AC-005.1: o pedido explícito de atendente é reconhecido sem gastar o modelo", () => {
    for (const frase of [
      "quero falar com um atendente",
      "Me passa pra um atendente, por favor",
      "preciso de atendimento humano",
      "quero um atendente de verdade",
    ]) {
      expect(detectHumanHandoffRequest(frase), frase).toBe(true);
    }
    expect(detectHumanHandoffRequest("qual o preço da consulta?")).toBe(false);
    expect(detectHumanHandoffRequest("   ")).toBe(false);
  });

  it("AC-005.1: a passagem vai para a fila humana e silencia o agente nesta conversa", async () => {
    await performHumanHandoff(db as never, ids, {
      reason: "requested_human",
      conversationSummary: "resumo",
      passagem: {
        origem: "runtime_nativo",
        motivoCodigo: "requested_human",
        briefing: { body: "O cliente quer uma pessoa.", fatos: {} } as never,
      },
      log: log as never,
    });
    expect(consulta(/update contacts set force_human = true/).params).toEqual([ids.tenantId, ids.leadId]);
    const conversa = consulta(/update conversations/);
    // 'ai_handling' vira 'pending' (fila humana) e o silêncio é permanente.
    expect(conversa.sql).toMatch(/then 'pending'/);
    expect(conversa.params.slice(0, 3)).toEqual([ids.tenantId, ids.conversationId, "infinity"]);
    expect(consulta(/insert into agent_inbox_items/).params[0]).toBe(ids.tenantId);
  });

  it("AC-005.1: o agente para de responder: força humano ou silêncio vigente barram o turno", async () => {
    await expect(isLeadInHandoff(db as never, ids.tenantId, ids.leadId)).resolves.toBe(true);
    const leitura = consulta(/c\.force_human/);
    expect(leitura.sql).toContain("bot_silenced_until");
    expect(leitura.params).toEqual([ids.tenantId, ids.leadId]);
  });
});

describe("AC-005.1: o reconhecimento do pedido de uma pessoa", () => {
  it.each([
    "Quero me passar para uma pessoa",
    "pode me transferir para um atendente?",
    "preciso me encaminhar pro humano",
    "quero um atendente",
    "Preciso de um humano, por favor",
    "queria falar com uma pessoa",
    "gostaria de falar com um atendente",
    "prefiro ser atendido por uma pessoa",
    // Pré-existente e deliberado: a negação não é tratada. Passar a conversa a uma pessoa é o
    // lado seguro do erro, e o aviso ao cliente diz o que aconteceu.
    "não quero falar com humano",
  ])("AC-005.1: reconhece %j", (frase) => {
    expect(detectHumanHandoffRequest(frase)).toBe(true);
  });

  it.each([
    "pessoa",
    "a pessoa que me atendeu ontem foi ótima",
    "sou pessoa física",
    "o atendente foi ótimo",
    "fui atendido por uma pessoa muito educada",
    "pode me passar para a pessoa que me atendeu ontem?",
    "preciso de um orçamento",
    "quero um agendamento",
    "preciso de um atestado humano",
  ])("AC-005.1: não reconhece %j", (frase) => {
    expect(detectHumanHandoffRequest(frase)).toBe(false);
  });
});

describe("AC-005.2: sem segurança, o agente transfere em vez de inventar", () => {
  it("AC-005.2: a ferramenta de passagem manda passar quando o limite do que pode resolver é atingido", () => {
    const descricao = AGENT_TOOL_DEFS.request_human_handoff.description;
    expect(descricao).toContain("limite do que pode resolver");
    expect(descricao).toBe(descricaoDaFerramentaDePassagem(true));
    // Quem assume só vê o que o agente escreveu: os três campos de contexto são pedidos.
    expect(descricao).toContain("por_que");
    expect(descricao).toContain("o_que_tentei");
    expect(descricao).toContain("cliente_quer");
  });

  it("AC-005.2: payload fora da lista é recusado como erro de ensino, sem transferir nada", async () => {
    const r = await applyRequestHumanHandoff(
      db as never,
      ids,
      { conversationSummary: "x", log: log as never },
      { organization_id: "outra-org" },
    );
    expect(r).toMatchObject({ ok: false, error: { code: "invalid_payload" } });
    expect(consultas).toHaveLength(0);
  });
});

describe("AC-005.4: quem assume vê o histórico e o motivo", () => {
  it("AC-005.4: a linha da passagem guarda o briefing e o motivo; a Central mostra o motivo em português", async () => {
    const r = await applyRequestHumanHandoff(
      db as never,
      ids,
      {
        conversationSummary: "x",
        contextoDoTurno: { checkpoint: null, pendentesDoCliente: ["Quero falar com alguém."] },
        avisoAoLead: { avisado: true },
        log: log as never,
      },
      { por_que: "O cliente pediu uma pessoa.", cliente_quer: "Falar com alguém" },
    );
    expect(r).toMatchObject({ ok: true, status: "handoff_solicitado" });
    const passagem = consulta(/insert into passagens_de_atendimento/).params;
    expect(passagem.slice(0, 7)).toEqual([
      ids.tenantId, ids.leadId, ids.conversationId, null, "engine", "ferramenta_do_modelo", "requested_human",
    ]);
    // O briefing (o que quem assume lê) traz o motivo traduzido e a fala do cliente.
    expect(passagem[8]).toContain(FRASE_DO_MOTIVO.requested_human);
    expect(passagem[8]).toContain("Quero falar com alguém.");
    const central = consulta(/insert into agent_inbox_items/).params;
    expect(central[2]).toContain(FRASE_DO_MOTIVO.requested_human);
    // Apontamento para a conversa: é onde mora o histórico.
    expect(central[3]).toBe(ids.conversationId);
  });
});
