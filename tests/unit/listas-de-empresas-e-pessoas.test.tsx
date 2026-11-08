/**
 * Visual de mensageiro (#91): Empresas e Pessoas viram listas em linhas com
 * avatar redondo (iniciais) e divisória fina, como os contatos. Só apresentação:
 * a busca, os links de detalhe e os dados mostrados continuam os mesmos.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, waitFor } from "@testing-library/react";

vi.mock("@/hooks/i18n/useT", () => ({ useT: () => (texto: string) => texto }));

import { CompaniesListClient } from "@/app/app/companies/_client";
import { PeopleListClient } from "@/app/app/people/_client";

function responder(dados: unknown[]) {
  vi.stubGlobal(
    "fetch",
    vi.fn(async () => ({ ok: true, json: async () => ({ data: dados }) })),
  );
}

beforeEach(() => vi.unstubAllGlobals());
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("Empresas em linhas", () => {
  it("cada empresa e uma linha com avatar de iniciais, link de detalhe, CNPJ e cidade", async () => {
    responder([
      {
        id: "e1",
        trade_name: "Acme Foods",
        legal_name: "ACME LTDA",
        cnpj: "33.547.054/0001-20",
        city: "Sao Paulo",
        state: "SP",
        registration_status: "ATIVA",
        enrichment_status: "done",
        updated_at: "2026-01-02T10:00:00Z",
      },
    ]);
    render(<CompaniesListClient />);
    const linha = await screen.findByRole("listitem");
    expect(linha).toHaveTextContent("AF");
    expect(screen.getByRole("link", { name: /Acme Foods/ })).toHaveAttribute("href", "/app/companies/e1");
    expect(linha).toHaveTextContent("ACME LTDA");
    expect(linha).toHaveTextContent("33.547.054/0001-20");
    expect(linha).toHaveTextContent("Sao Paulo/SP");
    expect(linha).toHaveTextContent("ATIVA");
    expect(screen.queryByRole("table")).toBeNull();
  });

  it("sem empresas mostra o vazio; carregando mostra o aviso", async () => {
    responder([]);
    render(<CompaniesListClient />);
    expect(screen.getByText("Carregando…")).toBeInTheDocument();
    await waitFor(() => expect(screen.getByText("Nenhuma empresa ainda.")).toBeInTheDocument());
  });
});

describe("Pessoas em linhas", () => {
  it("cada pessoa e uma linha com avatar de iniciais, link de detalhe e e-mail", async () => {
    responder([{ id: "p1", full_name: "Maria Souza", email: "maria@exemplo.com", updated_at: "2026-01-02T10:00:00Z" }]);
    render(<PeopleListClient />);
    const linha = await screen.findByRole("listitem");
    expect(linha).toHaveTextContent("MS");
    expect(screen.getByRole("link", { name: /Maria Souza/ })).toHaveAttribute("href", "/app/people/p1");
    expect(linha).toHaveTextContent("maria@exemplo.com");
    expect(screen.queryByRole("table")).toBeNull();
  });

  it("sem e-mail mostra travessao; sem pessoas mostra o vazio", async () => {
    responder([{ id: "p2", full_name: "Joao", email: null, updated_at: "2026-01-02T10:00:00Z" }]);
    render(<PeopleListClient />);
    expect(await screen.findByRole("listitem")).toHaveTextContent("—");
    cleanup();
    responder([]);
    render(<PeopleListClient />);
    await waitFor(() => expect(screen.getByText("Nenhuma pessoa ainda.")).toBeInTheDocument());
  });
});
