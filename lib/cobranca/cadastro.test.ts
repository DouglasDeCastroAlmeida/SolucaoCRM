/**
 * O lado TS da regra do doc 146 (opção B) que as telas de cadastro usam: o
 * Google some (e o seletor é obrigatório) exatamente quando o gatilho da 0679
 * recusaria um cadastro sem escolha. O lado do banco é
 * `tests/invariants/cobranca-entrada-paga-na-criacao.test.ts`.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

const h = vi.hoisted(() => ({ ligado: vi.fn(async () => true) }));
vi.mock("@/lib/instalacao/modulos", () => ({ moduloLigado: h.ligado }));

import { bancoFalso, filtros, type Cadeia, type Resposta } from "@/tests/helpers/banco-falso-da-cobranca";

import {
  decidirPlanoDoCadastro,
  lerCadastroNaTela,
  lerEscopoDoCadastro,
  lerPlanosDoCadastro,
  planoInicialDoSeletor,
  type PlanoDoCadastro,
} from "./cadastro";

const plano = (id: string): PlanoDoCadastro => ({ id, nome: id, preco_cents: 4990, intervalo: "mes", trial_dias: 7 });

function banco(p: { oferecidos: PlanoDoCadastro[]; padrao: string | null; erro?: boolean }) {
  return {
    from: () => {
      const q = {
        select: () => q,
        is: () => q,
        eq: () => q,
        order: async () => (p.erro ? { data: null, error: { code: "57014" } } : { data: p.oferecidos, error: null }),
        maybeSingle: async () => ({ data: p.padrao ? { id: p.padrao } : null, error: null }),
      };
      return q;
    },
  } as never;
}

beforeEach(() => h.ligado.mockResolvedValue(true));

describe("lerCadastroNaTela — quando o Google some", () => {
  it("⭐ sem plano nenhum (nem padrão, nem oferecido): nada a escolher e o Google fica — a empresa nasce isenta", async () => {
    expect(await lerCadastroNaTela(banco({ oferecidos: [], padrao: null }))).toEqual({ oferecidos: [], padraoId: null, exigeEscolha: false });
  });

  it("⭐ plano oferecido e sem padrão: o Google some e a escolha é obrigatória", async () => {
    expect((await lerCadastroNaTela(banco({ oferecidos: [plano("a")], padrao: null }))).exigeEscolha).toBe(true);
  });

  it("⭐ com padrão: o Google fica (a empresa dele nasce no padrão)", async () => {
    expect((await lerCadastroNaTela(banco({ oferecidos: [plano("a")], padrao: "p" }))).exigeEscolha).toBe(false);
  });

  it("cobrança desligada, ou leitura que falha: a tela não esconde nem exige nada (quem recusa é a action)", async () => {
    expect((await lerCadastroNaTela(banco({ oferecidos: [plano("a")], padrao: null, erro: true }))).exigeEscolha).toBe(false);
    h.ligado.mockResolvedValue(false);
    expect((await lerCadastroNaTela(banco({ oferecidos: [plano("a")], padrao: null }))).exigeEscolha).toBe(false);
  });
});

describe("planoInicialDoSeletor", () => {
  it("vem marcado o PADRÃO quando ele é oferecido — não o mais barato", () => {
    expect(planoInicialDoSeletor([plano("barato"), plano("padrao")], "padrao")).toBe("padrao");
  });
  it("padrão fora dos oferecidos (ou sem padrão): o primeiro", () => {
    expect(planoInicialDoSeletor([plano("barato"), plano("outro")], "negociado")).toBe("barato");
    expect(planoInicialDoSeletor([], null)).toBeUndefined();
  });
});

const MARCA = "7b1c0000-0000-4000-8000-00000000000a";

describe("lerPlanosDoCadastro — de quem são os planos (ADR-002)", () => {
  const leitura = (brandId?: string | null) => {
    const b = bancoFalso(() => ({ data: [] }));
    return lerPlanosDoCadastro(b.cliente as never, brandId).then(() => b.cadeias);
  };

  it("AC-001.1: a instalação (sem marca que cobra) lê só plano com brand_id nulo, nas duas leituras", async () => {
    const cadeias = await leitura();
    expect(cadeias).toHaveLength(2);
    for (const c of cadeias) {
      expect(filtros(c)).toContainEqual(["is", "brand_id", null]);
      expect(filtros(c).some((f) => f[0] === "eq" && f[1] === "brand_id")).toBe(false);
    }
  });

  it("AC-001.2: a marca que cobra lê só os planos DELA, nas duas leituras, e nunca os da instalação", async () => {
    const cadeias = await leitura(MARCA);
    expect(cadeias).toHaveLength(2);
    for (const c of cadeias) {
      expect(filtros(c)).toContainEqual(["eq", "brand_id", MARCA]);
      expect(filtros(c).some((f) => f[0] === "is" && f[1] === "brand_id")).toBe(false);
    }
  });
});

describe("lerEscopoDoCadastro — o espelho de fn_cobranca_da_marca_ligada", () => {
  const banco = (marca: Resposta) => bancoFalso((c: Cadeia) => (c.tabela === "brands" ? marca : {}));
  beforeEach(() => h.ligado.mockClear());

  it("AC-001.1: marca com a chave desligada não cobra (e não consulta o módulo)", async () => {
    const b = banco({ data: { id: MARCA, cobranca_ligada: false } });
    expect(await lerEscopoDoCadastro(b.cliente as never, MARCA)).toEqual({ cobra: false, brandId: null });
    expect(h.ligado).not.toHaveBeenCalled();
  });

  it("AC-001.2: chave da marca E módulo da instalação ligados: cobra, com o id da marca", async () => {
    const b = banco({ data: { id: MARCA, cobranca_ligada: true } });
    expect(await lerEscopoDoCadastro(b.cliente as never, MARCA)).toEqual({ cobra: true, brandId: MARCA });
    expect(filtros(b.cadeias[0]!)).toContainEqual(["eq", "id", MARCA]);
  });

  it("AC-001.1: chave da marca ligada com o módulo da instalação desligado: não cobra", async () => {
    h.ligado.mockResolvedValue(false);
    const b = banco({ data: { id: MARCA, cobranca_ligada: true } });
    expect(await lerEscopoDoCadastro(b.cliente as never, MARCA)).toEqual({ cobra: false, brandId: null });
  });

  it("AC-001.2: sem marca explícita vale a marca padrão do banco (is_default)", async () => {
    const b = banco({ data: { id: MARCA, cobranca_ligada: true } });
    expect(await lerEscopoDoCadastro(b.cliente as never, null)).toEqual({ cobra: true, brandId: MARCA });
    expect(filtros(b.cadeias[0]!)).toContainEqual(["eq", "is_default", true]);
  });

  it("marca inexistente não cobra; leitura que falha devolve null (quem decide ação recusa)", async () => {
    expect(await lerEscopoDoCadastro(banco({ data: null }).cliente as never, MARCA)).toEqual({ cobra: false, brandId: null });
    expect(await lerEscopoDoCadastro(banco({ error: { code: "57014", message: "x" } }).cliente as never, MARCA)).toBeNull();
  });
});

describe("decidirPlanoDoCadastro — o espelho de fn_trial_na_criacao_da_org", () => {
  const a = plano("a");
  const padrao = plano("padrao");

  it("AC-001.2: marca que cobra, plano escolhido e oferecido: vale a escolha", () => {
    expect(decidirPlanoDoCadastro({ padraoId: "padrao", oferecidos: [a, padrao] }, "a", true)).toEqual({ tipo: "plano", id: "a" });
  });

  it("AC-001.2: marca que cobra, escolha que não é da marca (não está entre os oferecidos): cai no padrão da marca", () => {
    expect(decidirPlanoDoCadastro({ padraoId: "padrao", oferecidos: [padrao] }, "de-outra-marca", true)).toEqual({ tipo: "plano", id: "padrao" });
  });

  it("AC-001.2: marca que cobra, sem escolha: o padrão", () => {
    expect(decidirPlanoDoCadastro({ padraoId: "padrao", oferecidos: [padrao] }, null, true)).toEqual({ tipo: "plano", id: "padrao" });
  });

  it("AC-001.2: marca que cobra, planos oferecidos e nenhum padrão: plano_obrigatorio", () => {
    expect(decidirPlanoDoCadastro({ padraoId: null, oferecidos: [a] }, null, true)).toEqual({ tipo: "erro", erro: "plano_obrigatorio" });
  });

  it("AC-001.2: marca que cobra e sem plano nenhum: cobranca_marca_sem_plano (nunca isenta)", () => {
    expect(decidirPlanoDoCadastro({ padraoId: null, oferecidos: [] }, null, true)).toEqual({ tipo: "erro", erro: "cobranca_marca_sem_plano" });
  });

  it("AC-001.1: instalação sem plano nenhum segue isenta (doc 146, opção B); com oferecido e sem padrão, recusa", () => {
    expect(decidirPlanoDoCadastro({ padraoId: null, oferecidos: [] }, null, false)).toEqual({ tipo: "isento" });
    expect(decidirPlanoDoCadastro({ padraoId: null, oferecidos: [a] }, null, false)).toEqual({ tipo: "erro", erro: "plano_obrigatorio" });
    expect(decidirPlanoDoCadastro({ padraoId: "padrao", oferecidos: [a] }, "x", false)).toEqual({ tipo: "plano", id: "padrao" });
  });
});
