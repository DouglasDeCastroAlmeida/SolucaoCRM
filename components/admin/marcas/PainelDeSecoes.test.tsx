/** Edição de marca, pacotes verticais e contas no painel /admin/marcas. */
import { cleanup, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/components/admin/ImpersonateButton", () => ({
  ImpersonateButton: ({ organizationId, displayName }: { organizationId: string; displayName: string }) => (
    <button type="button" data-impersonate={organizationId}>{`Acesso de suporte a ${displayName}`}</button>
  ),
}));

import { PainelDeMarcas } from "./PainelDeMarcas";

const PACOTES = [
  { id: "k1", slug: "clinica", name: "Clínica", version: 2, status: "active" },
  { id: "k2", slug: "imob", name: "Imobiliária", version: 1, status: "inactive" },
];
const MARCAS = [
  { id: "b1", slug: "padrao", name: "padrao", status: "active", is_default: true, cadastro_aberto: false, brand_domains: [] },
  {
    id: "b2", slug: "sol", name: "Clínica Sol", status: "active", is_default: false, cadastro_aberto: false,
    permite_personalizacao: true, accent_hex: "#112233", logo_path: null, default_pack_id: null, brand_domains: [],
  },
];
const CONTAS = [
  { id: "o1", name: "Acme", brand_id: "b2", brands: { name: "Clínica Sol" } },
  { id: "o2", name: "Beta", brand_id: null, brands: null },
];

let chamadas: Array<{ url: string; method: string; body?: unknown }>;
let respostas: Record<string, { status: number; body: unknown }>;

beforeEach(() => {
  chamadas = [];
  respostas = {
    "GET /api/v1/admin/brands": { status: 200, body: { data: MARCAS } },
    "GET /api/v1/admin/brands/b2/planos-cobranca": { status: 200, body: { data: [] } },
    "GET /api/v1/admin/brands/b2/cobranca": { status: 200, body: { data: { cobranca_ligada: false, faltam: [] } } },
    "GET /api/v1/admin/vertical-packs": { status: 200, body: { data: PACOTES } },
    "GET /api/v1/admin/organizations": { status: 200, body: { data: CONTAS } },
  };
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string, init?: RequestInit) => {
      const method = init?.method ?? "GET";
      chamadas.push({ url, method, body: init?.body ? JSON.parse(String(init.body)) : undefined });
      const r = respostas[`${method} ${url}`] ?? { status: 200, body: { data: method === "GET" ? [] : {} } };
      return new Response(JSON.stringify(r.body), { status: r.status });
    }),
  );
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("AC-008.1: edição de marca", () => {
  it("AC-008.1: envia nome, cor, logo, cadastro_aberto, permite_personalizacao e pacote padrão por PATCH", async () => {
    const u = userEvent.setup();
    render(<PainelDeMarcas />);
    await u.click(await screen.findByRole("button", { name: /gerenciar clínica sol/i }));
    const form = await screen.findByRole("form", { name: /editar clínica sol/i });
    const nome = within(form).getByLabelText(/nome da marca/i);
    await u.clear(nome);
    await u.type(nome, "Clínica Sol Nova");
    const cor = within(form).getByLabelText(/cor principal/i);
    await u.clear(cor);
    await u.type(cor, "#abcdef");
    await u.type(within(form).getByLabelText(/caminho do logo/i), "brands/sol.png");
    await u.click(within(form).getByLabelText(/cadastro aberto/i));
    await u.click(within(form).getByLabelText(/permite personalização/i));
    await within(form).findByRole("option", { name: "Clínica" });
    await u.selectOptions(within(form).getByLabelText(/pacote padrão/i), "k1");
    await u.click(within(form).getByRole("button", { name: /salvar marca/i }));
    await waitFor(() =>
      expect(chamadas.find((c) => c.method === "PATCH" && c.url === "/api/v1/admin/brands/b2")?.body).toEqual({
        name: "Clínica Sol Nova",
        accent_hex: "#abcdef",
        logo_path: "brands/sol.png",
        cadastro_aberto: true,
        permite_personalizacao: false,
        default_pack_id: "k1",
      }),
    );
    expect(await screen.findByText("Marca salva.")).toBeTruthy();
  });

  it("AC-008.1: erro da API aparece como alerta", async () => {
    const u = userEvent.setup();
    respostas["PATCH /api/v1/admin/brands/b2"] = {
      status: 404,
      body: { error: { code: "not_found", message: "Pacote padrão não encontrado." } },
    };
    render(<PainelDeMarcas />);
    await u.click(await screen.findByRole("button", { name: /gerenciar clínica sol/i }));
    await u.click(await screen.findByRole("button", { name: /salvar marca/i }));
    expect((await screen.findByRole("alert")).textContent).toMatch(/pacote padrão não encontrado/i);
  });
});

