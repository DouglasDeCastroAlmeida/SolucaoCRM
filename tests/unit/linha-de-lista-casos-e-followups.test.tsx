/**
 * 009, T-020 (AC-004.1 a AC-004.4): Casos e Follow-ups (lista de fluxos e fila)
 * desenhados como linhas de lista de conversa, com o comportamento preservado.
 */
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";

import type * as UseCasesModule from "@/hooks/ai/useCases";
import type { FollowupFlowPointerRow } from "@/hooks/followup/useFollowupFlows";

const h = vi.hoisted(() => ({
  casos: { open_count: 1, cases: [] as unknown[] } as { open_count: number; cases: unknown[] } | undefined,
  carregando: false,
  fluxos: [] as unknown[],
  fila: [] as unknown[],
  mutacao: () => ({ mutate: vi.fn(), mutateAsync: vi.fn(), isPending: false }),
}));

vi.mock("@/hooks/ai/useCases", async () => {
  const actual = await vi.importActual<typeof UseCasesModule>("@/hooks/ai/useCases");
  return { ...actual, useCases: () => ({ data: h.casos, isLoading: h.carregando }) };
});
vi.mock("@/app/app/ai/cases/_components/CaseDetail", () => ({ CaseDetail: () => null }));
vi.mock("@/hooks/followup/useFollowupFlows", () => ({
  useFollowupFlows: () => ({ data: h.fluxos }),
  useImportFollowupFlow: h.mutacao,
  useCreateFollowupFlow: h.mutacao,
  useDuplicateFollowupFlow: h.mutacao,
  useExportFollowupFlow: h.mutacao,
}));
vi.mock("@/hooks/followup/useFollowupFlow", () => ({ useDeleteFollowupFlow: h.mutacao, useRenameFollowupFlow: h.mutacao }));
vi.mock("@/hooks/followup/useInstalarModelo", () => ({ useInstalarModelo: h.mutacao }));
vi.mock("@/hooks/followup/useEtapasDeGatilho", () => ({ useEtapasDeGatilho: () => ({ etapas: [], carregando: false }) }));
vi.mock("@/hooks/followup/useFollowupQueue", () => ({
  useFollowupQueue: () => ({ data: { pages: [{ data: h.fila }] }, isLoading: false, hasNextPage: false }),
  useCancelFollowupEnrollment: h.mutacao,
  useCancelFollowupPromise: h.mutacao,
}));
vi.mock("@/hooks/auth/AuthProvider", () => ({ useAuth: () => ({ activeOrg: { modulos_ligados: [] } }) }));
vi.mock("@/hooks/i18n/useT", () => ({ useT: () => (texto: string) => texto }));
vi.mock("@/hooks/i18n/useLocaleDeData", () => ({ useLocaleDeData: () => undefined, useTagDeIdioma: () => "pt-BR" }));
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), refresh: vi.fn(), replace: vi.fn() }),
  useSearchParams: () => null,
}));

import { CaseList } from "@/app/app/ai/cases/_components/CaseList";
import { FlowsList } from "@/app/app/ai/followups/_components/FlowsList";
import { QueueTab } from "@/app/app/ai/followups/_components/QueueTab";

afterEach(() => {
  cleanup();
  h.casos = { open_count: 1, cases: [] };
  h.carregando = false;
  h.fluxos = [];
  h.fila = [];
});

const envolver = (ui: React.ReactNode) => (
  <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>{ui}</QueryClientProvider>
);

const CASO = {
  id: "case-1", kind: "escalation", title: "Cliente pede desconto", summary: "Quer 30%", blocker: "Fora da política",
  status: "awaiting_human", opened_at: new Date().toISOString(), conversation_id: "conv-1",
  contact_name: "Maria Silva", contact_phone: "+5511999990000",
};

describe("Casos como linhas de lista", () => {
  it("AC-004.1: o caso é um item com avatar do contato, assunto, contato e situação à direita", () => {
    h.casos = { open_count: 1, cases: [CASO] };
    render(envolver(<CaseList />));
    const item = screen.getByTestId("case-item");
    expect(item.tagName).toBe("LI");
    expect(within(item).getByText("MS")).toBeInTheDocument();
    expect(within(item).getByText("Cliente pede desconto")).toBeInTheDocument();
    expect(within(item).getByText(/Maria Silva/)).toBeInTheDocument();
    expect(within(item).getByText("Aguardando você")).toBeInTheDocument();
  });

  it("AC-004.2: clicar no caso o marca como o corrente (aria-current)", async () => {
    h.casos = { open_count: 1, cases: [CASO] };
    render(envolver(<CaseList />));
    const alvo = within(screen.getByTestId("case-item")).getByRole("button");
    expect(alvo).not.toHaveAttribute("aria-current");
    await userEvent.setup().click(alvo);
    expect(alvo).toHaveAttribute("aria-current", "true");
  });

  it("AC-004.4: sem casos mostra o estado vazio; carregando mostra o esqueleto, sem itens", () => {
    h.casos = { open_count: 0, cases: [] };
    const { unmount } = render(envolver(<CaseList />));
    expect(screen.getByText("Nenhum caso aberto")).toBeInTheDocument();
    unmount();
    h.carregando = true;
    h.casos = undefined;
    render(envolver(<CaseList />));
    expect(screen.queryByTestId("case-item")).not.toBeInTheDocument();
    expect(screen.queryByText("Nenhum caso aberto")).not.toBeInTheDocument();
  });
});

