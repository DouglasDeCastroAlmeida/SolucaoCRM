/**
 * Balao da conversa no estilo WhatsApp (REQ-002 e REQ-006): recibos guiados pelo
 * DADO da propria mensagem, falha visivel, horario dentro do balao no fuso da
 * organizacao, cauda so no fim do grupo e texto longo sem estourar a coluna.
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
    sent_at: "2026-10-27T15:05:00.000Z",
    delivered_at: null,
    read_at: null,
    metadata: {},
    edited_at: null,
    revoked_at: null,
    reply_to_message_id: null,
    created_at: "2026-10-27T15:05:00.000Z",
    ...over,
  };
}

const RECIBOS = ["Enviando", "Enviada", "Entregue", "Lida"];

function recibosPresentes(): string[] {
  return RECIBOS.filter((r) => screen.queryByLabelText(r) !== null);
}

describe("MessageBubble - recibos (AC-002.3, AC-006.1)", () => {
  it.each([
    ["queued", "Enviando"],
    ["sending", "Enviando"],
    ["sent", "Enviada"],
    ["delivered", "Entregue"],
    ["read", "Lida"],
  ])("AC-002.3: status %s mostra so o recibo %s", (status, rotulo) => {
    render(<MessageBubble message={msg({ status })} />);
    expect(recibosPresentes()).toEqual([rotulo]);
  });

  it("AC-002.3: o recibo de lida tem aparência própria, diferente da entregue", () => {
    const { unmount } = render(<MessageBubble message={msg({ status: "read" })} />);
    const lida = screen.getByLabelText("Lida").getAttribute("class") ?? "";
    unmount();
    render(<MessageBubble message={msg({ status: "delivered" })} />);
    const entregue = screen.getByLabelText("Entregue").getAttribute("class") ?? "";
    expect(lida).not.toBe(entregue);
  });

  it("AC-006.1: canal que nunca informa entrega/leitura (status 'sent', sem ack) so mostra Enviada, nada inventado", () => {
    render(<MessageBubble message={msg({ status: "sent", ack: null })} />);
    expect(recibosPresentes()).toEqual(["Enviada"]);
  });

  it("AC-002.3: mensagem recebida nao leva recibo", () => {
    render(<MessageBubble message={msg({ direction: "inbound", status: "read" })} />);
    expect(recibosPresentes()).toEqual([]);
  });
});

describe("MessageBubble - falha (AC-002.4)", () => {
  it("mostra a falha de forma visivel e nenhum recibo de sucesso", () => {
    render(<MessageBubble message={msg({ status: "failed", error_message: "Numero invalido" })} />);
    expect(screen.getByText(/Falhou/)).toBeTruthy();
    expect(recibosPresentes()).toEqual([]);
    expect(screen.getByTestId("message-bubble").className).toContain("border-destructive");
  });
});

describe("MessageBubble - horario (AC-002.5)", () => {
  it("fica DENTRO do balao, pequeno, no fuso da organizacao", () => {
    render(<MessageBubble message={msg()} fuso="America/Sao_Paulo" />);
    const hora = within(screen.getByTestId("message-bubble")).getByText("12:05");
    expect(hora.parentElement?.className).toContain("text-[10px]");
  });

  it("muda com o fuso da organizacao, nao com o do navegador", () => {
    render(<MessageBubble message={msg()} fuso="UTC" />);
    expect(within(screen.getByTestId("message-bubble")).getByText("15:05")).toBeTruthy();
  });
});

describe("MessageBubble - cauda e agrupamento (AC-002.1)", () => {
  it("a cauda so aparece na ultima do grupo", () => {
    const { rerender } = render(<MessageBubble message={msg()} />);
    expect(screen.getByTestId("message-bubble").getAttribute("data-cauda")).toBe("true");
    expect(screen.getByTestId("message-bubble").className).toContain("rounded-br-sm");
    rerender(<MessageBubble message={msg()} comCauda={false} colada />);
    const balao = screen.getByTestId("message-bubble");
    expect(balao.getAttribute("data-cauda")).toBe("false");
    expect(balao.className).not.toContain("rounded-br-sm");
  });

  it("a recebida tem a cauda do lado esquerdo", () => {
    render(<MessageBubble message={msg({ direction: "inbound" })} />);
    expect(screen.getByTestId("message-bubble").className).toContain("rounded-bl-sm");
  });
});

describe("MessageBubble - texto longo (AC-006.2)", () => {
  it("quebra linha e palavra e nao estoura a coluna", () => {
    const longo = Array.from({ length: 40 }, (_, i) => `linha ${i} ${"x".repeat(200)}`).join("\n");
    render(<MessageBubble message={msg({ body: longo })} />);
    const balao = screen.getByTestId("message-bubble");
    expect(balao.className).toContain("max-w-[75%]");
    expect(balao.className).toContain("min-w-0");
    const corpo = balao.querySelector("p.whitespace-pre-wrap");
    expect(corpo?.className).toContain("wrap-anywhere");
    expect(balao.parentElement?.className).toContain("min-w-0");
  });
});
