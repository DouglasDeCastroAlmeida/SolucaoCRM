/**
 * Visual de mensageiro, rodada 2 (#116): a lista de conversas segue o protótipo
 * aprovado (`app/design/inbox/PrototipoDoInbox.tsx`). Só apresentação: busca em
 * pílula sozinha na linha, UMA linha de chips rolável, filtros de tag e atendente
 * num menu, linha com avatar/nome/prévia/hora/contador, selos e caixa de seleção
 * só no hover, na conversa aberta ou em modo de seleção.
 *
 * O jsdom não calcula CSS: os testes leem as CLASSES que o Tailwind compila.
 * A medida em pixel está nas capturas da tarefa (Chromium, CSS compilado).
 */
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";

import { ConversationListItem } from "./ConversationListItem";
import { conversaDeExemplo } from "./__fixtures__/conversa";
import { BotaoIniciarConversa } from "./PainelIniciarConversa";
import { InboxFilters, type InboxFiltersValue } from "@/components/inbox/InboxFilters";

vi.mock("next/navigation", () => ({ useRouter: () => ({ push() {}, replace() {} }) }));
vi.mock("@tanstack/react-query", async (orig) => ({
  ...(await orig<typeof import("@tanstack/react-query")>()),
  useQueryClient: () => ({ invalidateQueries() {} }),
}));
vi.mock("@/hooks/contacts/useContactList", () => ({ useContactList: () => ({ data: [], isLoading: false }) }));
vi.mock("@/hooks/inbox/useMessageTemplates", () => ({ useMessageTemplates: () => ({ data: [] }) }));
vi.mock("@/hooks/auth/AuthProvider", () => ({
  usePermission: () => true,
  useAuth: () => ({
    activeOrg: { orgId: "org-1", name: "Org", role: "manager", visibility_mode: "all" },
  }),
}));
vi.mock("@/hooks/channels/useChannelSessions", () => ({
  channelLabel: (c: { display_name: string }) => c.display_name,
  useChannelSessions: () => ({ data: [] }),
}));
// Vocabulário ESTÁVEL entre renders: o filtro guarda o último vocabulário no estado.
const VOCABULARIO = ["vip", "novo"];
vi.mock("@/hooks/inbox/useConversationTags", () => ({
  useConversationTagVocabulary: () => ({ data: VOCABULARIO }),
}));
const SEM_TAGS_DE_CONTATO: string[] = [];
vi.mock("@/hooks/contacts/useContactTagVocabulary", () => ({
  useContactTagVocabulary: () => ({ data: SEM_TAGS_DE_CONTATO }),
}));
vi.mock("@/hooks/inbox/useConversationCounts", () => ({
  useConversationCounts: () => ({
    data: { fila: 47, automatico: 12, mine: 8, all: 130, closed: 25, archived: 9 },
  }),
}));

afterEach(cleanup);

function linha(
  parcial: Partial<typeof conversaDeExemplo.conversation> = {},
  isSelected = false,
  extras: Partial<React.ComponentProps<typeof ConversationListItem>> = {},
) {
  return (
    <ConversationListItem
      conversation={{ ...conversaDeExemplo.conversation, ...parcial }}
      {...conversaDeExemplo.props}
      isSelected={isSelected}
      {...extras}
    />
  );
}

const classes = (el: Element) => el.className.split(/\s+/);

