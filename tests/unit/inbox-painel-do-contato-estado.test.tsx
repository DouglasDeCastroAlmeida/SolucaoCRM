import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * PAINEL DO CONTATO — o estado recolhido e o conteúdo (AC-005.1 a AC-005.3, SP4).
 *
 * Complementa `inbox-recolher-painel-do-contato.test.tsx` (clique, grade, cookie
 * do servidor) com o que ele não cobre: o estado SOBREVIVE à troca de conversa,
 * a preferência gravada no servidor é a que reabre a tela (recarregar = remontar
 * com `painelRecolhidoInicial`), e o painel aberto segue mostrando etapa do
 * funil, tags e compromissos.
 */

const get = vi.hoisted(() => vi.fn());
const togglePainelDoContato = vi.hoisted(() => vi.fn(async () => undefined));

vi.mock("@/app/actions/inbox/togglePainelDoContato", () => ({ togglePainelDoContato }));

const ORG = "00000000-0000-4000-8000-0000000005aa";

function fazConversa(n: number) {
  const contato = `c0000000-0000-4000-8000-00000000000${n}`;
  return {
    id: `cv-${n}`,
    organization_id: ORG,
    contact_id: contato,
    channel_session_id: "cs-1",
    status: "open",
    tags: [],
    assigned_to_user_id: null,
    bot_silenced_until: null,
    service_revision: 1,
    current_demanda_id: null,
    last_inbound_at: "2026-09-15T12:00:00Z",
    unread_count_for_assignee: 0,
    channel_sessions: { provider: "waha" },
    contacts: {
      id: contato,
      display_name: `Fulana ${n}`,
      name: null,
      phone_number: `551199${n}`,
      tags: [],
      is_anonymized: false,
    },
  };
}
const conversas = [fazConversa(1), fazConversa(2)];

const resumo = {
  data: {
    leads: [
      {
        id: "l-1",
        title: "Felipe",
        status: "open",
        value_cents: null,
        currency: null,
        updated_at: "2026-09-15T12:00:00Z",
        pipeline_id: "p-1",
        stage_id: "s-1",
        custom_fields: {},
        field_defs: [],
        funil_nome: "Origem",
        etapa_nome: "Novo",
        etapas_do_funil: [{ id: "s-1", name: "Novo", is_won: false, is_lost: false }],
      },
    ],
    orders: [],
    activities: [],
    demandas: [],
    fatos: [],
    historico: [],
  },
};

get.mockImplementation(async (url?: string) => {
  const bruto = url ?? "";
  if (bruto === "/api/v1/ai/automatico-ativo") return { data: { ativo: false } };
  if (bruto.includes("crm-summary")) return resumo;
  return { data: [] };
});

vi.mock("@/lib/api/client", () => ({
  apiClient: {
    get: (...args: unknown[]) => get(...args),
    post: vi.fn(),
    patch: vi.fn(),
  },
}));
vi.mock("@/hooks/inbox/useConversationsRealtime", () => ({
  useConversationsRealtime: () => ({
    data: { pages: [{ data: conversas }] },
    realtimeStatus: "ok",
    seguranca: { divergencias: 0 },
  }),
}));
vi.mock("@/components/feedback/ApiErrorToast", () => ({ showApiError: vi.fn() }));
vi.mock("@/lib/supabase/browser", () => ({
  prepareRealtimeAuthentication: vi.fn().mockResolvedValue(undefined),
  createClient: () => ({
    channel: () => ({ on: () => ({ subscribe: () => ({}) }), subscribe: () => ({}) }),
    removeChannel: () => {},
  }),
}));
vi.mock("next/navigation", () => ({
  usePathname: () => "/app/inbox",
  useRouter: () => ({ replace: vi.fn(), push: vi.fn() }),
  useSearchParams: () => new URLSearchParams(),
}));
vi.mock("@/hooks/auth/AuthProvider", () => ({
  useAuth: () => ({
    user: { id: "u-1", role: "admin", support: null, is_platform_admin: false },
    activeOrg: { orgId: ORG, name: "Org", role: "admin" },
  }),
  usePermission: () => true,
}));
vi.mock("@/hooks/inbox/useMarkAsRead", () => ({ useMarkAsRead: () => undefined }));
vi.mock("@/hooks/inbox/useClaimConversation", () => ({
  useClaimConversation: () => ({ mutate: vi.fn(), isPending: false }),
}));
vi.mock("@/hooks/inbox/useCloseConversation", () => ({
  useCloseConversation: () => ({ mutate: vi.fn(), isPending: false }),
}));
// A lista vira dois botões: é o jeito de trocar de conversa sem a lista real.
vi.mock("@/components/inbox/ConversationList", () => ({
  ConversationList: ({ onSelect }: { onSelect: (id: string | null) => void }) => (
    <div>
      <button type="button" onClick={() => onSelect("cv-1")}>
        ir-conversa-1
      </button>
      <button type="button" onClick={() => onSelect("cv-2")}>
        ir-conversa-2
      </button>
    </div>
  ),
}));
vi.mock("@/components/inbox/InboxFilters", () => ({ InboxFilters: () => null }));
vi.mock("@/components/inbox/ChatThread", () => ({ ChatThread: () => null }));
vi.mock("@/components/inbox/Composer", () => ({ Composer: () => null }));
vi.mock("@/components/inbox/ConversationHeader", () => ({ ConversationHeader: () => null }));
vi.mock("@/components/inbox/RetentionNotice", () => ({ RetentionNotice: () => null }));
vi.mock("@/components/inbox/InboxKeyboardShortcuts", () => ({ InboxKeyboardShortcuts: () => null }));
vi.mock("@/components/inbox/ShortcutsHelpDialog", () => ({ ShortcutsHelpDialog: () => null }));
vi.mock("@/components/inbox/JanelaFechadaAviso", () => ({ JanelaFechadaAviso: () => null }));
vi.mock("@/components/inbox/NumeroForaDoAr", () => ({ NumeroForaDoAr: () => null }));
vi.mock("@/components/inbox/PainelIniciarConversa", () => ({ BotaoIniciarConversa: () => null }));
vi.mock("@/hooks/pipelines/useDefaultPipeline", () => ({
  useDefaultPipeline: () => ({ data: null, isError: false, isLoading: false }),
}));
vi.mock("sonner", () => ({ toast: { error: vi.fn(), success: vi.fn(), warning: vi.fn() } }));
vi.mock("@/hooks/inbox/useConversationTags", () => ({
  useUpdateConversationTags: () => ({ mutate: vi.fn(), isPending: false }),
  useConversationTagVocabulary: () => ({ data: [] }),
}));
vi.mock("@/hooks/contacts/useContactTagVocabulary", () => ({
  useContactTagVocabulary: () => ({ data: [] }),
}));
vi.mock("@/hooks/contacts/useUpdateContact", () => ({
  useUpdateContact: () => ({ mutate: vi.fn(), isPending: false }),
}));
vi.mock("@/components/contacts/RoteirosDoContato", () => ({ RoteirosDoContato: () => null }));

