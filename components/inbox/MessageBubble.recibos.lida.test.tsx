import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { MessageBubble } from "./MessageBubble";
import { VISUAL_DO_RECIBO } from "@/lib/inbox/recibo-visual";
import type { Message } from "@/lib/types/messaging";

function msg(status: string): Message {
  return {
    id: "m1", organization_id: "o", conversation_id: "c", channel_session_id: "s", contact_id: "k",
    external_id: null, type: "text", direction: "outbound", status, ack: null, error_code: null,
    error_message: null, body: "ola", media_url: null, media_mime: null, media_size_bytes: null,
    media_storage_path: null, sent_via: "user", sent_by_user_id: null, sent_at: "2026-10-27T15:05:00.000Z",
    delivered_at: null, read_at: null, metadata: {}, edited_at: null, revoked_at: null,
    reply_to_message_id: null, created_at: "2026-10-27T15:05:00.000Z",
  } as Message;
}

function traco(rotulo: string): number {
  return Number(screen.getByLabelText(rotulo).getAttribute("stroke-width") ?? 0);
}

describe("recibo lida x entregue no balão", () => {
  it("lida tem traço mais grosso e opacidade plena; entregue é fina e esmaecida", () => {
    const { unmount } = render(<MessageBubble message={msg("read")} />);
    const lida = screen.getByLabelText("Lida");
    expect(traco("Lida")).toBe(VISUAL_DO_RECIBO.lida.traco);
    expect(lida.getAttribute("class")).toContain("opacity-100");
    expect(lida.getAttribute("class")).not.toContain("text-primary-foreground");
    unmount();
    render(<MessageBubble message={msg("delivered")} />);
    expect(traco("Entregue")).toBe(VISUAL_DO_RECIBO.entregue.traco);
    expect(screen.getByLabelText("Entregue").getAttribute("class")).toContain("opacity-85");
  });
});
