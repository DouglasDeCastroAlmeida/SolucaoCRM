/**
 * CATRACA — as abas da Inbox continuam TODAS alcançáveis na faixa de chips (#2745, reescrita na #116).
 *
 * ## O defeito original, e o que mudou
 *
 * Em 2745 as seis abas eram cortadas na coluna (`overflow-x-auto` + `shrink-0`
 * rolava 191px em 272px) e a correção foi QUEBRAR a faixa em linhas
 * (`flex-wrap`). O protótipo aprovado na rodada 2 (#116) pede o contrário, de
 * propósito: UMA linha de chips rolável na horizontal, como no mensageiro. Então
 * o que esta catraca vigia agora é o outro lado do mesmo risco: a rolagem não pode
 * esconder aba SEM porta — todas as seis estão na faixa, com o rótulo inteiro, o
 * chip ativo é levado para a vista (centralizado ao trocar de aba) e a faixa não
 * volta a quebrar em linhas.
 *
 * Esta catraca olha CLASSE, não pixel (o jsdom não calcula layout). A medida em
 * navegador está nas capturas da tarefa #116.
 */
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";

import {
  InboxFilters,
  visibleInboxTabs,
  type InboxFiltersValue,
} from "@/components/inbox/InboxFilters";

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
// Contagens de 2 dígitos, como numa instalação viva: elas ALARGAM a aba, e é
// com elas que o corte foi medido.
vi.mock("@/hooks/inbox/useConversationCounts", () => ({
  useConversationCounts: () => ({
    data: { fila: 47, automatico: 12, mine: 8, all: 130, closed: 25, archived: 9 },
  }),
}));

const VALUE: InboxFiltersValue = { tab: "ai", search: "", onlyUnread: false };

afterEach(cleanup);


afterEach(cleanup);

function faixa(): HTMLElement {
  const list = screen.getByTestId("chips-da-lista");
  expect(list, "a faixa de chips não renderizou").toBeTruthy();
  return list;
}

describe("faixa de chips da Inbox — uma linha rolável (#116)", () => {
  it("rola na horizontal e NÃO quebra em linhas", () => {
    render(<InboxFilters value={VALUE} onChange={() => {}} />);
    const classes = faixa().className.split(/\s+/);
    expect(classes).toContain("overflow-x-auto");
    expect(classes).toContain("flex-nowrap");
    expect(classes).not.toContain("flex-wrap");
  });

  it("a faixa é o próprio tablist e as SEIS abas estão nela, com os rótulos inteiros", () => {
    render(<InboxFilters value={VALUE} onChange={() => {}} />);
    expect(faixa()).toHaveAttribute("role", "tablist");
    const abas = screen.getAllByRole("tab");
    expect(abas).toHaveLength(6);
    for (const rotulo of ["Automático", "Fila", "Minhas", "Todas", "Fechadas", "Arquivadas"]) {
      expect(
        screen.getByRole("tab", { name: new RegExp(rotulo) }),
        `a aba "${rotulo}" não está na faixa`,
      ).toBeInTheDocument();
    }
  });

  it("cada chip não encolhe nem parte o rótulo", () => {
    render(<InboxFilters value={VALUE} onChange={() => {}} />);
    for (const aba of screen.getAllByRole("tab")) {
      const classes = aba.className.split(/\s+/);
      expect(classes).toContain("shrink-0");
      expect(classes).toContain("whitespace-nowrap");
    }
  });

  it("clicar em Arquivadas manda tab=archived (o contrato do filtro não mudou)", () => {
    const onChange = vi.fn();
    render(<InboxFilters value={VALUE} onChange={onChange} />);
    // O Radix `TabsTrigger` aciona no `mousedown`, não no `click`.
    fireEvent.mouseDown(screen.getByRole("tab", { name: /Arquivadas/ }));
    expect(onChange).toHaveBeenCalledWith({ ...VALUE, tab: "archived" });
  });

  it("a ordem e os valores das abas seguem o protótipo aprovado", () => {
    render(<InboxFilters value={VALUE} onChange={() => {}} />);
    expect(visibleInboxTabs("manager", "all")).toEqual([
      "all",
      "mine",
      "unassigned",
      "ai",
      "closed",
      "archived",
    ]);
    expect(screen.getAllByRole("tab").map((a) => a.textContent?.replace(/\s+/g, ""))).toEqual([
      "Todas130",
      "Minhas8",
      "Fila47",
      "Automático12",
      "Fechadas25",
      "Arquivadas9",
    ]);
  });
});
