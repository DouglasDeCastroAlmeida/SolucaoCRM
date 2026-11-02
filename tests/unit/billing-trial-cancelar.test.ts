import { beforeEach, describe, expect, it, vi } from "vitest";

import { argumentos, bancoFalso, operacao, valorDoFiltro, type BancoFalso, type Cadeia, type Resposta } from "@/tests/helpers/banco-falso-da-cobranca";

/**
 * Cancelar e trocar de plano no trial com cartão e na conta ativa (mudança 003,
 * AC-006.1 e AC-006.2). A pessoa cancela pela tela e ela diz até quando o acesso vale
 * (no teste, o último dia do teste; depois de pagar, o fim do período pago). Trocar
 * de plano numa conta ativa usa a pró-rata que já existia e NUNCA mexe na data de
 * renovação.
 */
const h = vi.hoisted(() => ({
  papel: vi.fn(),
  cancelar: vi.fn(),
  sincronizar: vi.fn(),
  audit: vi.fn(),
  linha: null as Record<string, unknown> | null,
  banco: undefined as unknown as BancoFalso,
}));
vi.mock("@/lib/auth/require-role", () => ({ requireRole: h.papel }));
vi.mock("@/lib/instalacao/modulos", () => ({ moduloLigado: async () => true }));
vi.mock("@/lib/ai/dispatcher/rate-limit", () => ({ checkRateLimit: async () => ({ allowed: true }) }));
vi.mock("@/lib/cobranca/provedores", () => ({ adaptador: () => ({ cancelarNoFim: h.cancelar }) }));
vi.mock("@/lib/cobranca/sincronizar", () => ({ sincronizar: h.sincronizar }));
vi.mock("@/lib/audit", () => ({ audit: h.audit }));
vi.mock("@/lib/supabase/admin", () => ({ createAdminClient: () => h.banco.cliente }));
vi.mock("@/lib/impersonate/support", () => ({ requireSupportWrite: async () => null }));

import type { AdaptadorDeCobranca } from "@/lib/cobranca/provedores/contrato";
import { trocarPlanoDaOrg } from "@/lib/cobranca/troca";

import { POST as cancelarPelaRota } from "@/app/api/v1/cobranca/assinatura/cancelar/route";

const ORG = "16161616-0000-4000-8000-000000000001";

const NO_TESTE = {
  provedor: "asaas",
  provedor_assinatura_id: "sub_1",
  proximo_vencimento: null,
  trial_ate: "2026-11-09T02:59:59.000Z",
  estado: "trial",
  cancela_no_fim: false,
};
const PAGA = { ...NO_TESTE, estado: "ativa", proximo_vencimento: "2026-12-09T02:59:59.000Z", trial_ate: null };

beforeEach(() => {
  vi.clearAllMocks();
  h.linha = { ...NO_TESTE };
  h.banco = bancoFalso(() => ({ data: h.linha }));
  h.papel.mockResolvedValue({ ok: true, user: { id: "admin-1" }, org: { orgId: ORG } });
  h.cancelar.mockResolvedValue(undefined);
  h.sincronizar.mockResolvedValue({ tipo: "aplicada", estado: "cancelada", mudou: true, acao: "nada" });
});

describe("cancelar mostrando até quando o acesso vale", () => {
  it("⭐ AC-006.1: no trial com cartão cancela no Asaas e na conta, e o acesso vale até o fim do teste", async () => {
    const res = await cancelarPelaRota();

    expect(res.status).toBe(200);
    expect((await res.json()).data).toEqual({ changed: true, acesso_ate: "2026-11-09T02:59:59.000Z" });
    expect(h.cancelar).toHaveBeenCalledWith("sub_1");
    const escrita = h.banco.cadeias.find((c) => c.tabela === "cobranca_assinaturas" && operacao(c) === "update");
    expect(argumentos(escrita!, "update")?.[0]).toMatchObject({ cancela_no_fim: true });
    expect(h.audit).toHaveBeenCalledWith(expect.objectContaining({ action: "cobranca.assinatura_cancelada", actorUserId: "admin-1" }));
  });

  it("⭐ AC-006.1: na conta ativa o acesso vale até o fim do período já pago", async () => {
    h.linha = { ...PAGA };

    expect((await (await cancelarPelaRota()).json()).data).toEqual({ changed: true, acesso_ate: "2026-12-09T02:59:59.000Z" });
  });

  it("AC-006.1: trial já cancelado: 200 sem chamar o provedor de novo, ainda dizendo até quando vale", async () => {
    h.linha = { ...NO_TESTE, cancela_no_fim: true };

    expect((await (await cancelarPelaRota()).json()).data).toEqual({ changed: false, acesso_ate: "2026-11-09T02:59:59.000Z" });
    expect(h.cancelar).not.toHaveBeenCalled();
  });

  it("AC-006.1: entrada ainda não paga (sem assinatura no provedor) não tem o que cancelar: 409", async () => {
    h.linha = { ...NO_TESTE, provedor: null, provedor_assinatura_id: null };

    expect((await cancelarPelaRota()).status).toBe(409);
  });
});

