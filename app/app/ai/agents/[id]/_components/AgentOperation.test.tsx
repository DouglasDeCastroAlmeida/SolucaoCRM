/**
 * O diálogo de confirmação do modo automático — mudança 006, REQ-003 (AC-003.4).
 *
 * Escolher "Automático" não troca nada: abre um diálogo que diz, em português simples, que o
 * agente passa a responder sozinho e que o custo vai na chave da empresa. Só o clique em
 * "confirmar" chama a rota de confirmação. Voltar para o assistido segue direto.
 */
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import "@testing-library/jest-dom/vitest";

import type { AgentRow } from "@/hooks/ai/useAgent";

const api = vi.hoisted(() => ({ post: vi.fn(), patch: vi.fn() }));
const refresh = vi.hoisted(() => vi.fn());

vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh }) }));
vi.mock("@/lib/api/client", () => ({ apiClient: { post: api.post, patch: api.patch } }));
vi.mock("@/components/feedback/ApiErrorToast", () => ({ showApiError: vi.fn() }));

import { showApiError } from "@/components/feedback/ApiErrorToast";
import { AgentOperation } from "./AgentOperation";

const ID = "00000000-0000-4000-8000-000000000001";

function agente(modo: "assisted" | "automatic"): AgentRow {
  return {
    id: ID,
    organization_id: "00000000-0000-4000-8000-000000000002",
    name: "Atendente",
    description: null,
    model: "anthropic/claude-sonnet-4-6",
    system_prompt: "",
    is_active: true,
    is_default: false,
    config: {},
    guardrails: null,
    active_kb_version_id: null,
    published_version_id: "00000000-0000-4000-8000-000000000003",
    archived_at: null,
    operation_mode: modo,
    created_at: "2026-09-01T00:00:00Z",
    updated_at: "2026-09-01T00:00:00Z",
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  api.post.mockResolvedValue({});
  api.patch.mockResolvedValue({});
});

describe("AgentOperation — confirmar o automático", () => {
  it("AC-003.4: escolher Automático abre o diálogo e ainda não grava nada", async () => {
    const user = userEvent.setup({ delay: null });
    render(<AgentOperation agent={agente("assisted")} />);
    await user.selectOptions(screen.getByRole("combobox", { name: "Modo de operação" }), "automatic");
    const dialogo = await screen.findByRole("alertdialog");
    expect(within(dialogo).getByText(/responder sozinho/i)).toBeInTheDocument();
    expect(within(dialogo).getByText(/chave/i)).toBeInTheDocument();
    expect(api.post).not.toHaveBeenCalled();
    expect(api.patch).not.toHaveBeenCalled();
  });

  it("AC-003.4: o texto não exibe código interno nem jargão de motivo", async () => {
    const user = userEvent.setup({ delay: null });
    render(<AgentOperation agent={agente("assisted")} />);
    await user.selectOptions(screen.getByRole("combobox", { name: "Modo de operação" }), "automatic");
    const dialogo = await screen.findByRole("alertdialog");
    expect(dialogo.textContent).not.toMatch(/[a-z]+_[a-z_]+/);
  });

  it("AC-003.4: só o clique em confirmar chama a rota de confirmação, com confirmar_automatico:true", async () => {
    const user = userEvent.setup({ delay: null });
    render(<AgentOperation agent={agente("assisted")} />);
    await user.selectOptions(screen.getByRole("combobox", { name: "Modo de operação" }), "automatic");
    await user.click(await screen.findByRole("button", { name: "Confirmar e ligar o automático" }));
    await waitFor(() => expect(api.post).toHaveBeenCalledTimes(1));
    expect(api.post).toHaveBeenCalledWith(`/api/v1/ai/agents/${ID}/automatico`, {
      confirmar_automatico: true,
    });
    expect(api.patch).not.toHaveBeenCalled();
    await waitFor(() => expect(refresh).toHaveBeenCalled());
    await waitFor(() => expect(screen.queryByRole("alertdialog")).not.toBeInTheDocument());
  });

  it("AC-003.4: cancelar fecha o diálogo e não chama nada; o modo mostrado continua o atual", async () => {
    const user = userEvent.setup({ delay: null });
    render(<AgentOperation agent={agente("assisted")} />);
    const seletor = screen.getByRole("combobox", { name: "Modo de operação" });
    await user.selectOptions(seletor, "automatic");
    await user.click(await screen.findByRole("button", { name: "Cancelar" }));
    await waitFor(() => expect(screen.queryByRole("alertdialog")).not.toBeInTheDocument());
    expect(api.post).not.toHaveBeenCalled();
    expect(seletor).toHaveValue("assisted");
  });

  it("AC-003.4: Esc fecha o diálogo sem confirmar", async () => {
    const user = userEvent.setup({ delay: null });
    render(<AgentOperation agent={agente("assisted")} />);
    await user.selectOptions(screen.getByRole("combobox", { name: "Modo de operação" }), "automatic");
    await screen.findByRole("alertdialog");
    await user.keyboard("{Escape}");
    await waitFor(() => expect(screen.queryByRole("alertdialog")).not.toBeInTheDocument());
    expect(api.post).not.toHaveBeenCalled();
  });

  it("AC-003.4: o diálogo tem título e descrição ligados (leitor de tela)", async () => {
    const user = userEvent.setup({ delay: null });
    render(<AgentOperation agent={agente("assisted")} />);
    await user.selectOptions(screen.getByRole("combobox", { name: "Modo de operação" }), "automatic");
    const dialogo = await screen.findByRole("alertdialog");
    expect(dialogo).toHaveAccessibleName(/automático/i);
    expect(dialogo).toHaveAccessibleDescription(/responder sozinho/i);
  });

  it("AC-003.4: falha na confirmação mostra o erro e mantém o modo atual", async () => {
    api.post.mockRejectedValueOnce(new Error("falhou"));
    const user = userEvent.setup({ delay: null });
    render(<AgentOperation agent={agente("assisted")} />);
    await user.selectOptions(screen.getByRole("combobox", { name: "Modo de operação" }), "automatic");
    await user.click(await screen.findByRole("button", { name: "Confirmar e ligar o automático" }));
    await waitFor(() => expect(showApiError).toHaveBeenCalled());
    expect(refresh).not.toHaveBeenCalled();
  });

  it("AC-003.4: voltar para o assistido não pede confirmação e segue pelo PATCH", async () => {
    const user = userEvent.setup({ delay: null });
    render(<AgentOperation agent={agente("automatic")} />);
    await user.selectOptions(screen.getByRole("combobox", { name: "Modo de operação" }), "assisted");
    await waitFor(() =>
      expect(api.patch).toHaveBeenCalledWith(`/api/v1/ai/agents/${ID}`, { operation_mode: "assisted" }),
    );
    expect(screen.queryByRole("alertdialog")).not.toBeInTheDocument();
  });

  it("AC-003.6: em somente leitura o seletor fica desabilitado", () => {
    render(<AgentOperation agent={agente("assisted")} readOnly />);
    expect(screen.getByRole("combobox", { name: "Modo de operação" })).toBeDisabled();
  });
});
