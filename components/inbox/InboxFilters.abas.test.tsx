/**
 * AC-001.7: as abas da lista, com contagem, e cada uma listando só o que o
 * nome diz.
 *
 * Decisão de nome: a aba "Fila" mantém o rótulo (é contrato — posição "Nº na
 * fila", ordem por espera) e carrega "Não atribuídas" como dica; "Automático"
 * carrega "IA". O nome acessível das abas não muda.
 */
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";

import { InboxFilters, type InboxFiltersValue } from "@/components/inbox/InboxFilters";
import { tabToFilter } from "@/components/inbox/InboxLayout";

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

const VALUE: InboxFiltersValue = { tab: "mine", search: "", onlyUnread: false };

afterEach(cleanup);

describe("abas da lista de conversas", () => {
  it("AC-001.7: Minhas, Fila (Não atribuídas) e Automático (IA) aparecem com a contagem", () => {
    render(<InboxFilters value={VALUE} onChange={() => {}} />);
    expect(screen.getByRole("tab", { name: /^Minhas/ })).toHaveTextContent("Minhas8");
    expect(screen.getByRole("tab", { name: /^Fila/ })).toHaveTextContent("Fila47");
    expect(screen.getByRole("tab", { name: /^Automático/ })).toHaveTextContent("Automático12");
  });

  it("AC-001.7: o nome da spec está na dica das abas, sem mudar o nome acessível", () => {
    render(<InboxFilters value={VALUE} onChange={() => {}} />);
    expect(screen.getByRole("tab", { name: /^Fila/ })).toHaveAttribute(
      "title",
      expect.stringContaining("Não atribuídas"),
    );
    expect(screen.getByRole("tab", { name: /^Automático/ })).toHaveAttribute(
      "title",
      expect.stringMatching(/^IA/),
    );
    expect(screen.getByRole("tab", { name: /^Minhas/ })).not.toHaveAttribute("title");
  });

  it("AC-001.7: escolher a aba troca o filtro para o valor interno dela", () => {
    const onChange = vi.fn();
    render(<InboxFilters value={VALUE} onChange={onChange} />);
    // Radix troca a aba no mouseDown.
    fireEvent.mouseDown(screen.getByRole("tab", { name: /^Fila/ }), { button: 0 });
    expect(onChange).toHaveBeenCalledWith(expect.objectContaining({ tab: "unassigned" }));
  });
});

describe("o que cada aba lista (AC-001.7)", () => {
  it("Minhas pede só as do atendente, ainda em andamento", () => {
    expect(tabToFilter("mine")).toEqual({ assigned_to: "me", exclude_finished: true });
  });

  it("Fila pede só quem espera atendente, e IA só o que o automático conduz", () => {
    expect(tabToFilter("unassigned", true)).toEqual({ comando: ["aguardando"] });
    expect(tabToFilter("ai")).toEqual({ comando: ["automatico"] });
  });
});