const FLUXO = {
  id: "11111111-1111-4111-8111-111111111111", name: "Recuperar carrinho", status: "active",
  active_version_id: "22222222-2222-4222-8222-222222222222", handoff_policy: "pause", updated_at: "2026-10-19T12:00:00Z",
} as FollowupFlowPointerRow;

describe("Follow-ups: fluxos como linhas de lista", () => {
  it("AC-004.1: o fluxo é um item com avatar, nome, versão, handoff, data e situação à direita", () => {
    h.fluxos = [FLUXO];
    render(envolver(<FlowsList initialData={[FLUXO]} canWrite />));
    const item = screen.getByRole("listitem");
    expect(within(item).getByText("RC")).toBeInTheDocument();
    expect(within(item).getByText("Recuperar carrinho")).toBeInTheDocument();
    expect(within(item).getByText("publicada")).toBeInTheDocument();
    expect(within(item).getByText("Pausar")).toBeInTheDocument();
    expect(item.textContent).toMatch(/Atualizado em/);
  });

  it("AC-004.2: abrir leva ao editor do fluxo e as ações de escrita continuam na linha", () => {
    h.fluxos = [FLUXO];
    render(envolver(<FlowsList initialData={[FLUXO]} canWrite />));
    expect(screen.getByRole("link", { name: /Recuperar carrinho/ })).toHaveAttribute("href", `/app/ai/followups/${FLUXO.id}`);
    expect(screen.getByRole("button", { name: "Renomear" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Duplicar/ })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Excluir/ })).toBeInTheDocument();
  });

  it("AC-004.2: sem permissão de escrita, as ações somem", () => {
    h.fluxos = [FLUXO];
    render(envolver(<FlowsList initialData={[FLUXO]} canWrite={false} />));
    expect(screen.queryByRole("button", { name: /Excluir/ })).not.toBeInTheDocument();
  });

  it("AC-004.4: sem fluxos, o estado vazio continua", () => {
    render(envolver(<FlowsList initialData={[]} canWrite />));
    expect(screen.getByText("Nenhum fluxo de follow-up ainda")).toBeInTheDocument();
  });
});

const ITEM_DA_FILA = {
  source: "enrollment", id: "enr-1", contact: { id: "c-1", name: "João Souza" }, flow_name: "Recuperar carrinho",
  agent_name: "Bia", node_or_reason: "Esperando resposta", next_fire_at: "2030-01-01T12:00:00Z", status: "active", detail: null,
};

describe("Follow-ups: fila como linhas de lista", () => {
  it("AC-004.1: o item da fila mostra contato, fluxo, agente, motivo, próximo disparo e status", () => {
    h.fila = [ITEM_DA_FILA];
    render(envolver(<QueueTab canWrite />));
    const item = screen.getByTestId("queue-row");
    expect(item.tagName).toBe("LI");
    expect(within(item).getByRole("link", { name: "João Souza" })).toHaveAttribute("href", "/app/ai/followups/enrollments/enr-1");
    expect(within(item).getByText("Recuperar carrinho")).toBeInTheDocument();
    expect(item.textContent).toContain("agente Bia");
    expect(within(item).getByText("Esperando resposta")).toBeInTheDocument();
    expect(item.textContent).toContain("01/01/2030");
  });

  it("AC-004.2: só quem escreve vê Cancelar, e promessa não tem link para o dossiê", () => {
    h.fila = [{ ...ITEM_DA_FILA, source: "promise", status: "agendada", flow_name: null }];
    const { unmount } = render(envolver(<QueueTab canWrite />));
    expect(screen.queryByTestId("queue-abrir-dossie")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Cancelar retorno" })).toBeInTheDocument();
    unmount();
    render(envolver(<QueueTab canWrite={false} />));
    expect(screen.queryByTestId("cancelar-item-da-fila")).not.toBeInTheDocument();
  });

  it("AC-004.4: fila vazia mostra o estado vazio", () => {
    render(envolver(<QueueTab canWrite />));
    expect(screen.getByText("Nenhum item na fila")).toBeInTheDocument();
  });
});
