import { beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

import { CanalEmailClient } from "./CanalEmailClient";

const h = vi.hoisted(() => ({ get: vi.fn(), post: vi.fn() }));
vi.mock("@/lib/api/client", () => ({ apiClient: { get: h.get, post: h.post } }));
vi.mock("@/hooks/i18n/useT", () => ({ useT: () => (s: string) => s }));
vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

beforeEach(() => {
  cleanup();
  vi.clearAllMocks();
});

function montar() {
  render(
    <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
      <CanalEmailClient />
    </QueryClientProvider>,
  );
}

describe("aba de e-mail em Conexões", () => {
  it("AC-001.5: mostra a caixa conectada com endereço e estado, e só os 4 últimos da senha", async () => {
    h.get.mockResolvedValue({
      data: {
        caixas: [
          {
            id: "cx-1",
            endereco: "ana@exemplo.com",
            status: "WORKING",
            usuario: "ana@exemplo.com",
            imap: { host: "imap.exemplo.com", porta: 993 },
            smtp: { host: "smtp.exemplo.com", porta: 465 },
            senha_ultimos4: "m9z2",
            assinatura: null,
            teto_diario: 200,
            intervalo_segundos: 30,
          },
        ],
      },
    });
    montar();

    await screen.findByText("ana@exemplo.com");
    expect(screen.getByText("Conectada")).toBeTruthy();
    expect(document.body.textContent).toContain("••••m9z2");
    expect(screen.getByRole("button", { name: "Conectar outra caixa" })).toBeTruthy();
    // Com caixa conectada o assistente não ocupa a tela até a pessoa pedir.
    expect(screen.queryByTestId("assistente-email")).toBeNull();
  });

  it("AC-001.1: sem nenhuma caixa, o assistente já aparece", async () => {
    h.get.mockResolvedValue({ data: { caixas: [] } });
    montar();

    await screen.findByTestId("assistente-email");
  });

  it("AC-001.4: falha ao listar aparece como erro, nunca como lista vazia", async () => {
    h.get.mockRejectedValue(new Error("Sem permissão"));
    montar();

    expect((await screen.findByRole("alert")).textContent).toContain("Sem permissão");
    expect(screen.queryByTestId("assistente-email")).toBeNull();
  });
});
