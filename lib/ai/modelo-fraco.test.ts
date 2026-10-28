import { describe, expect, it } from "vitest";

import { modeloPodeErrarFerramentas } from "./modelo-fraco";

describe("modeloPodeErrarFerramentas", () => {
  const catalogo = [
    { model_id: "bom/modelo", supports_tools: true },
    { model_id: "sem/ferramentas", supports_tools: false },
    { model_id: "sem/informacao", supports_tools: null },
  ];

  it("AC-001.6: modelo que o provedor não reconhece gera o aviso", () => {
    expect(modeloPodeErrarFerramentas("desconhecido/x", catalogo)).toBe(true);
  });

  it("AC-001.6: modelo reconhecido sem chamada de ferramentas gera o aviso", () => {
    expect(modeloPodeErrarFerramentas("sem/ferramentas", catalogo)).toBe(true);
    expect(modeloPodeErrarFerramentas("sem/informacao", catalogo)).toBe(true);
  });

  it("AC-001.6: modelo reconhecido com ferramentas não gera aviso", () => {
    expect(modeloPodeErrarFerramentas("bom/modelo", catalogo)).toBe(false);
  });

  it("AC-001.6: sem modelo informado não há o que avisar", () => {
    expect(modeloPodeErrarFerramentas("  ", catalogo)).toBe(false);
    expect(modeloPodeErrarFerramentas(undefined, catalogo)).toBe(false);
  });
});
