import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/cobranca/configuracao", () => ({ provedorDaInstalacao: vi.fn() }));
vi.mock("@/lib/cobranca/provedores", () => ({ adaptador: vi.fn(), modoDoProvedor: vi.fn() }));
vi.mock("@/lib/cobranca/sincronizar", () => ({ sincronizar: vi.fn() }));

import { bancoDeCobrancaFalso } from "@/tests/unit/helpers/banco-de-cobranca-falso";
import { ErroDoProvedor, type AdaptadorDeCobranca } from "@/lib/cobranca/provedores/contrato";
import type { ResultadoDaSincronizacao } from "@/lib/cobranca/sincronizar";

import { confirmarTrialDoCheckout, type DependenciasDoConfirmar } from "./confirmar";

const ORG = "6f1c2a7e-3b4d-4e5f-8a9b-0c1d2e3f4a5b";
const T = "cccccccc-cccc-4ccc-8ccc-cccccccccccc";
const VELHA = "dddddddd-dddd-4ddd-8ddd-dddddddddddd";
const AGORA = new Date("2026-10-31T15:00:00Z");
const ACHADA = { clienteRef: "cus_da_pagina", assinaturaRef: "sub_1" };

function cenario(opcoes: { assinatura?: typeof ACHADA | null; falha?: Error; linha?: Record<string, unknown> } = {}) {
  const banco = bancoDeCobrancaFalso({
    cobranca_assinaturas: [
      {
        organization_id: ORG,
        trial_com_cartao: true,
        pagamento_inicial_pendente: true,
        provedor: null,
        provedor_cliente_id: null,
        checkout_url: "https://sandbox.asaas.exemplo/checkoutSession/show/1",
        checkout_expira_em: "2026-10-31T16:00:00Z",
        checkout_sessao_id: `${T}:chk_1`,
        updated_at: "v0",
        ...opcoes.linha,
      },
    ],
  });
  const achar = vi.fn(async () => {
    if (opcoes.falha) throw opcoes.falha;
    return opcoes.assinatura === undefined ? ACHADA : opcoes.assinatura;
  });
  const sincroniza = vi.fn(async (): Promise<ResultadoDaSincronizacao> => ({ tipo: "aplicada", estado: "trial", mudou: false, acao: "reativar" }));
  const deps: DependenciasDoConfirmar = {
    adaptador: () => ({ acharAssinaturaDoCheckout: achar }) as unknown as AdaptadorDeCobranca,
    provedor: async () => "asaas",
    modo: async () => "teste",
    sincronizar: sincroniza,
    agora: () => AGORA,
  };
  return { banco, achar, sincroniza, deps, linha: () => banco.tabelas.cobranca_assinaturas![0]! };
}

