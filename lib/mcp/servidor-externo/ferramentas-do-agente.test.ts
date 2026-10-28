/**
 * T-035 (AC-007.2/007.4): editar quais ferramentas de um servidor o agente enxerga.
 * "Ligada" = id presente em `tool_ids`; a marca "sem aprovação" mora em `config`.
 */
import { describe, expect, it } from "vitest";

import { alternarFerramenta, alternarLiberacao, estaLiberada, marcaDaFerramentaNoAgente } from "./ferramentas-do-agente";

describe("AC-007.2: ligar e desligar ferramenta em tool_ids", () => {
  it("liga como escrita e não duplica", () => {
    const um = alternarFerramenta(["crm_search_products"], "loja", "cancelar", "escrita");
    expect(um).toEqual({ ok: true, toolIds: ["crm_search_products", "mcp_externo:loja:escrita:cancelar"] });
    const dois = alternarFerramenta(um.ok ? um.toolIds : [], "loja", "cancelar", "escrita");
    expect(dois).toEqual(um);
  });

  it("trocar a marca troca o id, sem ficar com os dois", () => {
    const r = alternarFerramenta(["mcp_externo:loja:escrita:ver"], "loja", "ver", "leitura");
    expect(r).toEqual({ ok: true, toolIds: ["mcp_externo:loja:leitura:ver"] });
  });

  it("desligar tira qualquer marca e o formato antigo do servidor padrao", () => {
    expect(alternarFerramenta(["mcp_externo:loja:leitura:ver", "x"], "loja", "ver", null)).toEqual({
      ok: true,
      toolIds: ["x"],
    });
    expect(alternarFerramenta(["mcp_externo:escrita:ver", "x"], "padrao", "ver", null)).toEqual({
      ok: true,
      toolIds: ["x"],
    });
  });

  it("não mexe nas ferramentas de outro servidor com o mesmo nome", () => {
    const r = alternarFerramenta(["mcp_externo:outra:escrita:ver"], "loja", "ver", null);
    expect(r).toEqual({ ok: true, toolIds: ["mcp_externo:outra:escrita:ver"] });
  });

  it("recusa passar do teto de ferramentas por agente", () => {
    const cheio = Array.from({ length: 27 }, (_, i) => `crm_tool_${i}`);
    expect(alternarFerramenta(cheio, "loja", "ver", "escrita")).toEqual({ ok: false, motivo: "teto" });
  });

  it("a marca de uma ferramenta no agente", () => {
    const ids = ["mcp_externo:loja:leitura:ver", "mcp_externo:loja:escrita:cancelar"];
    expect(marcaDaFerramentaNoAgente(ids, "loja", "ver")).toBe("leitura");
    expect(marcaDaFerramentaNoAgente(ids, "loja", "cancelar")).toBe("escrita");
    expect(marcaDaFerramentaNoAgente(ids, "loja", "outra")).toBeNull();
  });
});

describe("AC-007.4: marca 'pode rodar sem aprovação' em config", () => {
  it("liberar acrescenta o id de escrita; revogar tira; o resto da config fica", () => {
    const a = alternarLiberacao({ rag_top_k: 7 }, "loja", "cancelar", true);
    expect(a).toEqual({ rag_top_k: 7, mcp_externo_liberadas: ["mcp_externo:loja:escrita:cancelar"] });
    expect(alternarLiberacao(a, "loja", "cancelar", true)).toEqual(a);
    expect(estaLiberada(a, "loja", "cancelar")).toBe(true);
    expect(alternarLiberacao(a, "loja", "cancelar", false)).toEqual({ rag_top_k: 7, mcp_externo_liberadas: [] });
  });

  it("config de formato estranho vira um objeto novo", () => {
    expect(alternarLiberacao(null, "loja", "x", true)).toEqual({
      mcp_externo_liberadas: ["mcp_externo:loja:escrita:x"],
    });
  });
});
