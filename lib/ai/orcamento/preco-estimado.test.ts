import { describe, expect, it } from "vitest";

import { costCents, type TokenUsage } from "@/lib/agent-engine/edge/llm/pricing";

import {
  PRECO_ESTIMADO_PADRAO,
  custoOuEstimativa,
  estimarCusto,
} from "./preco-estimado";

const UM_MILHAO: TokenUsage = {
  inputTokens: 1_000_000,
  outputTokens: 1_000_000,
  cacheReadTokens: 0,
  cacheWriteTokens: 0,
};

describe("preço estimado para modelo sem preço", () => {
  it("AC-004.6: o custo conhecido passa como está e NÃO é marcado como estimado", () => {
    const r = custoOuEstimativa(12.5, UM_MILHAO);

    expect(r).toEqual({ costCents: 12.5, estimado: false });
  });

  it("AC-004.6: custo zero de modelo gratuito de verdade continua zero e não estimado", () => {
    const r = custoOuEstimativa(0, UM_MILHAO);

    expect(r).toEqual({ costCents: 0, estimado: false });
  });

  it("AC-004.6: provedor que não informa custo (null) recebe estimativa e a marca estimado", () => {
    const r = custoOuEstimativa(null, UM_MILHAO);

    expect(r.estimado).toBe(true);
    expect(r.costCents).toBeGreaterThan(0);
  });

  it("AC-004.6: a estimativa é calculada pelo preço padrão por milhão de tokens", () => {
    const r = estimarCusto({ ...UM_MILHAO, inputTokens: 500_000, outputTokens: 100_000 });

    const esperado =
      0.5 * PRECO_ESTIMADO_PADRAO.entradaCentsPorMilhao +
      0.1 * PRECO_ESTIMADO_PADRAO.saidaCentsPorMilhao;
    expect(r).toEqual({ costCents: esperado, estimado: true });
  });

  it("AC-004.6: a estimativa é conservadora, acima do preço real do modelo mais caro da tabela", () => {
    const real = costCents("claude-opus-5", UM_MILHAO, "1h");

    expect(real).not.toBeNull();
    expect(estimarCusto(UM_MILHAO).costCents).toBeGreaterThan(real as number);
  });

  it("AC-004.6: sem tokens, a estimativa é zero e continua marcada como estimada", () => {
    const r = estimarCusto({ ...UM_MILHAO, inputTokens: 0, outputTokens: 0 });

    expect(r).toEqual({ costCents: 0, estimado: true });
  });

  it("AC-004.6: preço próprio informado substitui o padrão, ainda marcado como estimado", () => {
    const r = estimarCusto(UM_MILHAO, { entradaCentsPorMilhao: 100, saidaCentsPorMilhao: 200 });

    expect(r).toEqual({ costCents: 300, estimado: true });
  });
});
