/**
 * Fatia 6 (T-036/T-037, AC-008.5): a conversa de e-mail no inbox. Assunto e texto à vista, HTML
 * limpo só sob demanda (e sem rodar nada), anexos com download, aviso de mensagem adiada pelo
 * teto ou intervalo, "Tentar de novo" na falha, e nenhum recibo de leitura. O balão decide pelo
 * DADO da mensagem e pelas capacidades do canal, nunca perguntando "é e-mail?".
 */
import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { capabilitiesOf, DEFAULT_CHANNEL_PROVIDER } from "@/lib/channels/capabilities";
import type { Message } from "@/lib/types/messaging";

import { MessageBubble } from "./MessageBubble";

function msg(over: Partial<Message> = {}): Message {
  return {
    id: "m1",
    organization_id: "org1",
    conversation_id: "c1",
    channel_session_id: "s1",
    contact_id: "ct1",
    external_id: "<abc@exemplo.com>",
    type: "text",
    direction: "inbound",
    status: "delivered",
    ack: null,
    error_code: null,
    error_message: null,
    body: "Oi, queria saber do prazo.",
    media_url: null,
    media_mime: null,
    media_size_bytes: null,
    media_storage_path: null,
    sent_via: "external_device",
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

const EMAIL = {
  email: {
    assunto: "Prazo do pedido 123",
    html: "<p>Oi, <strong>queria</strong> saber do prazo.</p>",
    anexos: [
      { nome: "pedido.pdf", tipo: "application/pdf", tamanho: 2048, caminho: "org1/c1/m1-0.pdf" },
      { nome: "foto.png", tipo: "image/png", tamanho: 1024, caminho: null },
    ],
    anexos_omitidos: [{ nome: "video.mp4", tipo: "video/mp4", tamanho: 99999999 }],
  },
};

const caps = capabilitiesOf("email");

describe("AC-008.5: e-mail recebido no balão", () => {
  it("mostra o assunto e o texto, sem botões que o e-mail não suporta", () => {
    render(<MessageBubble message={msg({ metadata: EMAIL })} capacidades={caps} />);

    expect(screen.getByTestId("email-assunto").textContent).toBe("Prazo do pedido 123");
    expect(screen.getByText("Oi, queria saber do prazo.")).toBeTruthy();
    expect(screen.queryByLabelText("Lida")).toBeNull();
    expect(screen.queryByLabelText("Entregue")).toBeNull();
  });

  it("o HTML limpo só aparece sob demanda e roda sem nenhuma permissão (iframe sandbox vazio)", () => {
    render(<MessageBubble message={msg({ metadata: EMAIL })} capacidades={caps} />);
    expect(screen.queryByTestId("email-html")).toBeNull();

    fireEvent.click(screen.getByRole("button", { name: "Ver com formatação" }));
    const quadro = screen.getByTestId("email-html") as HTMLIFrameElement;
    expect(quadro.tagName).toBe("IFRAME");
    expect(quadro.getAttribute("sandbox")).toBe("");
    expect(quadro.getAttribute("srcdoc")).toContain("<strong>queria</strong>");
    // Nem imagem nem nada de fora: a política do próprio documento só deixa o que já está nele.
    expect(quadro.getAttribute("srcdoc")).toContain("default-src 'none'");

    fireEvent.click(screen.getByRole("button", { name: "Ocultar formatação" }));
    expect(screen.queryByTestId("email-html")).toBeNull();
  });

  it("sem HTML não há botão de formatação", () => {
    render(<MessageBubble message={msg({ metadata: { email: { ...EMAIL.email, html: null } } })} capacidades={caps} />);
    expect(screen.queryByRole("button", { name: "Ver com formatação" })).toBeNull();
  });

  it("anexo guardado vira link de download da rota autenticada; o que não foi guardado vem sem link", () => {
    render(<MessageBubble message={msg({ metadata: EMAIL })} capacidades={caps} />);

    const link = screen.getByRole("link", { name: /pedido\.pdf/ });
    expect(link.getAttribute("href")).toBe("/api/v1/messages/m1/media?anexo=0");
    expect(link.getAttribute("download")).not.toBeNull();
    expect(screen.queryByRole("link", { name: /foto\.png/ })).toBeNull();
    expect(screen.getByText(/foto\.png/)).toBeTruthy();
    expect(screen.getByText(/1 anexo.*grande demais/)).toBeTruthy();
  });

  it("e-mail com anexo NÃO desenha também o cartão de mídia padrão (não duplica)", () => {
    render(
      <MessageBubble
        message={msg({ metadata: EMAIL, media_storage_path: "org1/c1/m1-0.pdf", media_mime: "application/pdf" })}
        capacidades={caps}
      />,
    );
    expect(screen.getAllByRole("link", { name: /pedido\.pdf/ })).toHaveLength(1);
  });
});

describe("AC-008.5: resposta enviada por e-mail", () => {
  it("canal sem recibo de leitura só mostra Enviada, mesmo que o status venha 'read'", () => {
    render(<MessageBubble message={msg({ direction: "outbound", status: "read", sent_via: "user" })} capacidades={caps} />);
    expect(screen.getByLabelText("Enviada")).toBeTruthy();
    expect(screen.queryByLabelText("Lida")).toBeNull();
  });

  it("WhatsApp segue igual: 'read' continua sendo Lida", () => {
    render(
      <MessageBubble
        message={msg({ direction: "outbound", status: "read", sent_via: "user" })}
        capacidades={capabilitiesOf(DEFAULT_CHANNEL_PROVIDER)}
      />,
    );
    expect(screen.getByLabelText("Lida")).toBeTruthy();
  });

  it("adiada pelo limite do dia: o balão diz por quê e quando sai", () => {
    render(
      <MessageBubble
        message={msg({
          direction: "outbound",
          status: "queued",
          sent_via: "user",
          metadata: { queued_reason: "teto_diario", adiar_ate: "2026-10-28T03:00:00.000Z" },
        })}
        capacidades={caps}
        fuso="America/Sao_Paulo"
      />,
    );
    const aviso = screen.getByTestId("aviso-de-adiamento");
    expect(aviso.textContent).toContain("Limite do dia");
    expect(aviso.textContent).toContain("00:00");
  });

  it("adiada pelo intervalo mínimo: avisa que está aguardando", () => {
    render(
      <MessageBubble
        message={msg({
          direction: "outbound",
          status: "queued",
          sent_via: "user",
          metadata: { queued_reason: "intervalo", adiar_ate: "2026-10-27T15:06:30.000Z" },
        })}
        capacidades={caps}
        fuso="UTC"
      />,
    );
    expect(screen.getByTestId("aviso-de-adiamento").textContent).toContain("intervalo");
    expect(screen.getByTestId("aviso-de-adiamento").textContent).toContain("15:06");
  });

  it("mensagem em fila por outro motivo não ganha aviso", () => {
    render(
      <MessageBubble
        message={msg({ direction: "outbound", status: "queued", sent_via: "user", metadata: { queued_reason: "channel_session_not_working" } })}
        capacidades={caps}
      />,
    );
    expect(screen.queryByTestId("aviso-de-adiamento")).toBeNull();
  });

  it("falhou: 'Tentar de novo' aparece quando o canal permite e dispara o reenvio", () => {
    const reenviar = vi.fn();
    render(
      <MessageBubble
        message={msg({ direction: "outbound", status: "failed", sent_via: "user", error_message: "Senha recusada" })}
        capacidades={caps}
        onTentarDeNovo={reenviar}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: "Tentar de novo" }));
    expect(reenviar).toHaveBeenCalledTimes(1);
  });

  it("falhou num canal que não reenvia (ou sem a ação): sem botão", () => {
    const reenviar = vi.fn();
    render(
      <MessageBubble
        message={msg({ direction: "outbound", status: "failed", sent_via: "user" })}
        capacidades={capabilitiesOf(DEFAULT_CHANNEL_PROVIDER)}
        onTentarDeNovo={reenviar}
      />,
    );
    expect(screen.queryByRole("button", { name: "Tentar de novo" })).toBeNull();
  });
});
