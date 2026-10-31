/** Aba Cobrança do editor de marcas (mudança 003, T-012): AC-009.1 e AC-001.3. */
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { AbaCobranca } from "./AbaCobranca";

const BASE = "/api/v1/admin/brands/b2";
const PLANO = {
  id: "p1", nome: "Mensal", preco_cents: 9900, moeda: "BRL", intervalo: "mes", trial_dias: 7,
  padrao_no_cadastro: true, arquivado_em: null,
};

let chamadas: Array<{ url: string; method: string; body?: unknown }>;
let respostas: Record<string, { status: number; body: unknown }>;

beforeEach(() => {
  chamadas = [];
  respostas = {
    [`GET ${BASE}/planos-cobranca`]: { status: 200, body: { data: [PLANO] } },
    [`GET ${BASE}/cobranca`]: { status: 200, body: { data: { cobranca_ligada: false, faltam: [] } } },
  };
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string, init?: RequestInit) => {
      const method = init?.method ?? "GET";
      chamadas.push({ url, method, body: init?.body ? JSON.parse(String(init.body)) : undefined });
      const r = respostas[`${method} ${url}`] ?? { status: 200, body: { data: {} } };
      return new Response(JSON.stringify(r.body), { status: r.status });
    }),
  );
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("AC-009.1: planos da marca na aba Cobrança", () => {
  it("AC-009.1: lista os planos com preço e intervalo", async () => {
    render(<AbaCobranca marcaId="b2" marcaNome="Clínica Sol" />);
    expect(await screen.findByText("Mensal")).toBeTruthy();
    expect(screen.getByText(/R\$\s?99,00/)).toBeTruthy();
    expect(screen.getByText(/Plano do cadastro/, { selector: "span" })).toBeTruthy();
  });

  it("AC-009.1: cria plano anual convertendo reais em centavos", async () => {
    const u = userEvent.setup();
    render(<AbaCobranca marcaId="b2" marcaNome="Clínica Sol" />);
    await screen.findByText("Mensal");
    await u.type(screen.getByLabelText(/nome do plano/i), "Anual");
    await u.type(screen.getByLabelText(/preço/i), "990,00");
    await u.selectOptions(screen.getByLabelText(/cobrado a cada/i), "ano");
    await u.click(screen.getByRole("button", { name: /salvar plano/i }));
    await waitFor(() =>
      expect(chamadas.find((c) => c.method === "POST" && c.url === `${BASE}/planos-cobranca`)?.body).toMatchObject({
        nome: "Anual", preco_cents: 99000, intervalo: "ano", trial_dias: 7,
      }),
    );
  });

  it("AC-009.1: preço que não é número mostra o erro e não chama a API", async () => {
    const u = userEvent.setup();
    render(<AbaCobranca marcaId="b2" marcaNome="Clínica Sol" />);
    await screen.findByText("Mensal");
    await u.type(screen.getByLabelText(/nome do plano/i), "X");
    await u.type(screen.getByLabelText(/preço/i), "abc");
    await u.click(screen.getByRole("button", { name: /salvar plano/i }));
    expect((await screen.findByRole("alert")).textContent).toMatch(/preço em reais/i);
    expect(chamadas.some((c) => c.method === "POST")).toBe(false);
  });

  it("AC-009.1: editar um plano manda o plan_id por PATCH", async () => {
    const u = userEvent.setup();
    render(<AbaCobranca marcaId="b2" marcaNome="Clínica Sol" />);
    await u.click(await screen.findByRole("button", { name: /editar plano mensal/i }));
    const campo = screen.getByLabelText(/nome do plano/i) as HTMLInputElement;
    expect(campo.value).toBe("Mensal");
    await u.clear(campo);
    await u.type(campo, "Mensal Pro");
    await u.click(screen.getByRole("button", { name: /salvar plano/i }));
    await waitFor(() =>
      expect(chamadas.find((c) => c.method === "PATCH")?.body).toMatchObject({ plan_id: "p1", nome: "Mensal Pro", preco_cents: 9900 }),
    );
  });

  it("AC-009.1: arquivar um plano manda arquivado=true", async () => {
    const u = userEvent.setup();
    render(<AbaCobranca marcaId="b2" marcaNome="Clínica Sol" />);
    await u.click(await screen.findByRole("button", { name: /arquivar plano mensal/i }));
    await waitFor(() => expect(chamadas.find((c) => c.method === "PATCH")?.body).toEqual({ plan_id: "p1", arquivado: true }));
  });
});

describe("AC-001.3: chave da cobrança e o que falta", () => {
  it("AC-001.3: marca sem plano lista o que falta, em palavras simples", async () => {
    respostas[`GET ${BASE}/planos-cobranca`] = { status: 200, body: { data: [] } };
    respostas[`GET ${BASE}/cobranca`] = { status: 200, body: { data: { cobranca_ligada: false, faltam: ["plano", "provedor"] } } };
    render(<AbaCobranca marcaId="b2" marcaNome="Clínica Sol" />);
    const aviso = await screen.findByRole("status");
    expect(aviso.textContent).toMatch(/cadastre ao menos um plano com preço/i);
    expect(aviso.textContent).toMatch(/provedor de pagamento/i);
  });

  it("AC-001.3: a recusa do servidor aparece como alerta e a chave continua desligada", async () => {
    respostas[`GET ${BASE}/cobranca`] = { status: 200, body: { data: { cobranca_ligada: false, faltam: ["plano"] } } };
    respostas[`PATCH ${BASE}/cobranca`] = {
      status: 422,
      body: { error: { code: "cobranca_marca_sem_plano", message: "Ainda não dá para ligar a cobrança desta marca: cadastre ao menos um plano." } },
    };
    const u = userEvent.setup();
    render(<AbaCobranca marcaId="b2" marcaNome="Clínica Sol" />);
    await u.click(await screen.findByRole("button", { name: /ligar cobrança clínica sol/i }));
    expect((await screen.findByRole("alert")).textContent).toMatch(/cadastre ao menos um plano/i);
    expect(chamadas.find((c) => c.method === "PATCH")?.body).toEqual({ cobranca_ligada: true });
    expect(screen.getByText(/está desligada/i)).toBeTruthy();
  });

  it("AC-001.3: com tudo no lugar, ligar manda cobranca_ligada=true e a tela passa a mostrar ligada", async () => {
    const u = userEvent.setup();
    render(<AbaCobranca marcaId="b2" marcaNome="Clínica Sol" />);
    const botao = await screen.findByRole("button", { name: /ligar cobrança clínica sol/i });
    respostas[`GET ${BASE}/cobranca`] = { status: 200, body: { data: { cobranca_ligada: true, faltam: [] } } };
    await u.click(botao);
    expect(await screen.findByText(/está ligada/i)).toBeTruthy();
    expect(screen.getByText(/não cancela nem apaga as assinaturas/i)).toBeTruthy();
    expect(screen.getByRole("button", { name: /desligar cobrança clínica sol/i })).toBeTruthy();
  });
});
