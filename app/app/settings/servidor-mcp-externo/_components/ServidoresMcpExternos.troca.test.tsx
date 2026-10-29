/**
 * Mudança 006, M1: abrir "Ferramentas" de outro servidor com o painel aberto não pode herdar o estado
 * do anterior. Usa o painel REAL (sem stub): o que se prova é o que o admin vê e o que sai na rede.
 */
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { ApiError } from "@/lib/api/types";

vi.mock("@/hooks/i18n/useT", () => ({ useT: () => (texto: string) => texto }));
vi.mock("@/lib/api/client", () => ({ apiClient: { get: vi.fn(), patch: vi.fn(), post: vi.fn() } }));

import { apiClient } from "@/lib/api/client";

import { ServidoresMcpExternos } from "./ServidoresMcpExternos";

const get = () => vi.mocked(apiClient.get);
const patch = () => vi.mocked(apiClient.patch);

const A = "11111111-1111-4111-8111-111111111111";
const B = "22222222-2222-4222-8222-222222222222";
const AGENTE = "33333333-3333-4333-8333-333333333333";

const servidor = (id: string, nome: string, slug: string) => ({
  id,
  slug,
  nome,
  host: `${slug}.example.com`,
  chave_last4: "9z8y",
  ativo: true,
  ferramentas_em: null,
  ferramentas: [],
});

const ferramenta = (nome: string) => ({
  nome,
  somente_leitura: true,
  ligada: false,
  marca: null,
  liberada_sem_aprovacao: false,
});

beforeEach(() => {
  get().mockReset();
  patch().mockReset();
  patch().mockResolvedValue({ data: {} } as never);
  get().mockImplementation(async (url: string) => {
    if (url === "/api/v1/mcp-servidores") return { data: [servidor(A, "Loja A", "a"), servidor(B, "Loja B", "b")] } as never;
    if (url.startsWith("/api/v1/ai/agents")) return { data: [{ id: AGENTE, name: "Atendente" }] } as never;
    if (url.startsWith(`/api/v1/mcp-servidores/${A}/ferramentas`)) {
      return { data: { ferramentas: [ferramenta("ferramenta_da_a")] } } as never;
    }
    if (url.startsWith(`/api/v1/mcp-servidores/${B}/ferramentas`)) {
      return { data: { ferramentas: [ferramenta("ferramenta_da_b")] } } as never;
    }
    throw new ApiError(404, "not_found", undefined, "r", "x");
  });
});

describe("M1: trocar de servidor com o painel aberto", () => {
  it("o painel do segundo servidor recarrega do zero e nenhum PATCH sai com dados do primeiro", async () => {
    render(<ServidoresMcpExternos />);

    fireEvent.click(await screen.findByRole("button", { name: "Ferramentas de Loja A" }));
    fireEvent.change(await screen.findByLabelText("Agente"), { target: { value: AGENTE } });
    await screen.findByText("ferramenta_da_a");

    fireEvent.click(screen.getByRole("button", { name: "Ferramentas de Loja B" }));

    // Painel novo: nada do A sobrou, o agente voltou a "Escolha um agente".
    await screen.findByText("Ferramentas de Loja B");
    expect(screen.queryByText("ferramenta_da_a")).toBeNull();
    expect((screen.getByLabelText("Agente") as HTMLSelectElement).value).toBe("");

    fireEvent.change(screen.getByLabelText("Agente"), { target: { value: AGENTE } });
    await screen.findByText("ferramenta_da_b");
    fireEvent.click(screen.getByRole("switch", { name: "Ligar ferramenta_da_b" }));

    await waitFor(() => expect(patch()).toHaveBeenCalledTimes(1));
    expect(patch()).toHaveBeenCalledWith(`/api/v1/mcp-servidores/${B}/ferramentas`, {
      acao: "ligar",
      agente_id: AGENTE,
      ferramenta: "ferramenta_da_b",
      marca: "leitura",
    });
    expect(JSON.stringify(patch().mock.calls)).not.toContain("ferramenta_da_a");
  });
});
