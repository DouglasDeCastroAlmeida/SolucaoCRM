/**
 * T-035 (AC-007.4): a marca "pode rodar sem aprovação" mora em
 * `ai_agents.config.mcp_externo_liberadas` (lista de ids de ferramenta de escrita)
 * e chega aos DOIS montadores de turno como nomes expostos ao modelo.
 */
import { describe, expect, it } from "vitest";

import { nomesLiberadosParaOTurno, idsLiberadosDaConfig, CHAVE_DAS_LIBERADAS } from "./liberadas";
import type { FerramentaDoAgente } from "./repositorio";

function ligada(nome: string, leitura: boolean, servidor?: string): FerramentaDoAgente {
  return {
    servidor: { id: "s", slug: servidor ?? "padrao", nome: "ERP", endpoint: "https://x", chave: "k" },
    ferramenta: { name: nome },
    escolha: { ...(servidor ? { servidor } : {}), nome, leitura },
    nomeExposto: servidor ? `${servidor}__${nome}` : nome,
  } as unknown as FerramentaDoAgente;
}

describe("AC-007.4: marcas 'pode rodar sem aprovação' chegam ao turno", () => {
  it("a chave de config tem nome estável", () => {
    expect(CHAVE_DAS_LIBERADAS).toBe("mcp_externo_liberadas");
  });

  it("lê só ids de ferramenta remota de escrita; lixo vira lista vazia", () => {
    expect(idsLiberadosDaConfig(undefined)).toEqual([]);
    expect(idsLiberadosDaConfig({ [CHAVE_DAS_LIBERADAS]: "x" })).toEqual([]);
    expect(
      idsLiberadosDaConfig({
        [CHAVE_DAS_LIBERADAS]: ["mcp_externo:loja:escrita:cancelar", "mcp_externo:loja:leitura:ver", 7, "crm_search"],
      }),
    ).toEqual(["mcp_externo:loja:escrita:cancelar"]);
  });

  it("devolve o nome exposto da ferramenta de escrita ligada e marcada", () => {
    const ligadas = [ligada("cancelar", false, "loja"), ligada("estornar", false, "loja")];
    const config = { [CHAVE_DAS_LIBERADAS]: ["mcp_externo:loja:escrita:cancelar"] };
    expect(nomesLiberadosParaOTurno(ligadas, config)).toEqual(["loja__cancelar"]);
  });

  it("formato antigo (sem servidor) casa com a marca no formato antigo e com a do servidor padrao", () => {
    const ligadas = [ligada("cancelar", false)];
    expect(nomesLiberadosParaOTurno(ligadas, { [CHAVE_DAS_LIBERADAS]: ["mcp_externo:escrita:cancelar"] })).toEqual([
      "cancelar",
    ]);
    expect(
      nomesLiberadosParaOTurno(ligadas, { [CHAVE_DAS_LIBERADAS]: ["mcp_externo:padrao:escrita:cancelar"] }),
    ).toEqual(["cancelar"]);
  });

  it("ferramenta de leitura nunca entra, mesmo marcada; ferramenta não ligada também não", () => {
    const ligadas = [ligada("ver", true, "loja")];
    const config = { [CHAVE_DAS_LIBERADAS]: ["mcp_externo:loja:escrita:ver", "mcp_externo:loja:escrita:outra"] };
    expect(nomesLiberadosParaOTurno(ligadas, config)).toEqual([]);
  });

  it("sem config ou sem ferramentas ligadas: nada é liberado (falha fechada)", () => {
    expect(nomesLiberadosParaOTurno(undefined, {})).toEqual([]);
    expect(nomesLiberadosParaOTurno([ligada("a", false, "loja")], null)).toEqual([]);
  });
});
