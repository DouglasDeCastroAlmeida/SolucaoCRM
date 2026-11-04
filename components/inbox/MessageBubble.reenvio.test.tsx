/** Revisão da Fatia 6: dois cliques seguidos em "Tentar de novo" disparam UM só reenvio. */
import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { capabilitiesOf } from "@/lib/channels/capabilities";
import type { Message } from "@/lib/types/messaging";

import { MessageBubble } from "./MessageBubble";

const base = {
  id: "m1", organization_id: "o", conversation_id: "c1", channel_session_id: "s1", contact_id: "ct",
  external_id: null, type: "text", direction: "outbound", status: "failed", ack: null,
  error_code: null, error_message: "x", body: "Oi", sent_via: "user", created_at: "2026-11-04T10:00:00.000Z", sent_at: "2026-11-04T10:00:00.000Z", metadata: {}, media_storage_path: null,
} as unknown as Message;

describe("Tentar de novo", () => {
  it("dois cliques seguidos contam UMA chamada e o botão fica desabilitado", () => {
    const reenviar = vi.fn(() => new Promise<void>(() => {}));
    render(
      <MessageBubble
        message={base}
        capacidades={capabilitiesOf("email")}
        onTentarDeNovo={reenviar}
      />,
    );
    const botao = screen.getByRole("button", { name: "Tentar de novo" });
    fireEvent.click(botao);
    fireEvent.click(botao);
    expect(reenviar).toHaveBeenCalledTimes(1);
    expect((screen.getByRole("button", { name: "Tentar de novo" }) as HTMLButtonElement).disabled).toBe(true);
  });
});