describe("AC-008.4: pacotes verticais (UI)", () => {
  async function abrirPacotes(u: ReturnType<typeof userEvent.setup>) {
    render(<PainelDeMarcas />);
    await u.click(screen.getByRole("tab", { name: /pacotes verticais/i }));
    return screen.findByRole("table", { name: /pacotes verticais/i });
  }

  it("AC-008.4: lista os pacotes com versão e estado", async () => {
    const u = userEvent.setup();
    const t = await abrirPacotes(u);
    expect(within(t).getByText("Clínica")).toBeTruthy();
    expect(within(t).getByText("Inativo")).toBeTruthy();
    expect(within(t).getAllByRole("row")).toHaveLength(3);
  });

  it("AC-008.4: cria pacote por POST", async () => {
    const u = userEvent.setup();
    await abrirPacotes(u);
    await u.type(screen.getByLabelText(/identificador do pacote/i), "varejo");
    await u.type(screen.getByLabelText(/nome do pacote/i), "Varejo");
    await u.click(screen.getByRole("button", { name: /criar pacote/i }));
    await waitFor(() =>
      expect(chamadas.find((c) => c.method === "POST" && c.url === "/api/v1/admin/vertical-packs")?.body).toEqual({
        slug: "varejo", name: "Varejo",
      }),
    );
  });

  it("AC-008.4: edita o nome por PATCH com pack_id e ativa/desativa", async () => {
    const u = userEvent.setup();
    await abrirPacotes(u);
    await u.click(screen.getByRole("button", { name: /editar pacote clínica/i }));
    const nome = screen.getByLabelText(/nome do pacote/i);
    await u.clear(nome);
    await u.type(nome, "Clínica 2");
    await u.click(screen.getByRole("button", { name: /salvar pacote/i }));
    await waitFor(() =>
      expect(chamadas.find((c) => c.method === "PATCH")?.body).toEqual({ pack_id: "k1", name: "Clínica 2" }),
    );
    await u.click(screen.getByRole("button", { name: /ativar pacote imobiliária/i }));
    await waitFor(() =>
      expect(chamadas.filter((c) => c.method === "PATCH").at(-1)?.body).toEqual({ pack_id: "k2", status: "active" }),
    );
  });
});

describe("AC-008.5: contas (UI)", () => {
  async function abrirContas(u: ReturnType<typeof userEvent.setup>) {
    render(<PainelDeMarcas />);
    await u.click(screen.getByRole("tab", { name: /^contas$/i }));
    return screen.findByRole("table", { name: /contas de todas as marcas/i });
  }

  it("AC-008.5: lista contas de todas as marcas com a marca de cada uma", async () => {
    const u = userEvent.setup();
    const t = await abrirContas(u);
    const linhas = within(t).getAllByRole("row");
    expect(linhas).toHaveLength(3);
    expect(within(linhas[1]!).getAllByRole("cell")[1]!.textContent).toBe("Clínica Sol");
    expect(within(linhas[2]!).getAllByRole("cell")[1]!.textContent).toBe("Marca padrão");
  });

  it("AC-008.5: filtrar por marca consulta a lista com brand_id", async () => {
    const u = userEvent.setup();
    await abrirContas(u);
    await screen.findAllByRole("option", { name: "Clínica Sol" });
    await u.selectOptions(screen.getByLabelText(/filtrar por marca/i), "b2");
    await waitFor(() =>
      expect(chamadas.some((c) => c.method === "GET" && c.url === "/api/v1/admin/organizations?brand_id=b2")).toBe(true),
    );
  });

  it("AC-008.5: troca a marca da conta pela rota da organização", async () => {
    const u = userEvent.setup();
    await abrirContas(u);
    await screen.findAllByRole("option", { name: "padrao" });
    await u.selectOptions(screen.getByLabelText(/nova marca de acme/i), "b1");
    await u.click(screen.getByRole("button", { name: /trocar marca de acme/i }));
    await waitFor(() =>
      expect(chamadas.find((c) => c.method === "PATCH" && c.url === "/api/v1/admin/organizations/o1/brand")?.body).toEqual({
        brand_id: "b1",
      }),
    );
  });

  it("AC-008.5: cada conta tem o acesso de suporte do fluxo de impersonar", async () => {
    const u = userEvent.setup();
    await abrirContas(u);
    const botao = await screen.findByRole("button", { name: /acesso de suporte a acme/i });
    expect(botao.getAttribute("data-impersonate")).toBe("o1");
  });
});
