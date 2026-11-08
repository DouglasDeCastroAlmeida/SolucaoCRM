import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { ConversationHeader } from "./ConversationHeader";
import { Voltar } from "@/lib/ui/icons";
import type { ConversationWithContact } from "@/hooks/inbox/useConversationsRealtime";

/**
 * CABEÇALHO DE MENSAGEIRO (#117, spec #112, protótipo aprovado em app/design/inbox).
 *
 * A barra tem 60 px de altura FIXA, sem quebra de linha: avatar, nome, UMA linha de
 * subtítulo e três ícones (buscar, ver contato, mais ações). Toda ação de atendimento
 * mora no menu "Mais ações", com a MESMA lógica de estado e disparando o MESMO efeito.
 */

const m = vi.hoisted(() => ({
  claim: vi.fn(),
  release: vi.fn(),
  close: vi.fn(),
  reopen: vi.fn(),
  arquivar: vi.fn(),
  retomar: vi.fn(),
  pausar: vi.fn(),
  marcar: vi.fn(),
  desmarcar: vi.fn(),
  automaticoDaOrg: true as boolean | undefined,
}));

vi.mock("@/hooks/auth/AuthProvider", () => ({
  useAuth: () => ({ user: { id: "u1", support: null, is_platform_admin: true } }),
}));
vi.mock("@/hooks/inbox/useClaimConversation", () => ({
  useClaimConversation: () => ({ mutate: m.claim, isPending: false }),
}));
vi.mock("@/hooks/inbox/useReleaseConversation", () => ({
  useReleaseConversation: () => ({ mutate: m.release, isPending: false }),
}));
vi.mock("@/hooks/inbox/useCloseConversation", () => ({
  useCloseConversation: () => ({ mutate: m.close, isPending: false }),
  useReopenConversation: () => ({ mutate: m.reopen, isPending: false }),
  useArchiveConversation: () => ({ mutate: m.arquivar, isPending: false }),
}));
vi.mock("@/hooks/inbox/useResumeAiAttendance", () => ({
  useResumeAiAttendance: () => ({ mutate: m.retomar, isPending: false }),
}));
vi.mock("@/hooks/inbox/usePauseAiAttendance", () => ({
  usePauseAiAttendance: () => ({ mutate: m.pausar, isPending: false }),
}));
vi.mock("@/hooks/contacts/usePersonalContact", () => ({
  useMarkPersonalContact: () => ({ mutate: m.marcar, isPending: false }),
  useUnmarkPersonalContact: () => ({ mutate: m.desmarcar, isPending: false }),
}));
vi.mock("@/hooks/ai/useAutomaticoAtivo", () => ({
  useAutomaticoAtivo: () => ({ data: m.automaticoDaOrg }),
}));
vi.mock("@/components/inbox/FaixaDaCarteira", () => ({ FaixaDaCarteira: () => null }));
vi.mock("@/components/inbox/ReassignDialog", () => ({
  ReassignDialog: ({ open }: { open: boolean }) => (open ? <div role="dialog">transferir</div> : null),
}));
vi.mock("@/components/inbox/JanelaSelo", () => ({ JanelaSelo: () => null }));
vi.mock("@/components/inbox/ChannelLogo", () => ({ ChannelLogo: () => null }));
vi.mock("@/components/voice/DialButton", () => ({ DialButton: () => null }));
vi.mock("@/components/inbox/VideoCallButton", () => ({ VideoCallButton: () => null }));
vi.mock("@/components/agenda/ReservarServicoNaConversa", () => ({
  ReservarServicoNaConversa: () => null,
}));
vi.mock("@/components/inbox/SnoozeButton", () => ({ SnoozeButton: () => null }));

function conversa(extra: Record<string, unknown> = {}, contato: Record<string, unknown> = {}) {
  return {
    id: "conv-1",
    organization_id: "org-1",
    contact_id: "contato-1",
    channel_session_id: "sess-1",
    status: "open",
    service_revision: 3,
    assigned_to_user_id: null,
    assigned_to_user_name: null,
    assignee_kind: null,
    bot_silenced_until: null,
    snooze_until: null,
    is_group: false,
    tags: [],
    contacts: {
      id: "contato-1",
      display_name: "Marina Souza",
      name: "Marina Souza",
      phone_number: "5511912345678",
      tags: [],
      is_blocked: false,
      is_personal: false,
      is_anonymized: false,
      force_human: false,
      ...contato,
    },
    channel_sessions: null,
    ...extra,
  } as unknown as ConversationWithContact;
}

