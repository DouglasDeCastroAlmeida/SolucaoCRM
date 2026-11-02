import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/cobranca/configuracao", () => ({ provedorDaInstalacao: vi.fn() }));
vi.mock("@/lib/cobranca/provedores", () => ({ adaptador: vi.fn(), modoDoProvedor: vi.fn() }));
vi.mock("@/lib/cobranca/sincronizar", () => ({ sincronizar: vi.fn() }));
vi.mock("@/lib/logger", () => ({ logger: { warn: vi.fn(), error: vi.fn(), info: vi.fn() } }));

import { bancoDeCobrancaFalso } from "@/tests/unit/helpers/banco-de-cobranca-falso";
import { ErroDoProvedor, type AdaptadorDeCobranca } from "@/lib/cobranca/provedores/contrato";
import type { ResultadoDaSincronizacao } from "@/lib/cobranca/sincronizar";

import { TIPO_DO_AVISO_DE_DIVERGENCIA, conciliarTrialsPendentes } from "./conciliar";

const A = "6f1c2a7e-3b4d-4e5f-8a9b-0c1d2e3f4a5b";
const B = "7a2d3b8f-4c5e-4f60-9bac-1d2e3f4a5b6c";
const AGORA = new Date("2026-11-02T15:00:00Z");
const CK = "5b7c0e6a-1d2f-4a3b-9c8d-7e6f5a4b3c2d";
const ACHADA = { clienteRef: "cus_da_pagina", assinaturaRef: "sub_1" };

const pendente = (org: string, extra: Record<string, unknown> = {}) => ({
  organization_id: org,
  trial_com_cartao: true,
  pagamento_inicial_pendente: true,
  provedor: null,
  provedor_cliente_id: null,
  checkout_url: "https://sandbox.asaas.exemplo/checkoutSession/show/1",
  checkout_expira_em: "2026-11-02T16:00:00Z",
  checkout_sessao_id: "cccccccc-cccc-4ccc-8ccc-cccccccccccc:chk_1",
  checkout_provedor_id: CK,
  ...extra,
});

function cenario(linhas: Array<Record<string, unknown>>, achar: () => Promise<unknown>) {
  const banco = bancoDeCobrancaFalso({ cobranca_assinaturas: linhas, incidents: [] });
  const sincroniza = vi.fn(async (): Promise<ResultadoDaSincronizacao> => ({ tipo: "aplicada", estado: "trial", mudou: true, acao: "reativar" }));
  const deps = {
    adaptador: () => ({ acharAssinaturaDoCheckout: vi.fn(achar) }) as unknown as AdaptadorDeCobranca,
    provedor: async () => "asaas" as const,
    modo: async () => "teste" as const,
    sincronizar: sincroniza,
    pedirNota: vi.fn(async () => "pedida"),
    agora: () => AGORA,
  };
  return { banco, sincroniza, deps, tabela: (n: string) => banco.tabelas[n]! };
}

describe("conciliarTrialsPendentes", () => {
  it("AC-008.3: pagamento feito mas retorno nunca voltou: a rodada acha a assinatura pelo checkout e reativa pelo mesmo caminho do sincronizar", async () => {
    const c = cenario([pendente(A)], async () => ACHADA);

    const r = await conciliarTrialsPendentes(c.banco.cliente, c.deps);

    expect(r).toEqual({ confirmadas: 1, reativadas: 1, divergencias: 0, falhas: 0 });
    expect(c.tabela("cobranca_assinaturas")[0]).toMatchObject({ provedor: "asaas", provedor_assinatura_id: "sub_1", pagamento_inicial_pendente: false });
    expect(c.sincroniza).toHaveBeenCalledTimes(1);
  });

  it("AC-008.3: assinatura ainda não existe no Asaas: nada muda, não marca 'confirmando' nem descarta o checkout", async () => {
    const c = cenario([pendente(A)], async () => null);

    const r = await conciliarTrialsPendentes(c.banco.cliente, c.deps);

    expect(r).toEqual({ confirmadas: 0, reativadas: 0, divergencias: 0, falhas: 0 });
    expect(c.banco.escritas.cobranca_assinaturas ?? 0).toBe(0);
    expect(c.sincroniza).not.toHaveBeenCalled();
  });

  it("AC-008.3: linha sem id de checkout, sem trial pendente ou com checkout vencido há mais de 7 dias não é consultada", async () => {
    const achar = vi.fn(async () => ACHADA);
    const c = cenario(
      [
        pendente(A, { checkout_provedor_id: null, checkout_url: null }),
        { ...pendente(B), pagamento_inicial_pendente: false },
        pendente("8b3e4c9a-5d6f-4071-8cbd-2e3f4a5b6c7d", { checkout_expira_em: "2026-10-20T00:00:00Z" }),
      ],
      achar,
    );

    const r = await conciliarTrialsPendentes(c.banco.cliente, c.deps);

    expect(r.confirmadas).toBe(0);
    expect(achar).not.toHaveBeenCalled();
  });

  it("AC-008.5: duas assinaturas para o mesmo checkout: não escolhe, não muda o acesso e abre UM aviso na Central", async () => {
    const c = cenario([pendente(A)], async () => {
      throw new ErroDoProvedor(null, "assinatura_ambigua", false);
    });

    const primeira = await conciliarTrialsPendentes(c.banco.cliente, c.deps);
    const segunda = await conciliarTrialsPendentes(c.banco.cliente, c.deps);

    expect(primeira).toEqual({ confirmadas: 0, reativadas: 0, divergencias: 1, falhas: 0 });
    expect(segunda.divergencias).toBe(0);
    expect(c.sincroniza).not.toHaveBeenCalled();
    expect(c.tabela("cobranca_assinaturas")[0]).toMatchObject({ provedor: null, pagamento_inicial_pendente: true });
    expect(c.tabela("incidents")).toHaveLength(1);
    expect(c.tabela("incidents")[0]).toMatchObject({ organization_id: A, type: TIPO_DO_AVISO_DE_DIVERGENCIA, severity: "warning" });
  });

  it("AC-008.5: provedor fora do ar não é divergência: sem aviso, sem escrita", async () => {
    const c = cenario([pendente(A)], async () => {
      throw new ErroDoProvedor(503, "provedor_fora", true);
    });

    const r = await conciliarTrialsPendentes(c.banco.cliente, c.deps);

    expect(r.divergencias).toBe(0);
    expect(c.tabela("incidents")).toHaveLength(0);
    expect(c.banco.escritas.cobranca_assinaturas ?? 0).toBe(0);
  });

  it("AC-008.2: rodar a conciliação duas vezes leva ao mesmo estado de uma só (a segunda só relê)", async () => {
    const c = cenario([pendente(A)], async () => ACHADA);

    await conciliarTrialsPendentes(c.banco.cliente, c.deps);
    const depois = { ...c.tabela("cobranca_assinaturas")[0]! };
    const segunda = await conciliarTrialsPendentes(c.banco.cliente, c.deps);

    expect(segunda.confirmadas).toBe(0);
    expect(c.tabela("cobranca_assinaturas")[0]).toEqual(depois);
  });

  it("uma empresa que falha não derruba as outras: vira contagem", async () => {
    let n = 0;
    const c = cenario([pendente(A), pendente(B)], async () => {
      n += 1;
      if (n === 1) throw new Error("boom");
      return ACHADA;
    });

    const r = await conciliarTrialsPendentes(c.banco.cliente, c.deps);

    expect(r.confirmadas).toBe(1);
  });
});