describe("linha da lista no padrão de mensageiro (#116)", () => {
  it("o avatar é redondo e de 49px", () => {
    render(linha());
    const avatar = screen.getByText("MA").parentElement!;
    expect(classes(avatar)).toEqual(expect.arrayContaining(["h-[49px]", "w-[49px]", "rounded-full"]));
  });

  it("o botão da linha tem 16x12 px de respiro e a corpo de 17/14/12px", () => {
    render(linha({ last_message_preview: "oi, tudo bem?" }));
    const botao = document.querySelector("button[data-conversation-id]")!;
    expect(classes(botao)).toEqual(expect.arrayContaining(["px-4", "py-3"]));
    expect(classes(screen.getByText("Maria"))).toContain("text-[17px]");
    expect(screen.getByText(/oi, tudo bem/).className).toContain("text-[14px]");
  });

  it("com não lidas: hora em verde e contador em pílula verde", () => {
    render(linha({ unread_count_for_assignee: 4 }));
    const contador = screen.getByText("4");
    for (const c of ["rounded-full", "h-5", "min-w-5", "bg-accent", "text-accent-foreground"]) {
      expect(classes(contador)).toContain(c);
    }
    const hora = screen.getByTestId("hora-da-linha");
    expect(classes(hora)).toContain("text-accent");
  });

  it("sem não lidas a hora é neutra", () => {
    render(linha({ unread_count_for_assignee: 0 }));
    const hora = screen.getByTestId("hora-da-linha");
    expect(classes(hora)).not.toContain("text-accent");
    expect(classes(hora)).toContain("text-[12px]");
  });

  it("a conversa aberta é cinza neutro na linha inteira, sem listra e sem verde", () => {
    render(linha({}, true));
    const botao = document.querySelector("button[data-conversation-id]")!;
    expect(classes(botao)).toContain("bg-selected");
    expect(classes(botao)).not.toContain("bg-accent-soft");
    expect(botao.querySelector("span.w-0\\.5")).toBeNull();
  });

  it("os selos só aparecem no hover (ou na conversa aberta, ou em modo de seleção)", () => {
    const { unmount } = render(linha({ tags: [], contacts: { ...conversaDeExemplo.conversation.contacts!, tags: ["vip"] } }));
    const selos = screen.getByText("vip").closest("[data-testid='selos-da-linha']")!;
    expect(classes(selos)).toEqual(expect.arrayContaining(["hidden", "group-hover/linha:flex"]));
    unmount();

    render(
      linha({ contacts: { ...conversaDeExemplo.conversation.contacts!, tags: ["vip"] } }, true),
    );
    const abertos = screen.getByText("vip").closest("[data-testid='selos-da-linha']")!;
    expect(classes(abertos)).toContain("flex");
    expect(classes(abertos)).not.toContain("hidden");
  });

  it("a caixa de seleção em lote só aparece no hover, ou com o modo de seleção ligado", () => {
    const { unmount } = render(linha({}, false, { onAlternarSelecao: () => {} }));
    const caixa = screen.getByTestId("selecao-em-lote-conv-1");
    expect(classes(caixa)).toEqual(expect.arrayContaining(["hidden", "group-hover/linha:flex"]));
    unmount();

    render(linha({}, false, { onAlternarSelecao: () => {}, modoDeSelecao: true }));
    const ligada = screen.getByTestId("selecao-em-lote-conv-1");
    expect(classes(ligada)).not.toContain("hidden");
  });

  it("a caixa continua marcando sem abrir a conversa", () => {
    const onAlternar = vi.fn();
    const onSelect = vi.fn();
    render(linha({}, false, { onAlternarSelecao: onAlternar, onSelect }));
    fireEvent.click(screen.getByTestId("selecao-em-lote-conv-1"));
    expect(onAlternar).toHaveBeenCalledWith("conv-1");
    expect(onSelect).not.toHaveBeenCalled();
  });

  it("o botão de sugestão (exemplo para a IA) só aparece no hover quando não está marcado", () => {
    render(linha({ usable_for_rag: false }, false, { onAlternarExemplo: () => {} }));
    const botao = screen.getByTestId("exemplo-ia-conv-1");
    expect(classes(botao)).toEqual(expect.arrayContaining(["hidden", "group-hover/linha:flex"]));
  });
});