async function abrirMenu() {
  const user = userEvent.setup();
  await user.click(screen.getByRole("button", { name: "Mais ações" }));
  return { user, menu: await screen.findByRole("menu") };
}

beforeEach(() => {
  for (const f of Object.values(m)) if (typeof f === "function" && "mockReset" in f) f.mockReset();
  m.automaticoDaOrg = true;
});

describe("cabeçalho — a barra", () => {
  it("tem altura fixa de 60 px e não quebra linha", () => {
    render(<ConversationHeader conversation={conversa()} onBuscar={() => {}} />);
    const barra = screen.getByTestId("cabecalho-da-conversa");
    const classes = barra.className.split(/\s+/);
    expect(classes).toContain("h-[60px]");
    expect(classes).not.toContain("flex-wrap");
    expect(classes).not.toContain("py-3");
  });

  it("mostra avatar, nome e UMA linha de subtítulo com o telefone", () => {
    render(<ConversationHeader conversation={conversa()} />);
    expect(screen.getByTestId("avatar-da-conversa").textContent).toBe("MS");
    expect(screen.getByRole("heading", { name: "Marina Souza" })).toBeTruthy();
    const subtitulo = screen.getByTestId("subtitulo-da-conversa");
    expect(subtitulo.className).toContain("truncate");
    expect(subtitulo.textContent).toContain("+55");
  });

  it("tem exatamente três ícones: buscar, ver contato e mais ações", () => {
    render(<ConversationHeader conversation={conversa()} onBuscar={() => {}} />);
    const barra = screen.getByTestId("cabecalho-da-conversa");
    const alvos = Array.from(barra.querySelectorAll<HTMLElement>("button, a[href]")).map(
      (el) => el.getAttribute("aria-label") ?? el.textContent?.trim(),
    );
    expect(alvos).toEqual(["Ver contato", "Buscar nesta conversa", "Mais ações"]);
  });

  it("celular (#118): a seta de voltar mora no cabeçalho, antes do avatar, com o glifo Voltar do mapa único", async () => {
    const aoVoltar = vi.fn();
    render(<ConversationHeader conversation={conversa()} aoVoltar={aoVoltar} />);
    const voltar = screen.getByRole("button", { name: "Voltar para as conversas" });
    expect(voltar.className).toContain("md:hidden");
    expect(voltar.compareDocumentPosition(screen.getByTestId("avatar-da-conversa"))).toBe(
      Node.DOCUMENT_POSITION_FOLLOWING,
    );
    const { container } = render(<Voltar />);
    expect(voltar.querySelector("svg path")?.getAttribute("d")).toBe(
      container.querySelector("path")?.getAttribute("d"),
    );
    await userEvent.click(voltar);
    expect(aoVoltar).toHaveBeenCalledTimes(1);
  });

  it("sem aoVoltar (computador) não há seta; a porta da ficha entra no grupo de ícones", () => {
    const { unmount } = render(<ConversationHeader conversation={conversa()} />);
    expect(screen.queryByRole("button", { name: "Voltar para as conversas" })).toBeNull();
    unmount();
    render(<ConversationHeader conversation={conversa()} acaoDaFicha={<button type="button">Abrir ficha</button>} />);
    expect(screen.getByRole("button", { name: "Abrir ficha" })).toBeTruthy();
  });

  it("é BRANCO (card), como o WhatsApp Web, com divisória fina entre o contato e a lupa", () => {
    render(<ConversationHeader conversation={conversa()} onBuscar={() => {}} />);
    const barra = screen.getByTestId("cabecalho-da-conversa");
    expect(barra.className).toContain("bg-card");
    expect(barra.className).not.toContain("bg-muted");
    const divisoria = screen.getByTestId("divisoria-do-cabecalho");
    expect(divisoria.className).toContain("w-px");
    const ordem = Array.from(barra.querySelectorAll("a, button, [data-testid=divisoria-do-cabecalho]"));
    const iContato = ordem.findIndex((e) => e.getAttribute("aria-label") === "Ver contato");
    const iDiv = ordem.indexOf(divisoria);
    const iBusca = ordem.findIndex((e) => e.getAttribute("aria-label") === "Buscar nesta conversa");
    expect(iContato).toBeLessThan(iDiv);
    expect(iDiv).toBeLessThan(iBusca);
  });

  it("nenhuma ação de atendimento fica solta na barra", () => {
    render(<ConversationHeader conversation={conversa()} />);
    for (const nome of ["Assumir", "Transferir", "Fechar", "Arquivar", "Marcar como pessoal"]) {
      expect(screen.queryByRole("button", { name: nome })).toBeNull();
    }
  });

  it("o estado automático pausado aparece no subtítulo", () => {
    render(
      <ConversationHeader
        conversation={conversa({
          assigned_to_user_id: "u2",
          assignee_kind: "user",
          bot_silenced_until: "infinity",
        })}
      />,
    );
    expect(screen.getByTestId("badge-atendimento-humano").textContent).toContain("pausado");
  });
});

