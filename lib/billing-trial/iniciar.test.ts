import { beforeEach, describe, expect, it, vi } from "vitest";

const auditar = vi.hoisted(() => vi.fn());
vi.mock("@/lib/audit", () => ({ audit: auditar }));
vi.mock("@/lib/env", () => ({
  env: {
    INTERNAL_SECRET: "segredo-interno-de-teste-com-mais-de-32-chars",
    BILLING_TRIAL_DOCUMENTO_PEPPER: "pepper-de-teste-com-mais-de-32-caracteres",
    CPF_ENCRYPTION_KEY: "",
  },
}));
vi.mock("@/lib/cobranca/configuracao", () => ({ provedorDaInstalacao: vi.fn() }));
vi.mock("@/lib/cobranca/provedores", () => ({ adaptador: vi.fn(), modoDoProvedor: vi.fn() }));
vi.mock("@/lib/cobranca/cadastro", () => ({ lerEscopoDoCadastro: vi.fn() }));
vi.mock("@/lib/cobranca/falhas", () => ({ limiteDoProvedorPorOrg: vi.fn(async () => true) }));

import { bancoDeCobrancaFalso } from "@/tests/unit/helpers/banco-de-cobranca-falso";
import { ErroDoProvedor, type AdaptadorDeCobranca } from "@/lib/cobranca/provedores/contrato";

import {
  MENSAGEM_ASAAS_FORA,
  diaDaPrimeiraCobranca,
  iniciarTrialComCartao,
  lerPreviaDoTrial,
  type DependenciasDoIniciar,
} from "./iniciar";

const ORG = "6f1c2a7e-3b4d-4e5f-8a9b-0c1d2e3f4a5b";
const OUTRA_ORG = "22222222-2222-4222-8222-222222222222";
const MARCA = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const PLANO = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const AGORA = new Date("2026-10-31T15:00:00Z");
const CPF = "529.982.247-25";
const P = { orgId: ORG, baseUrl: "https://marca.exemplo", actorUserId: "u1", requestId: "r1" };

function cenario(opcoes: { linha?: Record<string, unknown>; cnpj?: string | null; marcaCobra?: boolean; assinatura?: { clienteRef: string; assinaturaRef: string } | null; falha?: Error } = {}) {
  const banco = bancoDeCobrancaFalso(
    {
      organizations: [{ id: ORG, brand_id: MARCA, cnpj: opcoes.cnpj ?? null }],
      cobranca_planos: [{ id: PLANO, nome: "Plano Pro", preco_cents: 4990, intervalo: "mes", trial_dias: 7 }],
      cobranca_assinaturas: [
        {
          organization_id: ORG,
          plano_id: PLANO,
          trial_com_cartao: true,
          pagamento_inicial_pendente: true,
          trial_ate: "2026-11-07T15:00:00Z",
          provedor_cliente_id: null,
          checkout_url: null,
          checkout_expira_em: null,
          checkout_sessao_id: null,
          updated_at: "v0",
          ...opcoes.linha,
        },
      ],
      cobranca_trial_documentos: [],
    },
    { unicas: { cobranca_trial_documentos: ["brand_id", "documento_hash"] } },
  );
  let n = 0;
  const iniciar = vi.fn(async (_p: unknown): Promise<{ url: string; sessaoId: string; expiraEm: Date | null }> => {
    if (opcoes.falha) throw opcoes.falha;
    n += 1;
    return { url: `https://sandbox.asaas.exemplo/checkoutSession/show/${n}`, sessaoId: `chk_${n}`, expiraEm: new Date(AGORA.getTime() + 60 * 60_000) };
  });
  const achar = vi.fn(async () => opcoes.assinatura ?? null);
  const ad = { iniciarTrialComCartao: iniciar, acharAssinaturaDoCheckout: achar } as unknown as AdaptadorDeCobranca;
  const deps: DependenciasDoIniciar = {
    adaptador: () => ad,
    agora: () => AGORA,
    provedor: async () => "asaas",
    escopo: async () => ({ cobra: opcoes.marcaCobra ?? true, brandId: MARCA }),
  };
  return { banco, iniciar, achar, deps, linha: () => banco.tabelas.cobranca_assinaturas![0]! };
}

