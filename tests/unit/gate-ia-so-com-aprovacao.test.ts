import { describe, expect, it } from "vitest";

import {
  aiApprovalGate,
  BEFORE_SEND_GATES,
  evaluateBeforeSend,
  type GateContext,
} from "@/lib/agent-engine/guardrails/before-send";
import { PACING_DEFAULTS } from "@/lib/agent-engine/pacing/defaults";
import { SPINNING_DEFAULTS } from "@/lib/agent-engine/spinning/defaults";

/**
 * AC-004.5 — num canal em que a IA só rascunha (capacidade `iaSoComAprovacao`), nada que o modelo
 * escreve sai sem uma pessoa ter aprovado. O modo assistido já faz o agente virar rascunho
 * (`exigirAprovacaoDoCanal`); este gate é a rede por baixo: se algum caminho tentar enviar o
 * texto do modelo direto, a cadeia veta.
 *
 * Armado só pelo envio real (`runBeforeSend`). A prévia e o rascunho do assistido usam a mesma
 * cadeia pura SEM armá-lo: senão o rascunho que a pessoa vai aprovar nunca nasceria.
 */
function baseCtx(overrides: Partial<GateContext> = {}): GateContext {
  return {
    now: new Date("2026-11-04T15:00:00Z"),
    body: "Fica R$ 2.000.",
    optedOut: false,
    provider: "email",
    pacing: {
      knobs: PACING_DEFAULTS,
      state: { lastSentAt: null, sentToday: 0, numberActivatedAt: null },
      crmDailyLimit: null,
    },
    spinning: { knobs: SPINNING_DEFAULTS, window: [] },
    promise: { table: null },
    semanticPromise: null,
    disclosure: { template: null, isFirstOutbound: false, mode: "inject" },
    lgpd: null,
    casesEnabled: false,
    hasOpenCase: false,
    openedCaseThisTurn: false,
    ...overrides,
  };
}

describe("aiApprovalGate", () => {
  it("AC-004.5: canal que exige aprovação veta o envio do modelo que ninguém aprovou", () => {
    const v = aiApprovalGate.evaluate(baseCtx({ aiApprovalEnforced: true, approvedByPerson: false }));
    expect(v).toMatchObject({ pass: false, code: "ai_approval_required" });
  });

  it("AC-004.5: a resposta aprovada por uma pessoa passa", () => {
    expect(aiApprovalGate.evaluate(baseCtx({ aiApprovalEnforced: true, approvedByPerson: true }))).toEqual({ pass: true });
  });

  it("AC-004.5: sem a marca de aprovação, o padrão é vetar (falha fechada)", () => {
    expect(aiApprovalGate.evaluate(baseCtx({ aiApprovalEnforced: true }))).toMatchObject({ pass: false });
  });

  it("canal sem a restrição passa registrando que não se aplica, mesmo armado", () => {
    expect(aiApprovalGate.evaluate(baseCtx({ provider: "waha", aiApprovalEnforced: true }))).toEqual({
      pass: true,
      skipped: "not_applicable",
    });
  });

  it("desarmado (prévia, rascunho do assistido) não veta, nem em canal que exige aprovação", () => {
    expect(aiApprovalGate.evaluate(baseCtx())).toEqual({ pass: true, skipped: "not_applicable" });
  });

  it("na cadeia o veto aparece no trace, depois dos vetos de conformidade e antes do anti-ban", () => {
    const r = evaluateBeforeSend(baseCtx({ aiApprovalEnforced: true }), BEFORE_SEND_GATES);
    expect(r.veto).toMatchObject({ gate: "ai_approval", code: "ai_approval_required" });
    const nomes = BEFORE_SEND_GATES.map((g) => g.name);
    expect(nomes.indexOf("ai_approval")).toBeGreaterThan(nomes.indexOf("lgpd"));
    expect(nomes.indexOf("ai_approval")).toBeLessThan(nomes.indexOf("pacing"));
    expect(r.trace.find((t) => t.gate === "pacing")).toMatchObject({ verdict: "skipped" });
  });
});