describe("filtros da lista no padrão de mensageiro (#116)", () => {
  const value: InboxFiltersValue = { tab: "mine", search: "", onlyUnread: false };

  it("a busca é uma pílula sozinha na linha, com a largura toda", () => {
    render(<InboxFilters value={value} onChange={() => {}} />);
    const campo = screen.getByRole("textbox", { name: /Buscar conversas/ });
    const linhaDaBusca = campo.closest("[data-testid='linha-da-busca']")!;
    expect(linhaDaBusca).toBeTruthy();
    expect(linhaDaBusca.querySelectorAll("button")).toHaveLength(0);
    expect(classes(campo)).toContain("rounded-full");
  });

  it("os chips são UMA linha rolável na horizontal, com todas as visões", () => {
    render(<InboxFilters value={value} onChange={() => {}} />);
    const faixa = screen.getByTestId("chips-da-lista");
    expect(classes(faixa)).toEqual(expect.arrayContaining(["flex-nowrap", "overflow-x-auto"]));
    expect(classes(faixa)).not.toContain("flex-wrap");
    const rotulos = Array.from(faixa.querySelectorAll("button")).map((b) =>
      b.textContent!.replace(/\d+/g, "").trim(),
    );
    expect(rotulos).toEqual([
      "Todas",
      "Não lidos",
      "Minhas",
      "Fila",
      "Automático",
      "Fechadas",
      "Arquivadas",
      "Grupos",
    ]);
  });

  it("o chip ativo usa tinta suave (verde claro com texto verde), os outros são neutros", () => {
    render(<InboxFilters value={value} onChange={() => {}} />);
    const ativo = screen.getByRole("tab", { name: /^Minhas/ });
    const outro = screen.getByRole("tab", { name: /^Fila/ });
    for (const chip of [ativo, outro]) {
      expect(classes(chip)).toContain("rounded-full");
      expect(classes(chip)).not.toContain("border-b-2");
    }
    expect(classes(ativo)).toEqual(
      expect.arrayContaining(["data-[state=active]:bg-accent-soft", "data-[state=active]:text-accent"]),
    );
    expect(ativo.className).not.toContain("data-[state=active]:bg-accent ");
    expect(classes(outro)).toEqual(expect.arrayContaining(["border", "border-border"]));
  });

  it("os toggles Não lidos e Grupos continuam combináveis com a aba", () => {
    const onChange = vi.fn();
    render(<InboxFilters value={value} onChange={onChange} />);
    fireEvent.click(screen.getByRole("button", { name: /^Não lidos/ }));
    expect(onChange).toHaveBeenLastCalledWith({ ...value, onlyUnread: true });
    fireEvent.click(screen.getByRole("button", { name: /^Grupos/ }));
    expect(onChange).toHaveBeenLastCalledWith({ ...value, onlyGroups: true });
  });

  it("tag e atendente moram num ícone de filtro que abre um menu", () => {
    render(<InboxFilters value={value} onChange={() => {}} />);
    expect(screen.queryByRole("button", { name: "Filtrar por tag" })).toBeNull();
    const gatilho = screen.getByRole("button", { name: "Filtro" });
    fireEvent.click(gatilho);
    expect(screen.getByRole("button", { name: "Filtrar por tag" })).toBeInTheDocument();
  });

  it("o ícone de filtro avisa quando há tag escolhida, mesmo com o menu fechado", () => {
    render(<InboxFilters value={{ ...value, tag: "vip" }} onChange={() => {}} />);
    expect(screen.getByTestId("filtro-ativo")).toBeInTheDocument();
  });
});

describe("cabeçalho da lista e linha selecionada (#116, print do WhatsApp Web)", () => {
  it("o título é verde e o 'Iniciar conversa' é um círculo verde com '+' (mesma função)", () => {
    render(<BotaoIniciarConversa />);
    expect(classes(screen.getByRole("heading", { name: "Conversas" }))).toContain("text-accent");
    const botao = screen.getByRole("button", { name: "Iniciar conversa" });
    expect(classes(botao)).toEqual(
      expect.arrayContaining(["rounded-full", "bg-accent", "text-icon-on-accent", "size-10"]),
    );
  });

  it("a linha aberta tem cantos arredondados e margem lateral, sem divisória", () => {
    render(linha({}, true));
    const raiz = document.querySelector("button[data-conversation-id]")!.parentElement!;
    expect(classes(raiz)).toEqual(expect.arrayContaining(["mx-2", "rounded-lg"]));
    expect(raiz.className).not.toContain("border-b");
    expect(raiz.className).not.toContain("after:");
  });
});
