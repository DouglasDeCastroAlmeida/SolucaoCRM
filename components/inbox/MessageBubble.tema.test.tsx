/**
 * Tema do inbox pelos tokens (REQ-003): o balao enviado usa a cor de destaque da
 * marca e o recebido e neutro. As cores nao sao fixas no codigo; o texto do
 * enviado vem de `--primary-foreground`, calculado pela marca com contraste.
 */
import { render, screen } from "@testing-library/react";
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

describe("MessageBubble - tema pela marca", () => {
  it("AC-003.1: o balao enviado usa a cor de destaque e o texto calculado da marca", () => {
    render(<MessageBubble message={msg({ direction: "outbound" })} />);
    const balao = screen.getByTestId("message-bubble");
    expect(balao.className).toContain("bg-primary");
    expect(balao.className).toContain("text-primary-foreground");
  });

  it("AC-003.3: o balao recebido e neutro, com borda para se separar do fundo", () => {
    render(<MessageBubble message={msg({ direction: "inbound" })} />);
    const balao = screen.getByTestId("message-bubble");
    expect(balao.className).toContain("bg-card");
    expect(balao.className).toContain("text-foreground");
    expect(balao.className).toContain("border-border");
    expect(balao.className).not.toContain("bg-primary");
  });
});
