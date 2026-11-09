import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { MessageBubble } from "./MessageBubble";
import { SeparadorDeData } from "./SeparadorDeData";
import type { Message } from "@/lib/types/messaging";

/**
 * BOLHAS E SEPARADOR DE MENSAGEIRO (#117, protótipo aprovado + print do WhatsApp Web do dono):
 * raio de ~8 px, largura máxima de ~65%, hora pequena e esmaecida dentro da bolha,
 * separador de data em pílula de raio ~8 px; o texto da mensagem é texto simples (#125).
 */

function msg(over: Partial<Message> = {}): Message {
  return {
    id: "m1",
    organization_id: "org1",
    conversation_id: "c1",
    channel_session_id: "s1",
    contact_id: "ct1",
    external_id: null,
    type: "text",
    direction: "inbound",
    status: "sent",
    ack: null,
    error_code: null,
    error_message: null,
    body: "ola",
    media_url: null,
    media_mime: null,
    media_size_bytes: null,
    media_storage_path: null,
    sent_via: "user",
    sent_by_user_id: null,
    sent_at: "2026-09-08T12:00:00.000Z",
    delivered_at: null,
    read_at: null,
    metadata: {},
    edited_at: null,
    revoked_at: null,
    reply_to_message_id: null,
    ...over,
  } as unknown as Message;
}

describe("bolha de mensageiro", () => {
  it("tem raio de 8 px e largura máxima de 65%", () => {
    render(<MessageBubble message={msg()} />);
    const balao = screen.getByTestId("message-bubble");
    expect(balao.className).toContain("rounded-[8px]");
    expect(balao.className).toContain("max-w-[65%]");
  });

  it("a cauda fica do lado de quem fala: recebida à esquerda, enviada à direita", () => {
    const { unmount } = render(<MessageBubble message={msg()} />);
    expect(screen.getByTestId("balao-pontinha").getAttribute("data-lado")).toBe("esquerda");
    unmount();
    render(<MessageBubble message={msg({ direction: "outbound" })} />);
    expect(screen.getByTestId("balao-pontinha").getAttribute("data-lado")).toBe("direita");
  });

  it("a hora é pequena (12 px, o piso do design system) e esmaecida, no canto inferior direito dentro da bolha", () => {
    render(<MessageBubble message={msg()} />);
    const rodape = screen.getByTestId("balao-rodape");
    expect(rodape.className).toContain("text-xs");
    expect(rodape.className).toContain("justify-end");
    expect(rodape.className).toContain("text-muted-foreground");
    expect(screen.getByTestId("message-bubble").contains(rodape)).toBe(true);
  });

  it("URL no texto fica como texto simples, sem virar link", () => {
    render(<MessageBubble message={msg({ body: "veja https://exemplo.com/planta e me diga" })} />);
    expect(screen.queryByRole("link")).toBeNull();
    expect(screen.getByText("veja https://exemplo.com/planta e me diga")).toBeTruthy();
  });
});

describe("separador de data", () => {
  it("é uma pílula de raio 8 px sobre o fundo do tema, centralizada e grudada no topo", () => {
    const { container } = render(<SeparadorDeData rotulo="Ontem" />);
    const pilula = screen.getByText("Ontem");
    expect(pilula.className).toContain("rounded-[8px]");
    expect(pilula.className).not.toContain("rounded-full");
    expect(pilula.className).toContain("bg-card");
    expect(container.firstElementChild?.className).toContain("justify-center");
    expect(container.firstElementChild?.className).toContain("sticky");
  });
});
