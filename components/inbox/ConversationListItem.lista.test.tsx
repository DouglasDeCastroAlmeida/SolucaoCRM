/**
 * A linha da lista no estilo de mensageiro: foto ou iniciais, nome, prévia,
 * horário curto no fuso da organização, contador de não lidas e ícone do canal.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, within } from "@testing-library/react";

import { ConversationListItem } from "./ConversationListItem";
import { conversaDeExemplo } from "./__fixtures__/conversa";

beforeEach(() => {
  // Quarta-feira, 14:00 em São Paulo.
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date("2026-10-28T17:00:00.000Z"));
});
afterEach(() => {
  vi.useRealTimers();
  cleanup();
});

function linha(parcial: Partial<typeof conversaDeExemplo.conversation>, fuso = "America/Sao_Paulo") {
  return (
    <ConversationListItem
      conversation={{ ...conversaDeExemplo.conversation, ...parcial }}
      {...conversaDeExemplo.props}
      fuso={fuso}
    />
  );
}

describe("ConversationListItem — estilo de mensageiro", () => {
  it("AC-001.1: sem foto mostra iniciais, nome, prévia e horário curto", () => {
    render(
      linha({ last_message_at: "2026-10-28T12:05:00.000Z", last_message_preview: "bom dia" }),
    );
    expect(screen.getByText("MA")).toBeInTheDocument();
    expect(screen.getByText("Maria")).toBeInTheDocument();
    expect(screen.getByText("bom dia")).toBeInTheDocument();
    expect(screen.getByText("09:05")).toBeInTheDocument();
  });

  it("AC-001.5: mensagem de ontem mostra Ontem, no fuso da organização", () => {
    render(linha({ last_message_at: "2026-10-28T01:30:00.000Z" }));
    expect(screen.getByText("Ontem")).toBeInTheDocument();
  });

  it("AC-001.2: mensagem enviada por nós começa com Você:", () => {
    const m = "2026-10-28T12:05:00.000Z";
    render(linha({ last_message_at: m, last_outbound_at: m, last_message_preview: "pode sim" }));
    const previa = screen.getByText("pode sim").closest("p")!;
    expect(previa).toHaveTextContent("Você:");
    expect(previa).toHaveTextContent("pode sim");
  });

  it("AC-001.2: mensagem do cliente não leva Você:", () => {
    render(linha({ last_message_preview: "oi" }));
    expect(screen.queryByText("Você:")).toBeNull();
  });

  it("AC-001.3: mídia mostra ícone e rótulo, nunca o endereço do arquivo", () => {
    render(linha({ last_message_preview: "https://exemplo.test/storage/foto.jpg?token=x" }));
    const previa = screen.getByText("Imagem").closest("p")!;
    expect(previa.querySelector("svg")).not.toBeNull();
    expect(previa).not.toHaveTextContent("exemplo.test");
  });

  it("AC-001.4: o contador de não lidas aparece e some quando a conversa é lida", () => {
    const { rerender } = render(linha({ unread_count_for_assignee: 3 }));
    expect(screen.getByText("3")).toBeInTheDocument();
    rerender(linha({ unread_count_for_assignee: 0 }));
    expect(screen.queryByText("3")).toBeNull();
  });

  it("AC-001.4: com não lidas o nome fica em destaque", () => {
    render(linha({ unread_count_for_assignee: 2 }));
    expect(screen.getByText("Maria").className).toContain("font-semibold");
  });

  it("AC-001.6/AC-006.3: canal desconhecido usa o ícone genérico e não quebra", () => {
    render(linha({}));
    const linhaDaLista = screen.getByRole("button", { name: /Maria/ });
    expect(within(linhaDaLista).getByRole("img", { name: "Canal" })).toBeInTheDocument();
  });

  it("AC-001.6/AC-006.3: sem canal associado também não quebra", () => {
    render(linha({ channel_sessions: null }));
    expect(screen.getByText("Maria")).toBeInTheDocument();
  });
});