describe("cabeçalho — as ações vivem em Mais ações, com o mesmo efeito", () => {
  it("conversa aberta e sem dono: Assumir chama a mesma rota", async () => {
    render(<ConversationHeader conversation={conversa()} />);
    const { user, menu } = await abrirMenu();
    await user.click(within(menu).getByRole("menuitem", { name: "Assumir" }));
    expect(m.claim).toHaveBeenCalledWith({ conversation_id: "conv-1", expected_assignee: null });
  });

  it("conversa minha: Liberar e Devolver ao automático chamam as rotas", async () => {
    render(
      <ConversationHeader
        conversation={conversa({
          assigned_to_user_id: "u1",
          assignee_kind: "user",
          bot_silenced_until: "infinity",
        })}
      />,
    );
    let { user, menu } = await abrirMenu();
    await user.click(within(menu).getByRole("menuitem", { name: "Liberar" }));
    expect(m.release).toHaveBeenCalledWith({ conversation_id: "conv-1" });

    ({ user, menu } = await abrirMenu());
    await user.click(within(menu).getByRole("menuitem", { name: "Devolver ao automático" }));
    expect(m.retomar).toHaveBeenCalledWith({ conversation_id: "conv-1" });
  });

  it("com dono e automático de pé: Pausar o automático chama a rota", async () => {
    render(
      <ConversationHeader
        conversation={conversa({ assigned_to_user_id: "u2", assignee_kind: "user" })}
      />,
    );
    const { user, menu } = await abrirMenu();
    await user.click(within(menu).getByRole("menuitem", { name: "Pausar o automático" }));
    expect(m.pausar).toHaveBeenCalledWith({ conversation_id: "conv-1" });
  });

  it("Transferir abre o diálogo de transferência", async () => {
    render(<ConversationHeader conversation={conversa()} />);
    const { user, menu } = await abrirMenu();
    await user.click(within(menu).getByRole("menuitem", { name: "Transferir" }));
    expect(await screen.findByRole("dialog")).toBeTruthy();
  });

  it("Fechar pede confirmação e só então encerra", async () => {
    render(<ConversationHeader conversation={conversa()} />);
    const { user, menu } = await abrirMenu();
    await user.click(within(menu).getByRole("menuitem", { name: "Fechar" }));
    const dialogo = await screen.findByRole("alertdialog");
    expect(m.close).not.toHaveBeenCalled();
    await user.click(within(dialogo).getByRole("button", { name: "Fechar" }));
    await waitFor(() =>
      expect(m.close).toHaveBeenCalledWith({ conversation_id: "conv-1", expected_revision: 3 }),
    );
  });

  it("conversa encerrada troca Fechar por Reabrir", async () => {
    render(<ConversationHeader conversation={conversa({ status: "closed" })} />);
    const { user, menu } = await abrirMenu();
    expect(within(menu).queryByRole("menuitem", { name: "Fechar" })).toBeNull();
    await user.click(within(menu).getByRole("menuitem", { name: "Reabrir" }));
    expect(m.reopen).toHaveBeenCalledWith({ conversation_id: "conv-1", expected_revision: 3 });
  });

  it("Arquivar pede confirmação; arquivada não oferece arquivar", async () => {
    const { unmount } = render(<ConversationHeader conversation={conversa()} />);
    const { user, menu } = await abrirMenu();
    await user.click(within(menu).getByRole("menuitem", { name: "Arquivar" }));
    const dialogo = await screen.findByRole("alertdialog");
    await user.click(within(dialogo).getByRole("button", { name: "Arquivar" }));
    await waitFor(() => expect(m.arquivar).toHaveBeenCalledTimes(1));
    unmount();

    render(<ConversationHeader conversation={conversa({ status: "archived" })} />);
    const { menu: menu2 } = await abrirMenu();
    expect(within(menu2).queryByRole("menuitem", { name: "Arquivar" })).toBeNull();
  });

  it("Marcar como pessoal pede confirmação; Desmarcar é direto", async () => {
    const { unmount } = render(<ConversationHeader conversation={conversa()} />);
    const { user, menu } = await abrirMenu();
    await user.click(within(menu).getByRole("menuitem", { name: "Marcar como pessoal" }));
    const dialogo = await screen.findByRole("alertdialog");
    expect(m.marcar).not.toHaveBeenCalled();
    await user.click(within(dialogo).getByRole("button", { name: "Marcar como pessoal" }));
    await waitFor(() => expect(m.marcar).toHaveBeenCalledTimes(1));
    unmount();

    render(<ConversationHeader conversation={conversa({}, { is_personal: true })} />);
    const aberto = await abrirMenu();
    await aberto.user.click(within(aberto.menu).getByRole("menuitem", { name: "Desmarcar pessoal" }));
    expect(m.desmarcar).toHaveBeenCalledTimes(1);
  });
});

