import { describe, expect, it, vi } from "vitest";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

import { ConversationHeader } from "@/components/inbox/ConversationHeader";

/**
 * CATRACA: o header do inbox não pode voltar a travar a largura da tela.
 *
 * ## O defeito, medido
 *
 * A barra de ações deste header era `shrink-0`. Como ela não encolhia nem
 * quebrava, o `min-content` do header inteiro era **707px** — e a coluna do
 * meio do inbox é `1fr`, que é `minmax(auto, 1fr)` e não encolhe abaixo do
 * conteúdo. Resultado: o painel de CRM ficava **311px fora da viewport em
 * 1280px**. Em uma resolução de trabalho comum, o atendente não via contexto
 * nenhum do cliente.
 *
 * ## Por que este teste é o que é (e o que ele NÃO é)
 *
 * Este teste olha CLASSE, não pixel — e isso é uma limitação declarada, não um
 * descuido: `min-content`, quebra de flex e resolução de grid são cálculo de
 * layout, e o jsdom não tem engine de layout. Medir largura aqui devolveria
 * zero em tudo e passaria feliz: verde por ausência de motor.
 *
 * A medição de verdade é `tests/sonda-inbox-cabe-na-tela.ts`, que roda num
 * browser e afere as 5 larguras. Esta catraca existe porque aquela sonda não
 * roda no CI, e a regressão específica — alguém devolver `shrink-0` à barra de
 * ações "para os botões não quebrarem" — é textual e barata de pegar.
 *
 * Se um dia o CI ganhar um passo de browser, este arquivo pode morrer em favor
 * da sonda. Enquanto isso, ele é a única coisa entre a regressão e a main.
 */

vi.mock("@/hooks/inbox/useClaimConversation", () => ({
  useClaimConversation: () => ({ mutate: vi.fn(), isPending: false }),
}));
vi.mock("@/hooks/inbox/useCloseConversation", () => ({
  useCloseConversation: () => ({ mutate: vi.fn(), isPending: false }),
  useReopenConversation: () => ({ mutate: vi.fn(), isPending: false }),
  // O header passou a importar `useArchiveConversation` do MESMO módulo (issue
  // #923). Um dublê fechado que não acompanha a nova exportação não falha com
  // "faltou mock": falha com "useArchiveConversation is not a function", que
  // não fala nada do que este arquivo vigia.
  useArchiveConversation: () => ({ mutate: vi.fn(), isPending: false }),
}));
vi.mock("@/hooks/inbox/useReleaseConversation", () => ({
  useReleaseConversation: () => ({ mutate: vi.fn(), isPending: false }),
}));
// O nome do módulo importa: a primeira versão deste arquivo mockava
// "useResumeAi", que NÃO EXISTE — o real é `useResumeAiAttendance`. O teste
// passou assim mesmo (o hook verdadeiro rodou sob o provider), ou seja, o mock
// não mockava nada e ninguém era avisado. Mock de caminho inexistente é ruído
// que parece cobertura.
vi.mock("@/hooks/inbox/useResumeAiAttendance", () => ({
  useResumeAiAttendance: () => ({ mutate: vi.fn(), isPending: false }),
}));
// O header monta o discador (`DialButton`), que exige o `VoiceCallProvider` do
// shell autenticado. Aqui só a largura importa: o discador fica fora da conta.
vi.mock("@/components/voice/DialButton", () => ({ DialButton: () => null }));
vi.mock("@/hooks/auth/AuthProvider", () => ({
  usePermission: () => true,
  useAuth: () => ({ user: { id: "u-1" }, activeOrg: { orgId: "org-1", role: "manager" } }),
}));

const conversation = {
  id: "cv-1",
  organization_id: "org-1",
  contact_id: "ct-1",
  status: "open",
  assigned_to_user_id: null,
  assignee_kind: "ai",
  snooze_until: null,
  tags: [],
  contacts: { id: "ct-1", display_name: "Fulana", name: null, phone_number: "5511999" },
} as unknown as React.ComponentProps<typeof ConversationHeader>["conversation"];

function renderHeader(conv = conversation) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <ConversationHeader conversation={conv} />
    </QueryClientProvider>,
  );
}

// #117: a barra virou uma fileira de 60 px com três ícones; as ações de atendimento moram no menu
// "Mais ações". O que a catraca protege continua igual: o header não pode voltar a pedir largura.
function barra() {
  return screen.getByTestId("cabecalho-da-conversa");
}

describe("header do inbox — não trava a largura da tela", () => {
  it("a identidade encolhe (min-w-0 + truncate) e só os três ícones são shrink-0", () => {
    renderHeader();
    const nome = screen.getByRole("heading", { name: "Fulana" });
    expect(nome.className).toContain("truncate");
    expect(nome.parentElement?.parentElement?.className).toContain("min-w-0");
    expect(nome.parentElement?.parentElement?.className).toContain("flex-1");
    const subtitulo = screen.getByTestId("subtitulo-da-conversa");
    expect(subtitulo.className).toContain("truncate");
    expect(subtitulo.className).toContain("min-w-0");
  });

  it("a barra tem altura fixa e NÃO quebra linha: o que não cabe é cortado", () => {
    renderHeader();
    const classes = barra().className.split(/\s+/);
    expect(classes).toContain("h-[60px]");
    expect(classes).not.toContain("flex-wrap");
  });

  it("as ações continuam TODAS no header — dentro do menu Mais ações", async () => {
    renderHeader();
    await userEvent.setup().click(screen.getByRole("button", { name: "Mais ações" }));
    const menu = await screen.findByRole("menu");
    for (const rotulo of ["Assumir", "Transferir", "Fechar"]) {
      expect(within(menu).getByRole("menuitem", { name: rotulo }), `a ação "${rotulo}" sumiu`).toBeTruthy();
    }
  });

  it("com o selo do automático, nenhuma ação some e o selo mora na linha do subtítulo, não numa segunda linha (#1625)", async () => {
    renderHeader({
      ...conversation,
      assigned_to_user_id: "u-1",
      assigned_to_user_name: "Eu",
      assignee_kind: "user",
      bot_silenced_until: new Date(Date.now() + 10 * 60_000).toISOString(),
    } as typeof conversation);

    const selo = screen.getByTestId("badge-atendimento-humano");
    expect(selo.textContent).toContain("Automático volta em instantes");
    expect(screen.getByTestId("subtitulo-da-conversa").contains(selo)).toBe(true);

    await userEvent.setup().click(screen.getByRole("button", { name: "Mais ações" }));
    const menu = await screen.findByRole("menu");
    for (const rotulo of ["Liberar", "Devolver ao automático", "Transferir", "Lembrar", "Fechar", "Arquivar"]) {
      expect(within(menu).getByRole("menuitem", { name: rotulo }), `a ação "${rotulo}" saiu do menu`).toBeTruthy();
    }
  });

  it('"Ver contato" é um ícone da barra, sempre presente (a ficha é a única porta em 1024 px)', () => {
    renderHeader();
    const link = screen.getByRole("link", { name: "Ver contato" });
    expect(barra().contains(link)).toBe(true);
    expect(link.getAttribute("href")).toBe("/app/contacts/ct-1");
  });
});
