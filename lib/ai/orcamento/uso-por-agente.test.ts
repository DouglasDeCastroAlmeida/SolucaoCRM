import { describe, expect, it } from "vitest";

import { montarUsoDoPeriodo, modelosSemPrecoConhecido } from "./uso-por-agente";

const agregado = (custo: number, entrada: number, saida: number) => ({
  chamadas: 1,
  custo_cents: custo,
  input_tokens: entrada,
  output_tokens: saida,
  cache_read_tokens: 0,
  cache_write_tokens: 0,
  p50_latency_ms: 0,
  p95_latency_ms: 0,
});

describe("AC-004.4: o uso do período por agente e total", () => {
  it("AC-004.4: cada agente traz tokens (entrada + saída), custo e o teto do período", () => {
    const uso = montarUsoDoPeriodo({
      tetoCents: 5000,
      total: agregado(1200, 4000, 1000),
      agentes: [
        { id: "a1", nome: "Atendimento", uso: agregado(900, 3000, 500) },
        { id: "a2", nome: "Vendas", uso: agregado(300, 1000, 500) },
      ],
      agentesComModeloSemPreco: new Set<string>(),
      algumModeloSemPreco: false,
    });

    expect(uso.tetoCents).toBe(5000);
    expect(uso.total).toMatchObject({ tokens: 5000, custoCents: 1200, estimado: false });
    expect(uso.porAgente.map((a) => [a.nome, a.tokens, a.custoCents])).toEqual([
      ["Atendimento", 3500, 900],
      ["Vendas", 1500, 300],
    ]);
  });

  it("AC-004.6: só o agente que usou modelo sem preço conhecido é marcado como estimado; o total herda a marca", () => {
    const uso = montarUsoDoPeriodo({
      tetoCents: 5000,
      total: agregado(1200, 4000, 1000),
      agentes: [
        { id: "a1", nome: "Atendimento", uso: agregado(900, 3000, 500) },
        { id: "a2", nome: "Vendas", uso: agregado(300, 1000, 500) },
      ],
      agentesComModeloSemPreco: new Set(["a2"]),
      algumModeloSemPreco: true,
    });

    expect(uso.porAgente.map((a) => a.estimado)).toEqual([false, true]);
    expect(uso.total.estimado).toBe(true);
  });

  it("AC-004.4: sem teto configurado, o teto vem nulo (a tela diz 'sem teto', não US$ 0)", () => {
    const uso = montarUsoDoPeriodo({
      tetoCents: 0,
      total: agregado(0, 0, 0),
      agentes: [],
      agentesComModeloSemPreco: new Set<string>(),
      algumModeloSemPreco: false,
    });

    expect(uso.tetoCents).toBeNull();
    expect(uso.porAgente).toEqual([]);
  });
});

describe("AC-004.6: quais modelos não têm preço conhecido", () => {
  it("AC-004.6: modelo da tabela do motor tem preço; o desconhecido não; o do catálogo da instalação conta como conhecido", () => {
    const sem = modelosSemPrecoConhecido(
      ["claude-sonnet-5", "modelo-que-ninguem-precifica", "z-ai/glm-4.7", "z-ai/glm-sem-preco"],
      [
        { model_id: "z-ai/glm-4.7", input_price_per_million_cents: 50, output_price_per_million_cents: 200 },
        { model_id: "z-ai/glm-sem-preco", input_price_per_million_cents: null, output_price_per_million_cents: null },
      ],
    );

    expect([...sem].sort()).toEqual(["modelo-que-ninguem-precifica", "z-ai/glm-sem-preco"]);
  });
});
