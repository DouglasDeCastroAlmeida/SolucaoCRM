/**
 * Painel /admin/marcas (lista, formulário, domínios, planos). Acessibilidade
 * verificada pelos papéis e rótulos que Testing Library exige: todo campo tem
 * rótulo, a lista é uma tabela com legenda, erros são anunciados (role=alert).
 */
import { cleanup, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { PainelDeMarcas } from "./PainelDeMarcas";

const MARCAS = [
  {
    id: "b1", slug: "padrao", name: "padrao", status: "active", is_default: true,
    cadastro_aberto: false, brand_domains: [],
  },
  {
    id: "b2", slug: "clinica", name: "Clínica Sol", status: "active", is_default: false,
    cadastro_aberto: true,
    brand_domains: [{ id: "d1", host: "app.clinicasol.com.br", kind: "proprio", status: "active" }],
  },
];

type Resp = { status: number; body: unknown };
let chamadas: Array<{ url: string; method: string; body?: unknown }>;
let respostas: Record<string, Resp>;

beforeEach(() => {
  chamadas = [];
  respostas = {};
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string, init?: RequestInit) => {
      const method = init?.method ?? "GET";
      chamadas.push({ url, method, body: init?.body ? JSON.parse(String(init.body)) : undefined });
      const r = respostas[`${method} ${url}`] ?? (method === "GET" ? { status: 200, body: { data: [] } } : { status: 200, body: { data: {} } });
      return new Response(JSON.stringify(r.body), { status: r.status });
    }),
  );
  respostas["GET /api/v1/admin/brands"] = { status: 200, body: { data: MARCAS } };
  respostas["GET /api/v1/admin/brands/b2/planos-cobranca"] = {
    status: 200,
    body: {
      data: [
        { id: "p1", nome: "Pro", preco_cents: 9900, moeda: "BRL", intervalo: "mes", trial_dias: 7, padrao_no_cadastro: false, arquivado_em: null },
      ],
    },
  };
  respostas["GET /api/v1/admin/brands/b2/cobranca"] = { status: 200, body: { data: { cobranca_ligada: false, faltam: [] } } };
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("AC-008.1: lista e formulário de marcas", () => {
  it("AC-008.1: lista as marcas numa tabela com legenda, nome, endereços e estado", async () => {
    render(<PainelDeMarcas />);
    const tabela = await screen.findByRole("table", { name: /marcas/i });
    expect(within(tabela).getByText("Clínica Sol")).toBeTruthy();
    expect(within(tabela).getByText("app.clinicasol.com.br")).toBeTruthy();
    expect(within(tabela).getAllByRole("row")).toHaveLength(3);
  });

  it("AC-008.1: criar marca envia o formulário com rótulos acessíveis e recarrega a lista", async () => {
    const u = userEvent.setup();
    render(<PainelDeMarcas />);
    await screen.findByRole("table", { name: /marcas/i });
    await u.type(screen.getByLabelText(/identificador/i), "imob");
    await u.type(screen.getByLabelText(/nome da marca/i), "Imob Norte");
    await u.click(screen.getByLabelText(/cadastro aberto/i));
    await u.click(screen.getByRole("button", { name: /criar marca/i }));
    await waitFor(() =>
      expect(chamadas.find((c) => c.method === "POST" && c.url === "/api/v1/admin/brands")?.body).toMatchObject({
        slug: "imob", name: "Imob Norte", cadastro_aberto: true,
      }),
    );
    expect(chamadas.filter((c) => c.method === "GET" && c.url === "/api/v1/admin/brands").length).toBeGreaterThan(1);
  });

  it("AC-008.1: desativar pede a rota DELETE e a marca padrão não oferece o botão", async () => {
    const u = userEvent.setup();
    render(<PainelDeMarcas />);
    await screen.findByRole("table", { name: /marcas/i });
    expect(screen.queryByRole("button", { name: /desativar padrao/i })).toBeNull();
    await u.click(screen.getByRole("button", { name: /desativar clínica sol/i }));
    await waitFor(() =>
      expect(chamadas.some((c) => c.method === "DELETE" && c.url === "/api/v1/admin/brands/b2")).toBe(true),
    );
  });
});

describe("AC-008.2: domínios", () => {
  it("AC-008.2: mostra o erro claro e anunciado quando o domínio já existe", async () => {
    const u = userEvent.setup();
    respostas["POST /api/v1/admin/brands/b2/domains"] = {
      status: 409,
      body: { error: { code: "brand_domain_exists", message: "Este endereço já está cadastrado." } },
    };
    render(<PainelDeMarcas />);
    await u.click(await screen.findByRole("button", { name: /gerenciar clínica sol/i }));
    await u.type(screen.getByLabelText(/novo endereço/i), "app.clinicasol.com.br");
    await u.click(screen.getByRole("button", { name: /adicionar endereço/i }));
    const alerta = await screen.findByRole("alert");
    expect(alerta.textContent).toMatch(/já está cadastrado/i);
  });

  it("AC-008.2: o botão fica desabilitado durante o envio (repetir o clique não duplica)", async () => {
    const u = userEvent.setup();
    let liberar!: () => void;
    const trava = new Promise<void>((r) => (liberar = r));
    const base = globalThis.fetch as unknown as (u: string, i?: RequestInit) => Promise<Response>;
    vi.stubGlobal("fetch", vi.fn(async (url: string, init?: RequestInit) => {
      if (init?.method === "POST" && url.endsWith("/domains")) await trava;
      return base(url, init);
    }));
    render(<PainelDeMarcas />);
    await u.click(await screen.findByRole("button", { name: /gerenciar clínica sol/i }));
    await u.type(screen.getByLabelText(/novo endereço/i), "novo.clinicasol.com.br");
    const botao = screen.getByRole("button", { name: /adicionar endereço/i });
    await u.click(botao);
    expect((botao as HTMLButtonElement).disabled).toBe(true);
    liberar();
    await waitFor(() => expect((screen.getByLabelText(/novo endereço/i) as HTMLInputElement).value).toBe(""));
    expect(chamadas.filter((c) => c.method === "POST" && c.url.endsWith("/domains"))).toHaveLength(1);
  });

  it("AC-008.2: remover endereço chama DELETE com o domain_id", async () => {
    const u = userEvent.setup();
    render(<PainelDeMarcas />);
    await u.click(await screen.findByRole("button", { name: /gerenciar clínica sol/i }));
    await u.click(await screen.findByRole("button", { name: /remover app\.clinicasol\.com\.br/i }));
    await waitFor(() =>
      expect(chamadas.some((c) => c.method === "DELETE" && c.url === "/api/v1/admin/brands/b2/domains?domain_id=d1")).toBe(true),
    );
  });
});

describe("AC-008.3: planos (UI)", () => {
  it("AC-008.3: lista planos e cadastra um novo com preço em reais convertido para centavos", async () => {
    const u = userEvent.setup();
    render(<PainelDeMarcas />);
    await u.click(await screen.findByRole("button", { name: /gerenciar clínica sol/i }));
    expect(await screen.findByText("Pro")).toBeTruthy();
    await u.type(screen.getByLabelText(/nome do plano/i), "Plus");
    await u.type(screen.getByLabelText(/preço/i), "149,90");
    await u.click(screen.getByRole("button", { name: /salvar plano/i }));
    await waitFor(() =>
      expect(chamadas.find((c) => c.method === "POST" && c.url === "/api/v1/admin/brands/b2/planos-cobranca")?.body).toMatchObject({
        nome: "Plus", preco_cents: 14990,
      }),
    );
  });
});