describe("confirmarTrialDoCheckout", () => {
  it("AC-003.2: o retorno com sucesso liga a linha à assinatura do Asaas e reativa a conta em teste", async () => {
    const c = cenario();

    const r = await confirmarTrialDoCheckout(c.banco.cliente, { orgId: ORG, resultado: "ok" }, c.deps);

    expect(r).toEqual({ tipo: "confirmada", reativada: true, primeiraVez: true });
    expect(c.linha()).toMatchObject({
      provedor: "asaas",
      modo: "teste",
      provedor_cliente_id: "cus_da_pagina",
      provedor_assinatura_id: "sub_1",
      pagamento_inicial_pendente: false,
      checkout_url: null,
    });
    expect(c.sincroniza).toHaveBeenCalledTimes(1);
  });

  it("AC-003.7: dois retornos concorrentes gravam uma vez; o segundo só relê (uma assinatura, uma linha)", async () => {
    const c = cenario();

    const [a, b] = await Promise.all([
      confirmarTrialDoCheckout(c.banco.cliente, { orgId: ORG, resultado: "ok" }, c.deps),
      confirmarTrialDoCheckout(c.banco.cliente, { orgId: ORG, resultado: "ok" }, c.deps),
    ]);

    expect([a, b].filter((r) => r.tipo === "confirmada" && r.primeiraVez)).toHaveLength(1);
    expect(c.banco.tabelas.cobranca_assinaturas!).toHaveLength(1);
    expect(c.banco.escritas.cobranca_assinaturas).toBeLessThanOrEqual(2);
  });

  it("AC-003.7: um retorno depois do primeiro não procura de novo no provedor, só relê", async () => {
    const c = cenario({ linha: { pagamento_inicial_pendente: false, provedor: "asaas", provedor_cliente_id: "cus_da_pagina" } });

    const r = await confirmarTrialDoCheckout(c.banco.cliente, { orgId: ORG, resultado: "ok" }, c.deps);

    expect(r).toEqual({ tipo: "confirmada", reativada: true, primeiraVez: false });
    expect(c.achar).not.toHaveBeenCalled();
  });

  it("AC-003.3: voltar sem concluir (cancelado) mantém a conta suspensa e descarta o checkout para refazer", async () => {
    const c = cenario({ assinatura: null });

    const r = await confirmarTrialDoCheckout(c.banco.cliente, { orgId: ORG, resultado: "cancelado" }, c.deps);

    expect(r).toEqual({ tipo: "pendente", checkoutDescartado: true });
    expect(c.linha()).toMatchObject({ pagamento_inicial_pendente: true, provedor: null, checkout_url: null, checkout_sessao_id: null });
    expect(c.sincroniza).not.toHaveBeenCalled();
  });

  it("AC-003.3: retorno 'ok' ainda sem assinatura no Asaas marca 'confirmando' por 24h (sem descartar a sessão)", async () => {
    const c = cenario({ assinatura: null });

    const r = await confirmarTrialDoCheckout(c.banco.cliente, { orgId: ORG, resultado: "ok" }, c.deps);

    expect(r).toEqual({ tipo: "pendente", checkoutDescartado: false });
    expect(c.linha()).toMatchObject({
      pagamento_inicial_pendente: true,
      checkout_sessao_id: `${T}:chk_1`,
      checkout_url: null,
      checkout_expira_em: "2026-11-01T15:00:00.000Z",
    });
  });

  it("AC-008.4: Asaas fora do ar num cancelamento não muda nada na linha", async () => {
    const c = cenario({ falha: new ErroDoProvedor(null, "sem_resposta", true) });

    const r = await confirmarTrialDoCheckout(c.banco.cliente, { orgId: ORG, resultado: "cancelado" }, c.deps);

    expect(r).toEqual({ tipo: "provedor_fora" });
    expect(c.linha()).toMatchObject({ pagamento_inicial_pendente: true, provedor: null });
    expect(c.banco.escritas.cobranca_assinaturas ?? 0).toBe(0);
  });

  it("AC-005.4: a sincronização que paga e liga a conta é a que reativa (a confirmação reporta o que ela fez)", async () => {
    const c = cenario();
    c.sincroniza.mockResolvedValueOnce({ tipo: "aplicada", estado: "ativa", mudou: true, acao: "nada" });

    const r = await confirmarTrialDoCheckout(c.banco.cliente, { orgId: ORG, resultado: "ok" }, c.deps);

    expect(r).toEqual({ tipo: "confirmada", reativada: false, primeiraVez: true });
  });

  it("AC-005.1: falha ao sincronizar não desfaz a confirmação (o cron horário reconcilia)", async () => {
    const c = cenario();
    c.sincroniza.mockRejectedValueOnce(new Error("banco fora"));

    const r = await confirmarTrialDoCheckout(c.banco.cliente, { orgId: ORG, resultado: "ok" }, c.deps);

    expect(r).toEqual({ tipo: "confirmada", reativada: false, primeiraVez: true });
    expect(c.linha().pagamento_inicial_pendente).toBe(false);
  });

  it("AC-003.2: conta que não é trial com cartão não é tocada", async () => {
    const c = cenario({ linha: { trial_com_cartao: false } });

    expect(await confirmarTrialDoCheckout(c.banco.cliente, { orgId: ORG, resultado: "ok" }, c.deps)).toEqual({ tipo: "nao_aplica" });
    expect(c.achar).not.toHaveBeenCalled();
  });

  it("AC-003.7: retorno 'ok' repetido não estende o prazo do 'confirmando'", async () => {
    const c = cenario({ assinatura: null, linha: { checkout_url: null, checkout_expira_em: "2026-11-01T10:00:00Z" } });

    await confirmarTrialDoCheckout(c.banco.cliente, { orgId: ORG, resultado: "ok" }, c.deps);

    expect(c.linha().checkout_expira_em).toBe("2026-11-01T10:00:00Z");
    expect(c.banco.escritas.cobranca_assinaturas ?? 0).toBe(0);
  });

  it("AC-003.7: cancelado depois de um 'ok' sem assinatura não desfaz a guarda contra segundo checkout", async () => {
    const c = cenario({ assinatura: null, linha: { checkout_url: null, checkout_expira_em: "2026-11-01T10:00:00Z" } });

    const r = await confirmarTrialDoCheckout(c.banco.cliente, { orgId: ORG, resultado: "cancelado", tentativa: T }, c.deps);

    expect(r).toEqual({ tipo: "pendente", checkoutDescartado: false });
    expect(c.linha().checkout_sessao_id).toBe(`${T}:chk_1`);
  });

  it("AC-003.3: Asaas fora do ar com retorno 'ok' também segura um novo checkout", async () => {
    const c = cenario({ falha: new ErroDoProvedor(null, "sem_resposta", true) });

    const r = await confirmarTrialDoCheckout(c.banco.cliente, { orgId: ORG, resultado: "ok" }, c.deps);

    expect(r).toEqual({ tipo: "provedor_fora" });
    expect(c.linha()).toMatchObject({ checkout_url: null, checkout_expira_em: "2026-11-01T15:00:00.000Z" });
  });

  it("AC-003.3: link de uma tentativa antiga (replay) não confirma nem apaga o checkout novo", async () => {
    for (const resultado of ["ok", "cancelado", "expirado"] as const) {
      const c = cenario();

      const r = await confirmarTrialDoCheckout(c.banco.cliente, { orgId: ORG, resultado, tentativa: VELHA }, c.deps);

      expect(r).toEqual({ tipo: "nao_aplica" });
      expect(c.linha()).toMatchObject({ checkout_url: expect.any(String), checkout_sessao_id: `${T}:chk_1`, pagamento_inicial_pendente: true });
      expect(c.achar).not.toHaveBeenCalled();
    }
  });

  it("AC-003.3: o retorno da tentativa viva confirma normalmente", async () => {
    const c = cenario();

    const r = await confirmarTrialDoCheckout(c.banco.cliente, { orgId: ORG, resultado: "ok", tentativa: T }, c.deps);

    expect(r).toEqual({ tipo: "confirmada", reativada: true, primeiraVez: true });
  });
});
