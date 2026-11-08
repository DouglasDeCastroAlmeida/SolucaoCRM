/**
 * Campo de escrever no formato de mensageiro (#90, épico #82): emoji e anexo à
 * esquerda do campo, microfone (ou enviar) à direita, na ordem do WhatsApp.
 * O comportamento não muda: só a ordem e o glifo.
 */
import { fireEvent, render, screen } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { describe, expect, it, vi } from "vitest";

vi.mock("@/hooks/inbox/useUploadMedia", () => ({
  useUploadMedia: () => ({ mutateAsync: vi.fn(), isPending: false }),
}));
vi.mock("@/hooks/inbox/useSendMessage", () => ({
  useSendMessage: () => ({ mutate: vi.fn(), isPending: false }),
}));

vi.mock("@/hooks/inbox/useCreateNote", () => ({
  useCreateNote: () => ({ mutate: vi.fn(), isPending: false }),
}));
vi.mock("@/hooks/inbox/useAssignableMembers", () => ({
  useAssignableMembers: () => ({ data: [] }),
}));
vi.mock("@/hooks/inbox/useMessageTemplates", () => ({
  useMessageTemplates: () => ({ data: [] }),
}));
vi.mock("@/components/inbox/composer/ReplyReviewPanel", () => ({
  ReplyReviewPanel: () => null,
}));

import { Composer } from "@/components/inbox/Composer";
import { Clipe } from "@/lib/ui/icons";

function renderComposer() {
  return render(
    <QueryClientProvider client={new QueryClient()}>
      <Composer conversationId="conv-1" />
    </QueryClientProvider>,
  );
}

function vemAntes(a: Element, b: Element) {
  return Boolean(a.compareDocumentPosition(b) & Node.DOCUMENT_POSITION_FOLLOWING);
}

describe("Composer no formato de mensageiro", () => {
  it("ordem: emoji, anexo, campo e, por último, o microfone", () => {
    renderComposer();
    const emoji = screen.getByRole("button", { name: /emoji/i });
    const anexo = screen.getByRole("button", { name: /anexar/i });
    const campo = screen.getByRole("textbox");
    const mic = screen.getByRole("button", { name: /gravar áudio/i });
    expect(vemAntes(emoji, anexo)).toBe(true);
    expect(vemAntes(anexo, campo)).toBe(true);
    expect(vemAntes(campo, mic)).toBe(true);
  });

  it("com texto digitado, o enviar ocupa o lugar do microfone, à direita do campo", () => {
    renderComposer();
    const campo = screen.getByRole("textbox");
    fireEvent.change(campo, { target: { value: "oi" } });
    const enviar = screen.getByRole("button", { name: /^enviar$/i });
    expect(vemAntes(campo, enviar)).toBe(true);
    expect(screen.queryByRole("button", { name: /gravar áudio/i })).toBeNull();
  });

  it("o botão de anexo desenha o clipe do mapa único, não o sinal de mais", () => {
    renderComposer();
    const caminhoDoAnexo = screen
      .getByRole("button", { name: /anexar/i })
      .querySelector("svg path")
      ?.getAttribute("d");
    const { container } = render(<Clipe />);
    expect(caminhoDoAnexo).toBeTruthy();
    expect(caminhoDoAnexo).toBe(container.querySelector("path")?.getAttribute("d"));
  });

  it("o campo vive numa pílula identificável, com o resto do compositor intacto", () => {
    renderComposer();
    expect(screen.getByTestId("campo-de-escrever")).toContainElement(screen.getByRole("textbox"));
    expect(screen.getByRole("button", { name: /nota interna/i })).toBeInTheDocument();
  });
});
