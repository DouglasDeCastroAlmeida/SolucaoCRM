/**
 * Na tela de Plano e cobrança (mudança 003): o botão "Pedir reembolso" só existe dentro
 * da janela de 7 dias (AC-006.3, AC-006.4), o cancelamento no teste diz até quando o
 * acesso vale (AC-006.1) e o link da nota fiscal aparece quando existe (AC-007.2).
 */
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const h = vi.hoisted(() => ({ post: vi.fn(), refresh: vi.fn(), push: vi.fn(), replace: vi.fn(), abrir: vi.fn(), showApiError: vi.fn() }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: h.refresh, push: h.push, replace: h.replace }) }));
vi.mock("@/lib/api/client", () => ({ apiClient: { post: h.post } }));
vi.mock("@/lib/cobranca/navegar", () => ({ abrirNoNavegador: h.abrir }));
vi.mock("@/components/feedback/ApiErrorToast", () => ({ showApiError: h.showApiError }));

import { ApiError } from "@/lib/api/types";
import { AcoesDaAssinatura, type PropsDasAcoes } from "@/components/cobranca/AcoesDaAssinatura";
import { PainelDaAssinatura } from "@/components/cobranca/PainelDaAssinatura";
import type { DadosDoPainel } from "@/lib/cobranca/painel";

const PLANO = { id: "plano-a", nome: "Essencial", preco_cents: 4990, intervalo: "mes", max_assentos: null, max_canais: null, teto_ia_usd_cents: null };
const BASE: NonNullable<DadosDoPainel["assinatura"]> = {
  estado: "ativa", trial_ate: null, prazo_extra_ate: null, proximo_vencimento: "2026-11-01T12:00:00Z", vencida_desde: null,
  cancela_no_fim: false, modo: "teste", provedor: "asaas", link_de_pagamento: null, assinaturas_vivas: 1, plano_agendado: null,
  periodo_pago_desde: "2026-10-01T12:00:00Z", troca_pagamento_url: null, troca_status: null, pagamento_inicial_pendente: false,
};
const painel = (a: Partial<typeof BASE>): DadosDoPainel => ({
  assinatura: { ...BASE, ...a }, plano: PLANO, uso: { assentos: 1, canais: 1 }, gastoIaUsdCents: 0, planosParaTroca: [], fuso: null,
  checkout: { provedor: "asaas", documentoDoCadastro: null },
});
const acoes = (p: Partial<PropsDasAcoes> = {}): PropsDasAcoes => ({
  estado: "ativa", temProvedor: true, assinaturasVivas: 1, linkDePagamento: null, cancelaNoFim: false,
  planosParaTroca: [], planoAtual: PLANO, periodoPagoDesde: "2026-10-01T12:00:00Z", proximoVencimento: "2026-11-01T12:00:00Z",
  trocaPagamentoUrl: null, trocaStatus: null, instanteCalculo: "2026-10-13T12:00:00Z", voltouDoCheckout: false, noHub: false, provedor: "asaas", documentoDoCadastro: null, ...p,
});

beforeEach(() => vi.clearAllMocks());
afterEach(cleanup);

describe("AC-006.1: cancelado no teste, a tela diz até quando vale", () => {
  it("trial com cancelamento marcado mostra o último dia do teste", () => {
    render(<PainelDaAssinatura dados={painel({ estado: "trial", trial_ate: "2026-10-20T12:00:00Z", proximo_vencimento: null, cancela_no_fim: true })} idioma="pt-BR" />);
    expect(screen.getByText(/^Cancelada, acesso até \d{2}\/\d{2}\/\d{4}$/)).toBeTruthy();
  });

  it("ao confirmar o cancelamento no teste, o recado traz a data devolvida pela rota", async () => {
    h.post.mockResolvedValue({ data: { acesso_ate: "2026-10-20T12:00:00Z" } });
    render(<AcoesDaAssinatura {...acoes({ estado: "trial", proximoVencimento: null })} />);
    await userEvent.click(screen.getByRole("button", { name: "Cancelar assinatura" }));
    expect(screen.getByText(/Você não será cobrado/)).toBeTruthy();
    await userEvent.click(screen.getByRole("button", { name: "Confirmar cancelamento" }));
    await waitFor(() => expect(screen.getByRole("status").textContent).toMatch(/Você mantém o acesso até 20\/10/));
  });
});

