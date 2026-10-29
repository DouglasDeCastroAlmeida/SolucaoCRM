/**
 * Mudança 006 (AC-007.3): o cartão da Central com as ações de servidor externo que esperam uma pessoa.
 * Mostra "servidor — ferramenta" e "pedida há X", com Aprovar e Recusar; os dados do pedido não
 * aparecem (a API nem os devolve) e a tela diz isso.
 */
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { ApiError } from "@/lib/api/types";

vi.mock("@/hooks/i18n/useT", () => ({ useT: () => (texto: string) => texto }));
vi.mock("@/hooks/i18n/useLocaleDeData", () => ({ useLocaleDeData: () => undefined }));
vi.mock("@/lib/api/client", () => ({ apiClient: { get: vi.fn(), post: vi.fn() } }));

import { apiClient } from "@/lib/api/client";

import { AcoesMcpPendentes } from "./AcoesMcpPendentes";

const CONVERSA = "44444444-4444-4444-8444-444444444444";
const ACAO = "77777777-7777-4777-8777-777777777777";
const get = () => vi.mocked(apiClient.get);
const post = () => vi.mocked(apiClient.post);

const LISTA = {
  data: [
    {
      id: ACAO,
      servidor: { nome: "Loja", slug: "loja" },
      ferramenta: "cancelar_pedido",
      criado_em: new Date(Date.now() - 5 * 60_000).toISOString(),
      conversa_id: CONVERSA,
      estado: "pendente",
    },
  ],
};

beforeEach(() => {
  get().mockReset();
  post().mockReset();
  get().mockResolvedValue(LISTA as never);
});
afterEach(cleanup);

describe("AC-007.3: cartão de ação pendente na Central", () => {
  it("AC-007.3: busca as pendentes da conversa e mostra servidor, ferramenta, há quanto tempo e o aviso de privacidade", async () => {
    render(<AcoesMcpPendentes conversaId={CONVERSA} />);
    expect(await screen.findByText("Loja — cancelar_pedido")).toBeTruthy();
    expect(get()).toHaveBeenCalledWith(`/api/v1/mcp-acoes?conversa_id=${CONVERSA}`);
    expect(screen.getByText(/pedida há/i)).toBeTruthy();
    expect(screen.getByText(/dados do pedido não aparecem aqui/i)).toBeTruthy();
  });

  it("AC-007.3: Aprovar manda a decisão e relê a lista", async () => {
    post().mockResolvedValue({ data: { id: ACAO, estado: "executada" } } as never);
    render(<AcoesMcpPendentes conversaId={CONVERSA} />);
    get().mockResolvedValueOnce({ data: [] } as never);
    fireEvent.click(await screen.findByRole("button", { name: "Aprovar cancelar_pedido" }));
    await waitFor(() => expect(post()).toHaveBeenCalledWith(`/api/v1/mcp-acoes/${ACAO}`, { decisao: "aprovar" }));
    expect(await screen.findByText("Pronto: a ação foi aprovada e executada.")).toBeTruthy();
    await waitFor(() => expect(get()).toHaveBeenCalledTimes(2));
  });

  it("AC-007.3: Recusar manda a decisão 'recusar'", async () => {
    post().mockResolvedValue({ data: { id: ACAO, estado: "recusada" } } as never);
    render(<AcoesMcpPendentes conversaId={CONVERSA} />);
    fireEvent.click(await screen.findByRole("button", { name: "Recusar cancelar_pedido" }));
    await waitFor(() => expect(post()).toHaveBeenCalledWith(`/api/v1/mcp-acoes/${ACAO}`, { decisao: "recusar" }));
    expect(await screen.findByText("A ação foi recusada e não será executada.")).toBeTruthy();
  });

  it("AC-007.3: resultado 'falhou' diz que a aprovação foi registrada e o servidor não executou", async () => {
    post().mockResolvedValue({ data: { id: ACAO, estado: "falhou", mensagem: "motivo_interno_x" } } as never);
    render(<AcoesMcpPendentes conversaId={CONVERSA} />);
    fireEvent.click(await screen.findByRole("button", { name: "Aprovar cancelar_pedido" }));
    const alerta = await screen.findByRole("alert");
    expect(alerta.textContent).toMatch(/aprovação foi registrada, mas o servidor externo não conseguiu executar/i);
    expect(alerta.textContent).not.toContain("motivo_interno_x");
  });

  it.each([
    [409, "state_conflict", /já foi decidida por outra pessoa/i],
    [404, "not_found", /não foi encontrada/i],
    [500, "internal_error", /tente de novo/i],
  ])("AC-007.3: erro %s chega em português simples, sem o código", async (status, codigo, esperado) => {
    post().mockRejectedValue(new ApiError(status, codigo, undefined, "r1", codigo));
    render(<AcoesMcpPendentes conversaId={CONVERSA} />);
    fireEvent.click(await screen.findByRole("button", { name: "Aprovar cancelar_pedido" }));
    const alerta = await screen.findByRole("alert");
    expect(alerta.textContent).toMatch(esperado);
    expect(alerta.textContent).not.toContain(codigo);
  });

  it("M4: se a lista não carrega, avisa em português simples em vez de sumir", async () => {
    get().mockRejectedValue(new ApiError(500, "internal_error", undefined, "r1", "internal_error"));
    render(<AcoesMcpPendentes conversaId={CONVERSA} />);
    const alerta = await screen.findByRole("alert");
    expect(alerta.textContent).toBe("Não foi possível carregar as ações. Recarregue a página.");
    expect(alerta.textContent).not.toContain("internal_error");
    expect(screen.queryByRole("button", { name: /Aprovar/ })).toBeNull();
  });

  it("M4: quando a lista volta a carregar, o aviso de falha some", async () => {
    post().mockResolvedValue({ data: { id: ACAO, estado: "executada" } } as never);
    render(<AcoesMcpPendentes conversaId={CONVERSA} />);
    fireEvent.click(await screen.findByRole("button", { name: "Aprovar cancelar_pedido" }));
    await screen.findByText("Pronto: a ação foi aprovada e executada.");
    expect(screen.queryByText("Não foi possível carregar as ações. Recarregue a página.")).toBeNull();
  });

  it("M4: depois de decidir, avisa a Central para reler a própria lista", async () => {
    post().mockResolvedValue({ data: { id: ACAO, estado: "executada" } } as never);
    const aoDecidir = vi.fn();
    render(<AcoesMcpPendentes conversaId={CONVERSA} aoDecidir={aoDecidir} />);
    fireEvent.click(await screen.findByRole("button", { name: "Aprovar cancelar_pedido" }));
    await waitFor(() => expect(aoDecidir).toHaveBeenCalledTimes(1));
  });

  it("AC-007.3: sem ação pendente, o cartão não ocupa lugar", async () => {
    get().mockResolvedValue({ data: [] } as never);
    const { container } = render(<AcoesMcpPendentes conversaId={CONVERSA} />);
    await waitFor(() => expect(get()).toHaveBeenCalled());
    await waitFor(() => expect(container.textContent).toBe(""));
  });
});