describe("cabeçalho — estado sempre à vista e abrir o painel do contato (rodada 2)", () => {
  it("'Aberta' aparece no subtítulo mesmo sem motivo de silêncio e com o telefone", () => {
    render(<ConversationHeader conversation={conversa()} />);
    expect(screen.getByTestId("estado-da-conversa").textContent).toContain("Aberta");
  });

  it("'Aberta' aparece também quando há motivo de silêncio (selo do motivo vem junto)", () => {
    render(
      <ConversationHeader
        conversation={conversa({
          assigned_to_user_id: "u2",
          assignee_kind: "user",
          bot_silenced_until: "infinity",
        })}
      />,
    );
    expect(screen.getByTestId("estado-da-conversa").textContent).toContain("Aberta");
    expect(screen.getByTestId("badge-atendimento-humano").textContent).toContain("pausado");
  });

  it("conversa encerrada mostra o estado encerrado (não 'Aberta')", () => {
    render(<ConversationHeader conversation={conversa({ status: "closed" })} />);
    expect(screen.getByTestId("estado-da-conversa").textContent).toContain("Fechada");
  });

  it("no celular o logo do canal some antes de o nome ser cortado", () => {
    render(<ConversationHeader conversation={conversa()} />);
    expect(screen.getByTestId("logo-do-canal").className).toContain("max-md:hidden");
    expect(screen.getByRole("heading", { name: "Marina Souza" }).className).not.toContain("max-md:hidden");
  });

  it("com aoAbrirContato, o ícone Ver contato abre o painel (botão, sem navegar) e reflete o estado", async () => {
    const abrir = vi.fn();
    const { rerender } = render(<ConversationHeader conversation={conversa()} aoAbrirContato={abrir} contatoAberto />);
    const icone = screen.getByRole("button", { name: "Ver contato" });
    expect(icone.closest("a")).toBeNull();
    expect(icone).toHaveAttribute("aria-pressed", "true");
    await userEvent.click(icone);
    expect(abrir).toHaveBeenCalledTimes(1);
    rerender(<ConversationHeader conversation={conversa()} aoAbrirContato={abrir} contatoAberto={false} />);
    expect(screen.getByRole("button", { name: "Ver contato" })).toHaveAttribute("aria-pressed", "false");
  });

  it("o nome do contato também abre o painel", async () => {
    const abrir = vi.fn();
    render(<ConversationHeader conversation={conversa()} aoAbrirContato={abrir} />);
    await userEvent.click(screen.getByRole("button", { name: "Marina Souza" }));
    expect(abrir).toHaveBeenCalledTimes(1);
  });

  it("sem aoAbrirContato o ícone continua sendo o link para a ficha completa", () => {
    render(<ConversationHeader conversation={conversa()} />);
    expect(screen.getByRole("link", { name: "Ver contato" })).toHaveAttribute("href", "/app/contacts/contato-1");
  });
});
