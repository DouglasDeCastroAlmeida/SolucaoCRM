/**
 * 009, T-020 (AC-004.1 a AC-004.4): a lista de Tarefas desenhada como linhas de
 * lista de conversa, com o comportamento de antes preservado.
 */
import { cleanup, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";

import type { Tarefa } from "@/lib/tarefas/tipos";

vi.mock("@/hooks/i18n/useT", () => ({ useT: () => (texto: string) => texto }));
vi.mock("@/hooks/i18n/useLocaleDeData", () => ({ useTagDeIdioma: () => "pt-BR" }));
vi.mock("@/hooks/auth/AuthProvider", () => ({ useUser: () => ({ id: "u-eu" }) }));
vi.mock("@/hooks/inbox/useAssignableMembers", () => ({
  useAssignableMembers: () => ({ data: [{ user_id: "u-ana", role: "agent", full_name: "Ana" }] }),
}));
vi.mock("next/link", () => ({
  default: ({ href, children, ...resto }: { href: string; children: React.ReactNode }) => (
    <a href={href} {...resto}>
      {children}
    </a>
  ),
}));

import { ListaDeTarefas } from "./ListaDeTarefas";

afterEach(() => cleanup());

function tarefa(resto: Partial<Tarefa> = {}): Tarefa {
  return {
    id: "t-1",
    organization_id: "org-1",
    title: "Ligar para confirmar a entrega",
    description: "Combinar o horário",
    due_date: null,
    priority: "high",
    status: "pending",
    lead_id: "l-1",
    contact_id: "c-1",
    demanda_id: null,
    assigned_to: "u-ana",
    created_by: "u-eu",
    created_at: "2026-10-01T12:00:00Z",
    updated_at: "2026-10-01T12:00:00Z",
    lead: { id: "l-1", title: "Pedido 42" },
    ...resto,
  } as Tarefa;
}

function montar(extra: Partial<React.ComponentProps<typeof ListaDeTarefas>> = {}) {
  const props = {
    tarefas: [tarefa()],
    podeEditar: true,
    aoAlternarConcluida: vi.fn(async () => ({})),
    aoEditar: vi.fn(),
    aoApagar: vi.fn(async () => ({})),
    ...extra,
  };
  render(<ListaDeTarefas {...props} />);
  return props;
}

describe("ListaDeTarefas como linhas de lista", () => {
  it("AC-004.1: cada tarefa é um item de lista com avatar, título, prévia e prazo à direita", () => {
    montar();
    const item = screen.getByRole("listitem");
    expect(within(item).getByText("LE")).toBeInTheDocument();
    expect(within(item).getByText("Ligar para confirmar a entrega")).toBeInTheDocument();
    expect(within(item).getByText("Sem prazo")).toBeInTheDocument();
    // Tudo o que era campo da linha continua acessível: descrição, prioridade, responsável e negócio.
    expect(within(item).getByText("Combinar o horário")).toBeInTheDocument();
    expect(within(item).getByText("Alta")).toBeInTheDocument();
    expect(within(item).getByText("Ana")).toBeInTheDocument();
    expect(within(item).getByRole("link", { name: /Pedido 42/ })).toHaveAttribute("href", "/app/leads/l-1");
  });

  it("AC-004.2: marcar concluída, editar e apagar (em dois toques) chamam os mesmos handlers", async () => {
    const user = userEvent.setup();
    const p = montar();
    await user.click(screen.getByRole("checkbox", { name: "Marcar como concluída" }));
    expect(p.aoAlternarConcluida).toHaveBeenCalledWith(expect.objectContaining({ id: "t-1" }));
    await user.click(screen.getByRole("button", { name: "Editar a tarefa" }));
    expect(p.aoEditar).toHaveBeenCalledTimes(1);
    await user.click(screen.getByRole("button", { name: "Apagar a tarefa" }));
    expect(p.aoApagar).not.toHaveBeenCalled();
    await user.click(screen.getByRole("button", { name: "Confirmar" }));
    expect(p.aoApagar).toHaveBeenCalledTimes(1);
  });

  it("AC-004.2: sem permissão de editar, a caixa fica travada e não há ações", () => {
    montar({ podeEditar: false });
    expect(screen.getByRole("checkbox", { name: "Marcar como concluída" })).toBeDisabled();
    expect(screen.queryByRole("button", { name: "Editar a tarefa" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Apagar a tarefa" })).not.toBeInTheDocument();
  });

  it("AC-004.2: tarefa encerrada aparece marcada e oferece reabrir", () => {
    montar({ tarefas: [tarefa({ status: "done" })] });
    expect(screen.getByRole("checkbox", { name: "Reabrir a tarefa" })).toHaveAttribute("aria-checked", "true");
  });

  it("AC-004.2: sem mostrarNegocio, o atalho do negócio some", () => {
    montar({ mostrarNegocio: false });
    expect(screen.queryByRole("link", { name: /Pedido 42/ })).not.toBeInTheDocument();
  });

  it("AC-004.4: sem tarefas, o estado vazio continua aparecendo", () => {
    montar({ tarefas: [] });
    expect(screen.getByText("Nenhuma tarefa por aqui")).toBeInTheDocument();
    expect(screen.queryByRole("listitem")).not.toBeInTheDocument();
  });
});
