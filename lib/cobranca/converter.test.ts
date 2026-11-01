/**
 * Mudança 003, Fatia 7 (T-029/T-030): converter cortesia em cobrada (AC-002.3) e
 * o estado "cortesia" derivado para o painel (ADR-003).
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

import { argumentos, bancoFalso, filtros, operacao, type BancoFalso, type Cadeia, type Resposta } from "@/tests/helpers/banco-falso-da-cobranca";

const h = vi.hoisted(() => ({ cobra: true as boolean, padrao: "plano-1" as string | null }));
vi.mock("@/lib/cobranca/cadastro", () => ({
  lerEscopoDoCadastro: async (_a: unknown, brandId: string | null) => ({ cobra: h.cobra, brandId }),
  lerPlanosDoCadastro: async () => ({ padraoId: h.padrao, oferecidos: [] }),
}));

import { converterCortesia, estadoNoPainelDeContas } from "./converter";

const ORG = "dddddddd-0000-4000-8000-000000000001";
const MARCA = "eeeeeeee-0000-4000-8000-000000000001";
const AGORA = new Date("2026-11-01T12:00:00Z");

interface Mundo {
  org: Record<string, unknown> | null;
  linha: Record<string, unknown> | null;
  insercao: { code: string; message: string } | null;
  suspensao: { changed: boolean; motivo?: string } | null;
  erroRpc: { code: string; message: string } | null;
}
let m: Mundo;
let banco: BancoFalso;

function responder(c: Cadeia): Resposta {
  if (c.tabela === "organizations") return { data: m.org };
  if (c.tabela === "cobranca_planos") return { data: { trial_dias: 7 } };
  if (c.tabela === "cobranca_assinaturas") {
    if (operacao(c) === "insert") return m.insercao ? { error: m.insercao } : { data: null };
    return { data: m.linha };
  }
  return {};
}

beforeEach(() => {
  h.cobra = true;
  h.padrao = "plano-1";
  m = { org: { id: ORG, brand_id: MARCA }, linha: null, insercao: null, suspensao: { changed: true }, erroRpc: null };
  banco = bancoFalso(responder, () => (m.erroRpc ? { error: m.erroRpc } : { data: m.suspensao }));
});

const converter = () => converterCortesia(banco.cliente as never, ORG, { agora: () => AGORA, ator: "u-admin" });
const inseriu = () => banco.cadeias.some((c) => c.tabela === "cobranca_assinaturas" && operacao(c) === "insert");

describe("converterCortesia", () => {
  it("AC-002.3: cria a assinatura do fluxo da marca (trial com cartão, entrada pendente) e deixa a org à espera do cartão", async () => {
    const r = await converter();
    expect(r).toMatchObject({ tipo: "convertida", marcaId: MARCA, planoId: "plano-1" });
    const ins = banco.cadeias.find((c) => c.tabela === "cobranca_assinaturas" && operacao(c) === "insert")!;
    expect(argumentos(ins, "insert")?.[0]).toMatchObject({
      organization_id: ORG, plano_id: "plano-1", estado: "trial", pagamento_inicial_pendente: true, trial_com_cartao: true,
      trial_ate: new Date(AGORA.getTime() + 7 * 86_400_000).toISOString(),
    });
    expect(banco.rpcs[0]).toMatchObject({ nome: "fn_suspender_organizacao", args: { p_org: ORG, p_kind: "cobranca", p_ator: "u-admin" } });
  });

  it("AC-002.3: organização que já tem assinatura não é convertida de novo", async () => {
    m.linha = { organization_id: ORG };
    expect(await converter()).toEqual({ tipo: "ja_cobrada" });
    expect(inseriu()).toBe(false);
    expect(banco.rpcs).toEqual([]);
  });

  it("AC-002.3: corrida (23505 no insert) vira ja_cobrada, sem suspender", async () => {
    m.insercao = { code: "23505", message: "dup" };
    expect(await converter()).toEqual({ tipo: "ja_cobrada" });
    expect(banco.rpcs).toEqual([]);
  });

  it("AC-002.3: organização inexistente", async () => {
    m.org = null;
    expect(await converter()).toEqual({ tipo: "org_inexistente" });
  });

  it("AC-002.3: marca que não cobra não converte", async () => {
    h.cobra = false;
    expect(await converter()).toEqual({ tipo: "marca_nao_cobra" });
    expect(inseriu()).toBe(false);
  });

  it("AC-002.3: marca sem plano padrão não converte", async () => {
    h.padrao = null;
    expect(await converter()).toEqual({ tipo: "marca_sem_plano" });
    expect(inseriu()).toBe(false);
  });
});

describe("converterCortesia: falha e retomada", () => {
  it("AC-002.3: RPC falha depois do insert -> assinatura desfeita (filtrada pela org) e erro lançado", async () => {
    m.erroRpc = { code: "XX000", message: "boom" };
    await expect(converter()).rejects.toThrow(/suspensão/);
    const del = banco.cadeias.find((c) => c.tabela === "cobranca_assinaturas" && operacao(c) === "delete")!;
    expect(del).toBeDefined();
    expect(filtros(del)).toEqual(expect.arrayContaining([["eq", "organization_id", ORG], ["eq", "trial_com_cartao", true]]));
  });

  it("AC-002.3: assinatura pendente com a org ainda ativa -> repete só a suspensão", async () => {
    m.linha = { organization_id: ORG, plano_id: "plano-1", pagamento_inicial_pendente: true, trial_com_cartao: true };
    m.org = { id: ORG, brand_id: MARCA, status: "active" };
    expect(await converter()).toMatchObject({ tipo: "convertida", planoId: "plano-1", suspensa: true });
    expect(inseriu()).toBe(false);
    expect(banco.rpcs[0]).toMatchObject({ nome: "fn_suspender_organizacao" });
  });

  it("AC-002.3: assinatura pendente com a org já suspensa -> ja_cobrada", async () => {
    m.linha = { organization_id: ORG, plano_id: "plano-1", pagamento_inicial_pendente: true, trial_com_cartao: true };
    m.org = { id: ORG, brand_id: MARCA, status: "suspended" };
    expect(await converter()).toEqual({ tipo: "ja_cobrada" });
    expect(banco.rpcs).toEqual([]);
  });

  it("AC-002.3: suspensão administrativa prevalece (changed:false) é informada, não escondida", async () => {
    m.suspensao = { changed: false, motivo: "administrativa_prevalece" };
    expect(await converter()).toMatchObject({ tipo: "convertida", suspensa: false });
  });
});

describe("estadoNoPainelDeContas (ADR-003)", () => {
  it("AC-002.2: sem linha o estado é cortesia", () => {
    expect(estadoNoPainelDeContas(null)).toBe("cortesia");
  });
  it("AC-002.3: com linha o estado é o da assinatura", () => {
    expect(estadoNoPainelDeContas({ estado: "ativa" })).toBe("ativa");
  });
});