beforeEach(() => auditar.mockClear());

describe("iniciarTrialComCartao", () => {
  it("AC-003.2: abre o checkout com a org como referência, a 1ª cobrança em hoje + 7 dias e guarda link, sessão e fim do teste", async () => {
    const c = cenario();

    const r = await iniciarTrialComCartao(c.banco.cliente, P, c.deps);

    expect(r).toMatchObject({ tipo: "redirecionar", url: "https://sandbox.asaas.exemplo/checkoutSession/show/1", reaproveitado: false });
    const pedido = c.iniciar.mock.calls[0]![0] as Record<string, unknown>;
    expect(pedido).toMatchObject({ orgId: ORG, clienteRef: "", primeiraCobrancaEm: new Date("2026-11-07T15:00:00Z") });
    expect(String(pedido.urlDeSucesso)).toContain("https://marca.exemplo/cobranca/volta?");
    expect(c.linha()).toMatchObject({ checkout_url: "https://sandbox.asaas.exemplo/checkoutSession/show/1", checkout_sessao_id: "chk_1" });
    expect(Date.parse(String(c.linha().trial_ate))).toBeGreaterThan(Date.parse("2026-11-07T15:00:00Z"));
    expect(c.linha().provedor_cliente_id).toBeNull();
    expect(auditar).toHaveBeenCalledTimes(1);
  });

  it("AC-003.7: dois cliques simultâneos abrem UM checkout; o outro vê que está em preparo", async () => {
    const c = cenario();

    const [a, b] = await Promise.all([iniciarTrialComCartao(c.banco.cliente, P, c.deps), iniciarTrialComCartao(c.banco.cliente, P, c.deps)]);

    expect(c.iniciar).toHaveBeenCalledTimes(1);
    expect([a.tipo, b.tipo].sort()).toEqual(["em_preparo", "redirecionar"]);
  });

  it("AC-003.7: checkout vivo é reaproveitado, sem abrir outro nem chamar o provedor", async () => {
    const c = cenario();
    const primeira = await iniciarTrialComCartao(c.banco.cliente, P, c.deps);

    const segunda = await iniciarTrialComCartao(c.banco.cliente, P, c.deps);

    expect(c.iniciar).toHaveBeenCalledTimes(1);
    expect(segunda).toMatchObject({ tipo: "redirecionar", reaproveitado: true, url: primeira.tipo === "redirecionar" ? primeira.url : "" });
  });

  it("AC-003.3: checkout vencido não é reaproveitado: a pessoa refaz o cartão com um checkout novo", async () => {
    const c = cenario({
      linha: { checkout_url: "https://velho.exemplo/x", checkout_sessao_id: "chk_velho", checkout_expira_em: "2026-10-31T14:00:00Z" },
    });

    const r = await iniciarTrialComCartao(c.banco.cliente, P, c.deps);

    expect(r).toMatchObject({ tipo: "redirecionar", reaproveitado: false });
    expect(c.iniciar).toHaveBeenCalledTimes(1);
    expect(c.linha().checkout_sessao_id).toBe("chk_1");
  });

  it("AC-003.7: a assinatura que o Checkout já criou vira ja_assinou, sem abrir um segundo checkout", async () => {
    const c = cenario({ assinatura: { clienteRef: "cus_da_pagina", assinaturaRef: "sub_1" } });

    const r = await iniciarTrialComCartao(c.banco.cliente, P, c.deps);

    expect(r).toEqual({ tipo: "ja_assinou" });
    expect(c.iniciar).not.toHaveBeenCalled();
    expect(c.linha().checkout_expira_em).toBeNull();
  });

  it("AC-008.4: Asaas fora do ar devolve a mensagem de tentar de novo, libera a reserva e não grava link nem audita", async () => {
    const c = cenario({ falha: new ErroDoProvedor(null, "sem_resposta", true) });

    const r = await iniciarTrialComCartao(c.banco.cliente, P, c.deps);

    expect(r).toEqual({ tipo: "indisponivel", mensagem: MENSAGEM_ASAAS_FORA });
    expect(MENSAGEM_ASAAS_FORA).toContain("Nada foi cobrado");
    expect(c.linha()).toMatchObject({ checkout_url: null, checkout_expira_em: null, pagamento_inicial_pendente: true });
    expect(auditar).not.toHaveBeenCalled();
  });

  it("AC-008.4: o clique seguinte à falha tenta de novo (a reserva não ficou presa)", async () => {
    const c = cenario({ falha: new ErroDoProvedor(503, "indisponivel", true) });
    await iniciarTrialComCartao(c.banco.cliente, P, c.deps);
    c.iniciar.mockImplementationOnce(async () => ({ url: "https://sandbox.asaas.exemplo/checkoutSession/show/9", sessaoId: "chk_9", expiraEm: null }));

    const r = await iniciarTrialComCartao(c.banco.cliente, P, c.deps);

    expect(r.tipo).toBe("redirecionar");
  });

  it("AC-003.5: documento do cadastro que já teve trial na marca recusa com trial_ja_usado e não abre checkout", async () => {
    const c = cenario({ cnpj: CPF });
    const antes = await import("@/lib/cobranca/trial-documento");
    await antes.reservarTrialDoDocumento(c.banco.cliente, { brandId: MARCA, documento: CPF, organizationId: OUTRA_ORG });

    const r = await iniciarTrialComCartao(c.banco.cliente, P, c.deps);

    expect(r).toMatchObject({ tipo: "trial_ja_usado" });
    expect(c.iniciar).not.toHaveBeenCalled();
    expect(c.linha().checkout_expira_em).toBeNull();
  });

  it("AC-003.6: documento sem trial na marca reserva o trial para a org e segue ao checkout", async () => {
    const c = cenario({ cnpj: CPF });

    const r = await iniciarTrialComCartao(c.banco.cliente, P, c.deps);

    expect(r.tipo).toBe("redirecionar");
    expect(c.banco.tabelas.cobranca_trial_documentos!).toHaveLength(1);
    expect(c.banco.tabelas.cobranca_trial_documentos![0]).toMatchObject({ brand_id: MARCA, organization_id: ORG });
  });

  it("AC-003.2: marca que não cobra ou conta que não espera o cartão não passam pelo Checkout", async () => {
    const semMarca = cenario({ marcaCobra: false });
    const jaPaga = cenario({ linha: { pagamento_inicial_pendente: false } });
    const semTrialComCartao = cenario({ linha: { trial_com_cartao: false } });

    expect(await iniciarTrialComCartao(semMarca.banco.cliente, P, semMarca.deps)).toEqual({ tipo: "nao_aplica" });
    expect(await iniciarTrialComCartao(jaPaga.banco.cliente, P, jaPaga.deps)).toEqual({ tipo: "nao_aplica" });
    expect(await iniciarTrialComCartao(semTrialComCartao.banco.cliente, P, semTrialComCartao.deps)).toEqual({ tipo: "nao_aplica" });
    expect(semMarca.iniciar).not.toHaveBeenCalled();
  });
});

describe("a tela de antes", () => {
  it("AC-003.2: diz o dia da 1ª cobrança (DD/MM, fuso de São Paulo) antes de ir ao Asaas", async () => {
    const c = cenario();

    const previa = await lerPreviaDoTrial(c.banco.cliente, ORG, { agora: () => AGORA });

    expect(previa).toMatchObject({ planoNome: "Plano Pro", precoCents: 4990, intervalo: "mes" });
    expect(diaDaPrimeiraCobranca(previa!.primeiraCobrancaEm)).toBe("07/11");
  });

  it("AC-003.2: a conta que não espera o cartão não tem prévia", async () => {
    const c = cenario({ linha: { pagamento_inicial_pendente: false } });

    expect(await lerPreviaDoTrial(c.banco.cliente, ORG, { agora: () => AGORA })).toBeNull();
  });
});
