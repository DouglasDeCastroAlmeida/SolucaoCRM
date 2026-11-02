/**
 * Painel de contas (mudança 003, AC-009.2 e AC-009.3): filtro por estado e por
 * marca, detalhes com plano, datas e link do Asaas, e a conversão de cortesia.
 */
import { cleanup, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/components/admin/ImpersonateButton", () => ({ ImpersonateButton: () => null }));

import { PainelDeContas } from "./PainelDeContas";

const COBR = (estado: string, extra: Record<string, unknown> = {}) => ({
  estado, plano: null, trial_ate: null, proximo_vencimento: null, link_asaas: null, ...extra,
});
const CONTAS = [
  { id: "o1", name: "Clínica Sol", brand_id: "b1", brands: { name: "Marca Um" }, cobranca: COBR("cortesia") },
  {
    id: "o2", name: "Loja Mar", brand_id: "b2", brands: { name: "Marca Dois" },
    cobranca: COBR("trial", { plano: "Pro", trial_ate: "2026-11-10T12:00:00Z", proximo_vencimento: "2026-11-12T12:00:00Z", link_asaas: "https://sandbox.asaas.com/i/1" }),
  },
  { id: "o3", name: "Imob Norte", brand_id: "b2", brands: { name: "Marca Dois" }, cobranca: COBR("suspensa", { plano: "Pro" }) },
];

let respostas: Record<string, { status: number; body: unknown }>;
let chamadas: string[];
beforeEach(() => {
  chamadas = [];
  respostas = {
    "GET /api/v1/admin/brands": { status: 200, body: { data: [{ id: "b1", name: "Marca Um" }, { id: "b2", name: "Marca Dois" }] } },
    "GET /api/v1/admin/organizations?limit=200": { status: 200, body: { data: CONTAS } },
    "GET /api/v1/admin/organizations?brand_id=b2&limit=200": { status: 200, body: { data: CONTAS.slice(1) } },
  };
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string, init?: RequestInit) => {
      const k = `${init?.method ?? "GET"} ${url}`;
      chamadas.push(k);
      const r = respostas[k] ?? { status: 200, body: { data: {} } };
      return new Response(JSON.stringify(r.body), { status: r.status });
    }),
  );
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

const linhas = () => within(screen.getByRole("table")).getAllByRole("row").slice(1);

describe("AC-009.2: filtro por estado e por marca", () => {
  it("AC-009.2: mostra o estado de cada conta e filtra por estado", async () => {
    const u = userEvent.setup();
    render(<PainelDeContas />);
    await screen.findByText("Loja Mar");
    expect(linhas()).toHaveLength(3);
    await u.selectOptions(screen.getByLabelText(/filtrar por estado/i), "cortesia");
    expect(linhas()).toHaveLength(1);
    expect(screen.getByText("Clínica Sol")).toBeTruthy();
    expect(screen.queryByText("Loja Mar")).toBeNull();
  });

  it("AC-009.2: oferece os seis estados e filtra por marca no servidor", async () => {
    const u = userEvent.setup();
    render(<PainelDeContas />);
    await screen.findByText("Loja Mar");
    const opcoes = within(screen.getByLabelText(/filtrar por estado/i)).getAllByRole("option").map((o) => (o as HTMLOptionElement).value);
    expect(opcoes).toEqual(["", "cortesia", "trial", "ativa", "em_atraso", "suspensa", "cancelada"]);
    await u.selectOptions(screen.getByLabelText(/filtrar por marca/i), "b2");
    await waitFor(() => expect(chamadas).toContain("GET /api/v1/admin/organizations?brand_id=b2&limit=200"));
    await waitFor(() => expect(screen.queryByText("Clínica Sol")).toBeNull());
  });
});

describe("AC-009.3: detalhes da conta", () => {
  it("AC-009.3: abre plano, estado, datas e link do Asaas (https, nova aba)", async () => {
    const u = userEvent.setup();
    render(<PainelDeContas />);
    await screen.findByText("Loja Mar");
    const botao = screen.getByRole("button", { name: /detalhes de loja mar/i });
    expect(botao.getAttribute("aria-expanded")).toBe("false");
    await u.click(botao);
    expect(botao.getAttribute("aria-expanded")).toBe("true");
    const det = screen.getByRole("group", { name: /detalhes de loja mar/i });
    expect(within(det).getByText("Pro")).toBeTruthy();
    expect(within(det).getByText(/10\/11\/2026/)).toBeTruthy();
    expect(within(det).getByText(/12\/11\/2026/)).toBeTruthy();
    const link = within(det).getByRole("link", { name: /asaas/i });
    expect(link.getAttribute("href")).toBe("https://sandbox.asaas.com/i/1");
    expect(link.getAttribute("rel")).toContain("noopener");
  });

  it("AC-009.3: sem link seguro nao desenha o link", async () => {
    const u = userEvent.setup();
    render(<PainelDeContas />);
    await screen.findByText("Imob Norte");
    await u.click(screen.getByRole("button", { name: /detalhes de imob norte/i }));
    expect(screen.queryByRole("link", { name: /asaas/i })).toBeNull();
  });
});

describe("AC-009.2: converter cortesia em cobrada", () => {
  it("AC-009.2: so a cortesia tem o botao; pede confirmacao, converte e refaz a lista", async () => {
    const u = userEvent.setup();
    respostas["POST /api/v1/admin/cobranca/organizacoes/o1/converter"] = { status: 200, body: { data: { converted: true } } };
    render(<PainelDeContas />);
    await screen.findByText("Loja Mar");
    expect(screen.getAllByRole("button", { name: /converter em cobrada/i })).toHaveLength(1);
    await u.click(screen.getByRole("button", { name: /converter em cobrada/i }));
    expect(chamadas.some((c) => c.startsWith("POST"))).toBe(false);
    const antes = chamadas.filter((c) => c.startsWith("GET /api/v1/admin/organizations")).length;
    await u.click(screen.getByRole("button", { name: /confirmar conversão/i }));
    await waitFor(() => expect(chamadas).toContain("POST /api/v1/admin/cobranca/organizacoes/o1/converter"));
    await waitFor(() => expect(chamadas.filter((c) => c.startsWith("GET /api/v1/admin/organizations")).length).toBe(antes + 1));
  });

  it.each([
    [404, /não foi encontrada/i],
    [409, /já tem cobrança|não cobra/i],
    [422, /plano padrão/i],
  ])("AC-009.2: erro %i vira mensagem clara", async (status, msg) => {
    const u = userEvent.setup();
    respostas["POST /api/v1/admin/cobranca/organizacoes/o1/converter"] = { status, body: { error: { code: "x", message: "bruto" } } };
    render(<PainelDeContas />);
    await screen.findByText("Loja Mar");
    await u.click(screen.getByRole("button", { name: /converter em cobrada/i }));
    await u.click(screen.getByRole("button", { name: /confirmar conversão/i }));
    expect((await screen.findByRole("alert")).textContent).toMatch(msg);
  });

  it("AC-009.2: cancelar a confirmacao nao chama a rota", async () => {
    const u = userEvent.setup();
    render(<PainelDeContas />);
    await screen.findByText("Loja Mar");
    await u.click(screen.getByRole("button", { name: /converter em cobrada/i }));
    await u.click(screen.getByRole("button", { name: /cancelar/i }));
    expect(chamadas.some((c) => c.startsWith("POST"))).toBe(false);
    expect(screen.queryByRole("button", { name: /confirmar conversão/i })).toBeNull();
  });
});
