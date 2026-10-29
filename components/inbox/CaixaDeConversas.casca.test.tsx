/**
 * 009 / AC-003.4 — a caixa de conversas da 004 dentro da casca nova.
 *
 * A casca mudou VALORES de token (superfícies, cantos, tipografia), não classes. Então a
 * prova de que a 004 se encaixa sem remendo é que lista e balões seguem renderizando com as
 * MESMAS classes de token (nada de cor fixa) e que o recibo segue guiado pelo dado.
 * O menu "/" tem a prova própria em `Composer.respostas.test.tsx` (AC-004.2 e AC-004.3).
 */
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { ConversationListItem } from "./ConversationListItem";
import { MessageBubble } from "./MessageBubble";
import { conversaDeExemplo } from "./__fixtures__/conversa";
import type { Message } from "@/lib/types/messaging";

function msg(over: Partial<Message> = {}): Message {
  return {
    id: "m1", organization_id: "org1", conversation_id: "c1", channel_session_id: "s1",
    contact_id: "ct1", external_id: null, type: "text", direction: "outbound", status: "sent",
    ack: null, error_code: null, error_message: null, body: "ola", media_url: null,
    media_mime: null, media_size_bytes: null, media_storage_path: null, sent_via: "user",
    sent_by_user_id: null, sent_at: "2026-10-27T15:05:00.000Z", delivered_at: null,
    read_at: null, metadata: {}, edited_at: null, revoked_at: null, reply_to_message_id: null,
    created_at: "2026-10-27T15:05:00.000Z", ...over,
  };
}

const COR_FIXA = /(?:^|\s)(?:bg|text|border)-\[#|(?:^|\s)(?:bg|text|border)-(?:green|emerald|red|blue|gray|slate|white|black)(?:-|\s|$)/;

describe("AC-003.4: caixa de conversas da 004 na casca nova", () => {
  it("a linha da conversa renderiza com a prévia e a seleção por token", () => {
    const { container } = render(
      <ConversationListItem
        conversation={conversaDeExemplo.conversation}
        {...conversaDeExemplo.props}
        isSelected
      />,
    );
    expect(screen.getByText("bom dia")).toBeInTheDocument();
    const html = container.innerHTML;
    expect(html).toContain("bg-accent-soft");
    expect(html).toContain("border-border");
    expect(html).toContain("bg-surface-elevated");
    expect(html).not.toMatch(/#[0-9a-fA-F]{3,8}\b/);
    expect(container.querySelector("[class]")?.className ?? "").not.toMatch(COR_FIXA);
  });

  it("o balão enviado mantém cor da marca e recibo; o recebido, neutro", () => {
    const { unmount } = render(<MessageBubble message={msg()} />);
    const enviado = screen.getByTestId("message-bubble");
    expect(enviado.className).toContain("bg-primary");
    expect(enviado.className).not.toMatch(COR_FIXA);
    expect(screen.getByLabelText("Enviada")).toBeInTheDocument();
    unmount();

    render(<MessageBubble message={msg({ direction: "inbound" })} />);
    const recebido = screen.getByTestId("message-bubble");
    expect(recebido.className).toContain("bg-card");
    expect(recebido.className).toContain("border-border");
    expect(recebido.className).not.toMatch(COR_FIXA);
  });

  it("o duplo check de entregue e lida segue guiado pelo dado", () => {
    render(<MessageBubble message={msg({ status: "read", read_at: "2026-10-27T15:06:00.000Z" })} />);
    expect(screen.getByLabelText("Lida")).toBeInTheDocument();
  });
});
