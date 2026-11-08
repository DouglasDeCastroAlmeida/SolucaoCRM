/**
 * Área de escrever no formato do WhatsApp Web (#118, spec #112, ADR 0008).
 *
 * Decisão do dono (print do WhatsApp dele): NÃO há barra cinza. O campo é uma pílula
 * flutuante sobre o fundo da conversa, com emoji e clipe DENTRO à esquerda e o microfone
 * DENTRO à direita; o círculo verde de ~40 px só existe como "Enviar", quando há texto.
 * "Nota interna" é opção do clipe e "Sugerir resposta" é um ícone da linha. O
 * comportamento não muda: só a forma e o caminho até os controles.
 */
import { fireEvent, render, screen, within } from "@testing-library/react";
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

describe("Composer: pílula flutuante do WhatsApp Web", () => {
  it("emoji, clipe, campo, sugerir resposta e microfone, nessa ordem, todos DENTRO da pílula", () => {
    renderComposer();
    const pilula = screen.getByTestId("campo-de-escrever");
    const emoji = within(pilula).getByRole("button", { name: /emoji/i });
    const anexo = within(pilula).getByRole("button", { name: /anexar/i });
    const campo = within(pilula).getByRole("textbox");
    const sugerir = within(pilula).getByRole("button", { name: /sugerir resposta/i });
    const mic = within(pilula).getByRole("button", { name: /gravar áudio/i });
    expect(vemAntes(emoji, anexo)).toBe(true);
    expect(vemAntes(anexo, campo)).toBe(true);
    expect(vemAntes(campo, sugerir)).toBe(true);
    expect(vemAntes(sugerir, mic)).toBe(true);
  });

  it("a pílula é branca (superfície) com sombra, sem borda; a área em volta não é uma barra cinza", () => {
    renderComposer();
    const pilula = screen.getByTestId("campo-de-escrever");
    expect(pilula.className).toMatch(/\bbg-card\b/);
    expect(pilula.className).toMatch(/\bshadow-/);
    expect(pilula.className).not.toMatch(/\bborder\b/);
    const area = screen.getByTestId("area-de-escrever");
    expect(area.className).toContain("fundo-da-conversa");
    expect(area.className).not.toMatch(/border-t|bg-muted|bg-background/);
  });

  it("vazio, só o microfone aparece e o círculo verde de enviar não existe", () => {
    renderComposer();
    expect(screen.getByRole("button", { name: /gravar áudio/i })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /^enviar$/i })).toBeNull();
  });

  it("com texto, o círculo verde de ~40 px (Enviar) fica à direita e FORA da pílula, e o microfone some", () => {
    renderComposer();
    const pilula = screen.getByTestId("campo-de-escrever");
    fireEvent.change(screen.getByRole("textbox"), { target: { value: "oi" } });
    const enviar = screen.getByRole("button", { name: /^enviar$/i });
    expect(vemAntes(pilula, enviar)).toBe(true);
    expect(pilula).not.toContainElement(enviar);
    expect(enviar.className).toMatch(/\bsize-10\b/);
    expect(enviar.className).toMatch(/\brounded-full\b/);
    expect(screen.queryByRole("button", { name: /gravar áudio/i })).toBeNull();
  });

  it("os ícones da linha têm 24 px", () => {
    renderComposer();
    for (const nome of [/emoji/i, /anexar/i, /gravar áudio/i]) {
      const svg = screen.getByRole("button", { name: nome }).querySelector("svg");
      expect(svg?.getAttribute("width"), String(nome)).toBe("24");
    }
  });

  it("o botão de anexo desenha o clipe do mapa único", () => {
    renderComposer();
    const caminhoDoAnexo = screen
      .getByRole("button", { name: /anexar/i })
      .querySelector("svg path")
      ?.getAttribute("d");
    const { container } = render(<Clipe />);
    expect(caminhoDoAnexo).toBeTruthy();
    expect(caminhoDoAnexo).toBe(container.querySelector("path")?.getAttribute("d"));
  });
});

describe("Composer: Nota interna como opção do clipe", () => {
  it("sem a faixa Responder/Nota interna: nenhum botão 'Nota interna' solto na tela", () => {
    renderComposer();
    expect(screen.queryByRole("button", { name: /nota interna/i })).toBeNull();
    expect(screen.queryByRole("button", { name: /^responder$/i })).toBeNull();
  });

  it("o menu do clipe oferece Nota interna; escolher troca o campo para nota e mostra o caminho de volta", () => {
    renderComposer();
    fireEvent.click(screen.getByRole("button", { name: /anexar/i }));
    fireEvent.click(screen.getByRole("button", { name: /nota interna/i }));
    expect(screen.getByRole("textbox")).toHaveAttribute("placeholder", expect.stringMatching(/nota interna/i));
    // A nota sempre tem o enviar (salvar) à vista.
    expect(screen.getByRole("button", { name: /^enviar$/i })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /^responder$/i }));
    expect(screen.getByRole("textbox")).toHaveAttribute("placeholder", expect.stringMatching(/mensagem/i));
    expect(screen.queryByRole("button", { name: /^responder$/i })).toBeNull();
  });
});
