import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen } from "@testing-library/react";
import type { ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Message } from "@/lib/types/messaging";

/**
 * O BOTÃO FLUTUANTE "IR AO FIM DA CONVERSA" (#117, print do WhatsApp Web do dono): um círculo branco com
 * seta para baixo no canto inferior direito do fio. Só aparece quando a pessoa rolou para longe do fim
 * (como a guarda de ancoragem, mais de 120 px) e leva suave até a última mensagem.
 */

const estado = vi.hoisted(() => ({ mensagens: [] as unknown[] }));

vi.mock("@/hooks/inbox/useMessagesRealtime", () => ({
  useMessagesRealtime: () => ({
    data: { pages: [{ data: estado.mensagens }] },
    isLoading: false,
    isError: false,
    hasNextPage: false,
    isFetchingNextPage: false,
    fetchNextPage: vi.fn(),
    refetch: vi.fn(),
  }),
}));
vi.mock("@/hooks/inbox/useConversationNotes", () => ({ useConversationNotes: () => [] }));
vi.mock("@/hooks/inbox/usePassagensDaConversa", () => ({ usePassagensDaConversa: () => [] }));
vi.mock("@/hooks/inbox/useClaimConversation", () => ({
  useClaimConversation: () => ({ mutate: vi.fn(), isPending: false }),
}));
vi.mock("@/hooks/inbox/useDeleteNote", () => ({ useDeleteNote: () => ({ mutate: vi.fn() }) }));
vi.mock("@/hooks/ai/useDebugToggle", () => ({ useDebugToggle: () => ({ enabled: false }) }));
vi.mock("@/hooks/auth/AuthProvider", () => ({
  useActiveOrg: () => ({ role: "agent" }),
  useUser: () => ({ id: "u-1" }),
}));
vi.mock("@/hooks/i18n/useT", () => ({ useT: () => (texto: string) => texto }));
vi.mock("@/hooks/i18n/useLocaleDeData", () => ({ useLocaleDeData: () => undefined }));
vi.mock("@/components/inbox/MessageBubble", () => ({ MessageBubble: () => <div /> }));
vi.mock("@/components/inbox/NoteCard", () => ({ NoteCard: () => null }));
vi.mock("@/components/inbox/PassagemCard", () => ({ PassagemCard: () => null }));

import { ChatThread } from "@/components/inbox/ChatThread";

const mensagem = (n: number) =>
  ({
    id: `m-${n}`,
    sent_at: new Date(Date.UTC(2026, 8, 24, 12, n)).toISOString(),
    reply_to_message_id: null,
  }) as unknown as Message;

let qc: QueryClient;
const wrapper = ({ children }: { children: ReactNode }) => (
  <QueryClientProvider client={qc}>{children}</QueryClientProvider>
);

const rolar = vi.fn();
const original = Element.prototype.scrollIntoView;

describe("ChatThread: ir ao fim da conversa", () => {
  beforeEach(() => {
    qc = new QueryClient();
    rolar.mockClear();
    estado.mensagens = [mensagem(1), mensagem(2)];
    Element.prototype.scrollIntoView = rolar;
  });
  afterEach(() => {
    Element.prototype.scrollIntoView = original;
    vi.restoreAllMocks();
  });

  function scroller(container: HTMLElement): HTMLElement {
    return container.querySelector(".fundo-da-conversa") as HTMLElement;
  }

  function afastar(el: HTMLElement, distancia: number) {
    Object.defineProperty(el, "scrollHeight", { configurable: true, value: 1000 });
    Object.defineProperty(el, "clientHeight", { configurable: true, value: 500 });
    Object.defineProperty(el, "scrollTop", { configurable: true, value: 500 - distancia, writable: true });
    fireEvent.scroll(el);
  }

  it("no fim da conversa o botão não existe", () => {
    render(<ChatThread conversationId="c-1" />, { wrapper });
    expect(screen.queryByRole("button", { name: "Ir para o fim da conversa" })).toBeNull();
  });

  it("rolando para longe do fim, aparece um círculo branco que leva suave ao fim", () => {
    const { container } = render(<ChatThread conversationId="c-1" />, { wrapper });
    afastar(scroller(container), 400);
    const botao = screen.getByRole("button", { name: "Ir para o fim da conversa" });
    expect(botao.className).toContain("rounded-full");
    expect(botao.className).toContain("bg-card");
    expect(botao.className).toContain("absolute");
    rolar.mockClear();
    fireEvent.click(botao);
    expect(rolar).toHaveBeenCalledWith({ behavior: "smooth", block: "end" });
  });

  it("voltando ao fim, o botão some", () => {
    const { container } = render(<ChatThread conversationId="c-1" />, { wrapper });
    afastar(scroller(container), 400);
    afastar(scroller(container), 10);
    expect(screen.queryByRole("button", { name: "Ir para o fim da conversa" })).toBeNull();
  });
});
