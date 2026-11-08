/**
 * Balao no visual de mensageiro (#89, ADR 0007), pelos tokens: o enviado fica a direita na cor de
 * destaque da marca, o recebido a esquerda em balao claro; ambos levam a pontinha na primeira
 * mensagem do grupo, e hora e ticks ficam DENTRO do balao. Nenhuma cor e fixa no codigo; o texto do
 * enviado vem de `--primary-foreground`, calculado pela marca com contraste.
 */
import { render, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { MessageBubble } from "./MessageBubble";
import type { Message } from "@/lib/types/messaging";

function msg(over: Partial<Message> = {}): Message {
  return {
    id: "m1",
    organization_id: "org1",
    conversation_id: "c1",
    channel_session_id: "s1",
    contact_id: "ct1",
    external_id: null,
    type: "text",
    direction: "outbound",
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
    created_at: "2026-09-08T12:00:00.000Z",
    ...over,
  };
}

describe("MessageBubble - visual de mensageiro", () => {
  it("a enviada fica a direita, na cor de destaque e com o texto calculado da marca", () => {
    const { container } = render(<MessageBubble message={msg({ direction: "outbound" })} />);
    const balao = screen.getByTestId("message-bubble");
    expect(balao.className).toContain("bg-bubble-out");
    expect(balao.className).toContain("text-bubble-out-fg");
    expect(container.firstElementChild?.className).toContain("justify-end");
  });

  it("a recebida fica a esquerda, em balao claro (card) sem moldura", () => {
    const { container } = render(<MessageBubble message={msg({ direction: "inbound" })} />);
    const balao = screen.getByTestId("message-bubble");
    expect(balao.className).toContain("bg-bubble-in");
    expect(balao.className).toContain("text-foreground");
    expect(balao.className).not.toContain("border-border");
    expect(balao.className).not.toContain("bg-bubble-out");
    expect(container.firstElementChild?.className).toContain("justify-start");
  });

  it("o canto tem raio de balao do mensageiro (rounded-[8px]), nao o pilula antigo", () => {
    render(<MessageBubble message={msg()} />);
    const balao = screen.getByTestId("message-bubble");
    expect(balao.className).toContain("rounded-[8px]");
    expect(balao.className).not.toContain("rounded-2xl");
  });

  it("a primeira do grupo leva a pontinha do lado certo; a colada nao leva", () => {
    const { rerender } = render(<MessageBubble message={msg({ direction: "outbound" })} colada={false} />);
    expect(screen.getByTestId("balao-pontinha").getAttribute("data-lado")).toBe("direita");
    rerender(<MessageBubble message={msg({ direction: "inbound" })} colada={false} />);
    expect(screen.getByTestId("balao-pontinha").getAttribute("data-lado")).toBe("esquerda");
    rerender(<MessageBubble message={msg({ direction: "inbound" })} colada />);
    expect(screen.queryByTestId("balao-pontinha")).toBeNull();
  });

  it("a pontinha tem a mesma cor do balao (enviada: destaque; recebida: card)", () => {
    const { rerender } = render(<MessageBubble message={msg({ direction: "outbound" })} />);
    expect(screen.getByTestId("balao-pontinha").className).toContain("bg-bubble-out");
    rerender(<MessageBubble message={msg({ direction: "inbound" })} />);
    expect(screen.getByTestId("balao-pontinha").className).toContain("bg-bubble-in");
  });

  it("hora e ticks ficam dentro do balao, no rodape", () => {
    render(<MessageBubble message={msg({ direction: "outbound", status: "delivered" })} fuso="UTC" />);
    const balao = screen.getByTestId("message-bubble");
    const rodape = within(balao).getByTestId("balao-rodape");
    expect(within(rodape).getByText("12:00")).toBeTruthy();
    expect(within(rodape).getByLabelText("Entregue")).toBeTruthy();
  });

  it("a recebida mostra a hora no rodape e nenhum tick", () => {
    render(<MessageBubble message={msg({ direction: "inbound", status: "delivered" })} fuso="UTC" />);
    const rodape = within(screen.getByTestId("message-bubble")).getByTestId("balao-rodape");
    expect(within(rodape).getByText("12:00")).toBeTruthy();
    expect(within(rodape).queryByLabelText("Entregue")).toBeNull();
  });
});
