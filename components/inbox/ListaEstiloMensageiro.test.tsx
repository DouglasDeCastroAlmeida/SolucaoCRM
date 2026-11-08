/**
 * Visual de mensageiro 6/17 (#88): a lista de conversas no padrão de um
 * mensageiro. Só apresentação: avatar redondo e maior, contador de não lidas em
 * pílula, conversa aberta destacada, filtros (abas) em pílula.
 */
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";

import { ConversationListItem } from "./ConversationListItem";
import { conversaDeExemplo } from "./__fixtures__/conversa";
import { InboxFilters, type InboxFiltersValue } from "@/components/inbox/InboxFilters";

vi.mock("@/hooks/auth/AuthProvider", () => ({
  useAuth: () => ({
    activeOrg: { orgId: "org-1", name: "Org", role: "manager", visibility_mode: "all" },
  }),
}));
vi.mock("@/hooks/channels/useChannelSessions", () => ({
  channelLabel: (c: { display_name: string }) => c.display_name,
  useChannelSessions: () => ({ data: [] }),
}));
vi.mock("@/hooks/inbox/useConversationTags", () => ({
  useConversationTagVocabulary: () => ({ data: [] }),
}));
vi.mock("@/hooks/contacts/useContactTagVocabulary", () => ({
  useContactTagVocabulary: () => ({ data: [] }),
}));
vi.mock("@/hooks/inbox/useConversationCounts", () => ({
  useConversationCounts: () => ({
    data: { fila: 47, automatico: 12, mine: 8, all: 130, closed: 25, archived: 9 },
  }),
}));

afterEach(cleanup);

function linha(parcial: Partial<typeof conversaDeExemplo.conversation> = {}, isSelected = false) {
  return (
    <ConversationListItem
      conversation={{ ...conversaDeExemplo.conversation, ...parcial }}
      {...conversaDeExemplo.props}
      isSelected={isSelected}
    />
  );
}

describe("lista de conversas no padrão de mensageiro (#88)", () => {
  it("o avatar é redondo e de 48px", () => {
    render(linha());
    const avatar = screen.getByText("MA").parentElement!;
    expect(avatar.className).toContain("h-12");
    expect(avatar.className).toContain("w-12");
    expect(avatar.className).toContain("rounded-full");
  });

  it("o contador de não lidas é uma pílula redonda com a cor da marca", () => {
    render(linha({ unread_count_for_assignee: 4 }));
    const contador = screen.getByText("4");
    expect(contador.className).toContain("rounded-full");
    expect(contador.className).toContain("h-5");
    expect(contador.className).toContain("min-w-5");
    expect(contador.className).toContain("bg-accent");
    expect(contador.className).toContain("text-accent-foreground");
  });

  it("a conversa aberta é destacada na linha inteira, sem listra lateral", () => {
    render(linha({}, true));
    const botao = document.querySelector("button[data-conversation-id]")!;
    expect(botao.className).toContain("bg-accent-soft");
    expect(botao.querySelector("span.w-0\\.5")).toBeNull();
  });

  it("o nome tem corpo de 15px", () => {
    render(linha());
    expect(screen.getByText("Maria").className).toContain("text-[15px]");
  });

  it("as abas são pílulas: a ativa preenchida com a marca, as outras neutras", () => {
    const value: InboxFiltersValue = { tab: "mine", search: "", onlyUnread: false };
    render(<InboxFilters value={value} onChange={() => {}} />);
    const ativa = screen.getByRole("tab", { name: /^Minhas/ });
    const outra = screen.getByRole("tab", { name: /^Fila/ });
    for (const aba of [ativa, outra]) {
      expect(aba.className).toContain("rounded-full");
      expect(aba.className).not.toContain("border-b-2");
    }
    expect(ativa.className).toContain("data-[state=active]:bg-accent");
    expect(ativa.className).toContain("data-[state=active]:text-accent-foreground");
  });
});