import { InboxLayout } from "@/components/inbox/InboxLayout";

beforeAll(() => {
  Object.defineProperty(window, "innerWidth", { value: 1440, configurable: true, writable: true });
  Element.prototype.getBoundingClientRect = function (): DOMRect {
    return {
      width: 1040,
      left: 0,
      right: 1040,
      top: 0,
      bottom: 800,
      x: 0,
      y: 0,
      height: 800,
      toJSON: () => ({}),
    } as DOMRect;
  };
  window.HTMLElement.prototype.setPointerCapture = vi.fn();
  window.HTMLElement.prototype.releasePointerCapture = vi.fn();
  window.HTMLElement.prototype.hasPointerCapture = vi.fn(() => false);
  window.HTMLElement.prototype.scrollIntoView = vi.fn();
});

beforeEach(() => {
  togglePainelDoContato.mockClear();
  window.localStorage.clear();
});

function montar(painelRecolhidoInicial = false) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <InboxLayout initialSelectedId="cv-1" painelRecolhidoInicial={painelRecolhidoInicial} />
    </QueryClientProvider>,
  );
}

describe("Painel do contato — estado recolhido (SP4)", () => {
  it("AC-005.2: recolhido, o estado se mantém ao trocar de conversa", async () => {
    const user = userEvent.setup();
    montar();
    await screen.findByTestId("inbox-demandas");

    await user.click(screen.getByRole("button", { name: "Recolher painel do contato" }));
    await screen.findByTestId("inbox-painel-recolhido");

    await user.click(screen.getByRole("button", { name: "ir-conversa-2" }));

    expect(screen.getByTestId("inbox-painel-recolhido")).toBeInTheDocument();
    expect(screen.queryByTestId("inbox-demandas")).toBeNull();
    await user.click(screen.getByRole("button", { name: "ir-conversa-1" }));
    expect(screen.getByTestId("inbox-painel-recolhido")).toBeInTheDocument();
  });

  it("AC-005.2: o clique grava a preferência e recarregar (remontar com ela) mantém recolhido", async () => {
    const user = userEvent.setup();
    const primeira = montar();
    await screen.findByTestId("inbox-demandas");
    await user.click(screen.getByRole("button", { name: "Recolher painel do contato" }));
    // O servidor recebe o estado ANTERIOR (false = estava aberto): é ele que vira cookie.
    expect(togglePainelDoContato).toHaveBeenCalledWith(false);
    primeira.unmount();

    // Recarregar = o servidor lê o cookie e entrega `true` ao layout.
    montar(true);
    expect(await screen.findByTestId("inbox-painel-recolhido")).toBeInTheDocument();
    expect(screen.queryByTestId("inbox-demandas")).toBeNull();
  });

  it("AC-005.1: recolhido, só o fio de reabrir fica e ele reabre o painel", async () => {
    const user = userEvent.setup();
    montar(true);
    const fio = await screen.findByTestId("inbox-painel-recolhido");
    expect(fio.querySelectorAll("button")).toHaveLength(1);

    await user.click(screen.getByRole("button", { name: "Expandir painel do contato" }));
    expect(await screen.findByTestId("inbox-demandas")).toBeInTheDocument();
    expect(screen.queryByTestId("inbox-painel-recolhido")).toBeNull();
  });

  it("AC-005.3: aberto, o painel mostra etapa no funil, tags e compromissos", async () => {
    montar();
    expect(await screen.findByTestId("inbox-etapa-do-negocio")).toBeInTheDocument();
    expect(screen.getByText("Etapa do funil")).toBeInTheDocument();
    expect(screen.getByText("Tags do contato")).toBeInTheDocument();
    expect(screen.getByTestId("inbox-demandas")).toBeInTheDocument();
    await waitFor(() => expect(screen.getByTestId("inbox-memoria")).toBeInTheDocument());
  });
});