describe("AC-006.3 e AC-006.4: o botão de reembolso", () => {
  it("fora da janela (sem a data) o botão não aparece", () => {
    render(<AcoesDaAssinatura {...acoes({ reembolsoAte: null })} />);
    expect(screen.queryByRole("button", { name: "Pedir reembolso" })).toBeNull();
  });

  it("sem a propriedade (conta fora do trial com cartão) o botão também não aparece", () => {
    render(<AcoesDaAssinatura {...acoes()} />);
    expect(screen.queryByRole("button", { name: "Pedir reembolso" })).toBeNull();
  });

  it("dentro da janela aparece, diz até quando e só pede depois de uma confirmação", async () => {
    h.post.mockResolvedValue({ data: { changed: true } });
    render(<AcoesDaAssinatura {...acoes({ reembolsoAte: "2026-10-17T12:00:00Z" })} />);

    await userEvent.click(screen.getByRole("button", { name: "Pedir reembolso" }));
    expect(h.post).not.toHaveBeenCalled();
    expect(screen.getByText(/17\/10/)).toBeTruthy();

    await userEvent.click(screen.getByRole("button", { name: "Confirmar pedido de reembolso" }));
    await waitFor(() => expect(h.post).toHaveBeenCalledWith("/api/v1/cobranca/assinatura/reembolso", {}));
    await waitFor(() => expect(screen.getByRole("status").textContent).toMatch(/Pedido de reembolso registrado/));
    expect(h.refresh).toHaveBeenCalled();
  });

  it("AC-006.4: se o servidor recusar por prazo, a pessoa lê a frase do dicionário (nunca a mensagem crua)", async () => {
    h.post.mockRejectedValue(new ApiError(422, "reembolso_fora_da_janela", undefined, "req-1", "fora"));
    render(<AcoesDaAssinatura {...acoes({ reembolsoAte: "2026-10-17T12:00:00Z" })} />);
    await userEvent.click(screen.getByRole("button", { name: "Pedir reembolso" }));
    await userEvent.click(screen.getByRole("button", { name: "Confirmar pedido de reembolso" }));
    await waitFor(() => expect(screen.getByRole("status").textContent).toMatch(/prazo de 7 dias/));
  });
});

describe("AC-007.2: o link da nota fiscal", () => {
  it("com nota emitida mostra o link, que abre em outra aba", () => {
    render(<PainelDaAssinatura dados={painel({})} idioma="pt-BR" notaUrl="https://www.asaas.com/i/nota.pdf" />);
    const a = screen.getByRole("link", { name: "Ver nota fiscal" });
    expect(a.getAttribute("href")).toBe("https://www.asaas.com/i/nota.pdf");
    expect(a.getAttribute("target")).toBe("_blank");
    expect(a.getAttribute("rel")).toContain("noopener");
  });

  it("AC-007.3: sem nota (ainda não saiu, ou falhou) a tela não mostra link nem erro", () => {
    render(<PainelDaAssinatura dados={painel({})} idioma="pt-BR" notaUrl={null} />);
    expect(screen.queryByRole("link", { name: "Ver nota fiscal" })).toBeNull();
  });

  it("link que não é https nunca vira href", () => {
    render(<PainelDaAssinatura dados={painel({})} idioma="pt-BR" notaUrl="javascript:alert(1)" />);
    expect(screen.queryByRole("link", { name: "Ver nota fiscal" })).toBeNull();
  });
});
