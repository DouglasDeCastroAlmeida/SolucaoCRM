/**
 * 009, T-021 (AC-004.1, AC-004.2, AC-004.4): os cartões da Central de avisos
 * como linhas de lista, com Aprovar e Recusar (ações MCP pendentes), resolver,
 * reabrir e os estados vazio e de erro funcionando.
 */
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/hooks/i18n/useT", () => ({ useT: () => (texto: string) => texto }));
vi.mock("@/hooks/i18n/useLocaleDeData", () => ({ useLocaleDeData: () => undefined }));
vi.mock("@/lib/api/client", () => ({ apiClient: { get: vi.fn(), post: vi.fn() } }));
vi.mock("@/hooks/ai/useAgentInbox", () => ({
  useAgentInbox: vi.fn(),
  useUpdateInboxItem: vi.fn(),
  useResolveAllInboxItems: vi.fn(),
}));

import { useAgentInbox, useResolveAllInboxItems, useUpdateInboxItem, type AgentInboxItem } from "@/hooks/ai/useAgentInbox";
import { apiClient } from "@/lib/api/client";

import { AgentInboxList } from "./AgentInboxList";

const CONVERSA = "44444444-4444-4444-8444-444444444444";
const ACAO = "77777777-7777-4777-8777-777777777777";

const aviso: AgentInboxItem = {
  id: "aviso-1",
  kind: "acao_mcp_pendente",
  severity: "warn",
  title: "Uma ação espera sua decisão",
  body: "O assistente pediu para cancelar um pedido.",
  ref_kind: "conversation",
  ref_id: CONVERSA,
  status: "open",
  created_at: new Date().toISOString(),
  destination: { estado: "disponivel", href: "/app/inbox/conversa-1", rotulo: "Abrir conversa" },
} as AgentInboxItem;

const mutar = vi.fn();

function lista(itens: AgentInboxItem[], extra: Record<string, unknown> = {}) {
  vi.mocked(useAgentInbox).mockReturnValue({
    data: { items: itens, open_count: itens.length },
    isLoading: false,
    refetch: vi.fn(),
    ...extra,
  } as unknown as ReturnType<typeof useAgentInbox>);
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(useUpdateInboxItem).mockReturnValue({ mutate: mutar, isPending: false } as unknown as ReturnType<typeof useUpdateInboxItem>);
  vi.mocked(useResolveAllInboxItems).mockReturnValue({ mutate: vi.fn(), isPending: false } as unknown as ReturnType<typeof useResolveAllInboxItems>);
  vi.mocked(apiClient.get).mockResolvedValue({
    data: [{ id: ACAO, servidor: { nome: "Loja", slug: "loja" }, ferramenta: "cancelar_pedido", criado_em: new Date().toISOString() }],
  } as never);
});
afterEach(() => cleanup());

describe("Central de avisos como linhas de lista", () => {
  it("AC-004.1: cada aviso é um item de lista com avatar, título, prévia, gravidade e horário à direita", () => {
    lista([aviso]);
    render(<AgentInboxList canResolve />);
    const item = screen.getByTestId("inbox-item");
    expect(item.tagName).toBe("LI");
    expect(within(item).getByText("Uma ação espera sua decisão")).toBeInTheDocument();
    expect(within(item).getByText("O assistente pediu para cancelar um pedido.")).toBeInTheDocument();
    expect(within(item).getByText("atenção")).toBeInTheDocument();
    expect(within(item).getByRole("link", { name: "Abrir conversa" })).toHaveAttribute("href", "/app/inbox/conversa-1");
  });

  it("AC-004.2: Aprovar e Recusar dentro do cartão mandam a decisão certa", async () => {
    vi.mocked(apiClient.post).mockResolvedValue({ data: { id: ACAO, estado: "executada" } } as never);
    lista([aviso]);
    render(<AgentInboxList canResolve canDecideMcp />);
    const item = screen.getByTestId("inbox-item");

    fireEvent.click(await within(item).findByRole("button", { name: "Aprovar cancelar_pedido" }));
    await waitFor(() => expect(apiClient.post).toHaveBeenCalledWith(`/api/v1/mcp-acoes/${ACAO}`, { decisao: "aprovar" }));

    fireEvent.click(await within(item).findByRole("button", { name: "Recusar cancelar_pedido" }));
    await waitFor(() => expect(apiClient.post).toHaveBeenCalledWith(`/api/v1/mcp-acoes/${ACAO}`, { decisao: "recusar" }));
  });

  it("AC-004.2: sem permissão para decidir, o cartão de ações não aparece", () => {
    lista([aviso]);
    render(<AgentInboxList canResolve canDecideMcp={false} />);
    expect(screen.queryByTestId("acoes-mcp-pendentes")).not.toBeInTheDocument();
    expect(apiClient.get).not.toHaveBeenCalled();
  });

  it("AC-004.2: Marcar resolvido e Reabrir chamam a atualização do aviso", () => {
    lista([aviso]);
    const { rerender } = render(<AgentInboxList canResolve />);
    fireEvent.click(screen.getByRole("button", { name: "Marcar resolvido" }));
    expect(mutar).toHaveBeenCalledWith({ id: "aviso-1", status: "resolved" });

    lista([{ ...aviso, status: "resolved" } as AgentInboxItem]);
    rerender(<AgentInboxList canResolve />);
    fireEvent.click(screen.getByRole("button", { name: "Reabrir" }));
    expect(mutar).toHaveBeenCalledWith({ id: "aviso-1", status: "open" });
  });

  it("AC-004.2: sem permissão de resolver, não há botão de resolver", () => {
    lista([aviso]);
    render(<AgentInboxList canResolve={false} />);
    expect(screen.queryByRole("button", { name: "Marcar resolvido" })).not.toBeInTheDocument();
  });

  it("AC-004.4: lista vazia mostra o estado vazio, e a carga mostra o esqueleto", () => {
    lista([]);
    const { unmount } = render(<AgentInboxList canResolve />);
    expect(screen.getByText("Nenhum aviso em aberto")).toBeInTheDocument();
    expect(screen.queryByRole("listitem")).not.toBeInTheDocument();
    unmount();

    vi.mocked(useAgentInbox).mockReturnValue({ data: undefined, isLoading: true } as unknown as ReturnType<typeof useAgentInbox>);
    render(<AgentInboxList canResolve />);
    expect(screen.queryByText("Nenhum aviso em aberto")).not.toBeInTheDocument();
  });

  it("AC-004.4: erro sem dado mostra o alerta com Tentar novamente", () => {
    vi.mocked(useAgentInbox).mockReturnValue({
      data: undefined, isLoading: false, isError: true, error: new Error("x"), refetch: vi.fn(), isFetching: false,
    } as unknown as ReturnType<typeof useAgentInbox>);
    render(<AgentInboxList canResolve />);
    expect(screen.getByRole("alert")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Tentar novamente" })).toBeInTheDocument();
  });
});