describe("trocar de plano mantendo a data de renovação", () => {
  const AGORA = new Date("2026-10-20T12:00:00Z");
  const plano = (id: string, preco: number) => ({
    id, nome: id, preco_cents: preco, intervalo: "mes", max_assentos: 5, max_canais: 2, arquivado_em: null, oferecido_ao_cliente: true, brand_id: null,
  });
  const PLANOS = [plano("basico", 4990), plano("pro", 9990)];
  const trocarNoProvedor = vi.fn<AdaptadorDeCobranca["trocarPlano"]>();
  const iniciarAjusteProporcional = vi.fn<AdaptadorDeCobranca["iniciarAjusteProporcional"]>();
  let atual: Record<string, unknown>;
  let banco: BancoFalso;

  const responder = (c: Cadeia): Resposta => {
    if (c.tabela === "cobranca_planos") return { data: PLANOS.find((p) => p.id === valorDoFiltro(c, "eq", "id")) ?? null };
    if (c.tabela === "user_organizations") return { count: 1 };
    if (c.tabela === "channel_sessions") return { count: 1 };
    if (operacao(c) === "select") return { data: atual };
    return { data: { organization_id: ORG } };
  };
  const trocar = (planoId: string) =>
    trocarPlanoDaOrg(banco.cliente as never, ORG, planoId, {
      adaptador: () => ({ trocarPlano: trocarNoProvedor, iniciarAjusteProporcional } as unknown as AdaptadorDeCobranca),
      agora: () => AGORA,
      origem: "empresa",
    });
  const escritas = () => banco.cadeias.filter((c) => c.tabela === "cobranca_assinaturas" && operacao(c) === "update");
  const base = {
    plano_id: "basico", plano_agendado_id: null, provedor: "asaas", provedor_cliente_id: "cus_1", provedor_assinatura_id: "sub_1",
    checkout_url: null, checkout_expira_em: null, checkout_sessao_id: null,
    troca_id: null, plano_troca_pendente_id: null, troca_status: null, troca_pagamento_ref: null, troca_pagamento_url: null, troca_reserva_ate: null,
  };

  beforeEach(() => {
    banco = bancoFalso(responder);
    trocarNoProvedor.mockResolvedValue(undefined);
    iniciarAjusteProporcional.mockResolvedValue({ pagamentoRef: "pay_aj", url: "https://pay.example/aj" });
  });

  it("⭐ AC-006.2: conta ativa que sobe de plano paga a pró-rata e a data de renovação não é escrita", async () => {
    atual = { ...base, estado: "ativa", trial_ate: null, periodo_pago_desde: "2026-10-10T00:00:00Z", proximo_vencimento: "2026-11-09T02:59:59Z" };

    const r = await trocar("pro");

    expect(r).toMatchObject({ ok: true, quando: "pagamento_pendente", planoId: "basico", urlPagamento: "https://pay.example/aj" });
    const valor = iniciarAjusteProporcional.mock.calls[0]![0].valorCents;
    // 20 dias restantes de 30 sobre a diferença de R$ 50,00: a conta é a da pró-rata existente.
    expect(valor).toBeGreaterThan(0);
    expect(valor).toBeLessThan(5000);
    for (const e of escritas()) expect(Object.keys(argumentos(e, "update")?.[0] as object)).not.toContain("proximo_vencimento");
    expect(trocarNoProvedor).not.toHaveBeenCalled();
  });

  it("⭐ AC-006.2: conta ativa que desce de plano agenda para a renovação, que continua a mesma", async () => {
    atual = { ...base, plano_id: "pro", estado: "ativa", trial_ate: null, periodo_pago_desde: "2026-10-10T00:00:00Z", proximo_vencimento: "2026-11-09T02:59:59Z" };

    const r = await trocar("basico");

    expect(r).toMatchObject({ ok: true, quando: "agendado", planoAgendadoId: "basico", valeAPartirDe: "2026-11-09T02:59:59Z" });
    for (const e of escritas()) expect(Object.keys(argumentos(e, "update")?.[0] as object)).not.toContain("proximo_vencimento");
  });

  it("AC-006.2: no trial com cartão a troca vale na hora, o preço da 1ª cobrança muda no Asaas e a data do teste não é escrita", async () => {
    atual = { ...base, estado: "trial", trial_ate: "2026-11-09T02:59:59Z", periodo_pago_desde: null, proximo_vencimento: null };

    const r = await trocar("pro");

    expect(r).toMatchObject({ ok: true, quando: "imediato", planoId: "pro" });
    expect(trocarNoProvedor).toHaveBeenCalledWith({ assinaturaRef: "sub_1", plano: { id: "pro", nome: "pro", precoCents: 9990, intervalo: "mes" } });
    for (const e of escritas()) expect(Object.keys(argumentos(e, "update")?.[0] as object)).not.toContain("trial_ate");
  });
});
