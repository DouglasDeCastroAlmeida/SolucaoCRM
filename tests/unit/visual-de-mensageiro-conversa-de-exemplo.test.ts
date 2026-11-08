import { describe, expect, it } from "vitest";

import {
  NOME_DO_CONTATO_DE_EXEMPLO,
  acharConversaPeloNome,
  decidirTelaDaConversa,
  faseValida,
} from "../e2e/helpers/visual-de-mensageiro-conversa";
import { ETAPAS, TELAS_POR_ETAPA } from "../e2e/helpers/visual-de-mensageiro-telas";

/**
 * Issue #113: a jornada de capturas abre a conversa de exemplo da homologacao (so leitura). Aqui ficam
 * as decisoes que nao se provam olhando uma captura: achar a conversa pelo nome do contato e registrar
 * "pulada" (com o motivo) quando ela nao existe.
 */
describe("acharConversaPeloNome", () => {
  const itens = [
    { id: "c1", texto: "Maria Souza\nOi, tudo bem?\n10:32" },
    { id: "c2", texto: "Contato de teste do visual\nOla! Esta e a conversa de exemplo\n09:10\n2" },
    { id: "c3", texto: "Joao\nContato de teste do visual 2 mandou algo\n08:00" },
  ];

  it("acha pelo nome do contato, que e a primeira linha do item", () => {
    expect(acharConversaPeloNome(itens, NOME_DO_CONTATO_DE_EXEMPLO)).toBe("c2");
  });

  it("acha o nome mesmo quando a primeira linha sao as iniciais do avatar (como na lista real)", () => {
    const real = [{ id: "c9", texto: "CV\nContato de teste do visual\n09:23\n\nVocê:Teste do visual de mensageiro" }];
    expect(acharConversaPeloNome(real, NOME_DO_CONTATO_DE_EXEMPLO)).toBe("c9");
  });

  it("nao confunde o nome que aparece so na previa, da terceira linha em diante", () => {
    const previa = [{ id: "c8", texto: "JP\nJoão Pedro\nContato de teste do visual\n09:00" }];
    expect(acharConversaPeloNome(previa, NOME_DO_CONTATO_DE_EXEMPLO)).toBeNull();
  });

  it("ignora maiuscula, acento e espaco sobrando", () => {
    expect(
      acharConversaPeloNome([{ id: "x", texto: "  CONTÁTO de teste  do visual \n..." }], "Contato de teste do visual"),
    ).toBe("x");
  });

  it("nao confunde com outra conversa que so cita o nome na previa", () => {
    expect(acharConversaPeloNome([itens[0]!, itens[2]!], NOME_DO_CONTATO_DE_EXEMPLO)).toBeNull();
  });

  it("devolve null com lista vazia", () => {
    expect(acharConversaPeloNome([], NOME_DO_CONTATO_DE_EXEMPLO)).toBeNull();
  });
});

describe("decidirTelaDaConversa", () => {
  it("com a conversa achada manda abrir", () => {
    expect(decidirTelaDaConversa("c2")).toEqual({ abrir: true, id: "c2" });
  });

  it("sem a conversa registra pulada com o motivo, sem derrubar nada", () => {
    const d = decidirTelaDaConversa(null);
    expect(d.abrir).toBe(false);
    if (!d.abrir) {
      expect(d.registro.status).toBe("pulada");
      expect(d.registro.observacao).toContain(NOME_DO_CONTATO_DE_EXEMPLO);
    }
  });
});

describe("faseValida", () => {
  it("aceita antes, depois e rodada-2-antes; recusa o resto", () => {
    expect(faseValida("rodada-2-antes")).toBe("rodada-2-antes");
    expect(faseValida("depois")).toBe("depois");
    expect(faseValida(undefined)).toBe("antes");
    expect(faseValida("../fora")).toBe("antes");
  });
});

describe("telas da conversa na lista da jornada", () => {
  it("a etapa 2 tem lista, conversa aberta e painel do contato", () => {
    expect([...ETAPAS]).toContain(2);
    const comConversa = TELAS_POR_ETAPA[2].filter((t) => t.conversa).map((t) => `${t.slug}:${t.conversa}`);
    expect(comConversa).toEqual(["inbox-lista:lista", "inbox-conversa:aberta", "inbox-contato:contato"]);
  });
});
