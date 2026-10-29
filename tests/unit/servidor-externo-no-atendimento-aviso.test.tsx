/**
 * Mudança 006, Fatia 7 (melhoria da revisão): o aviso do cartão fala de TODOS os
 * servidores com ferramenta ligada no agente, não de "o servidor" (singular).
 */
import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));
vi.mock("@/components/feedback/ApiErrorToast", () => ({ showApiError: vi.fn() }));
vi.mock("@/lib/api/client", () => ({ apiClient: { patch: vi.fn() } }));

import { ServidorExternoNoAtendimento } from "@/app/app/ai/agents/[id]/_components/ServidorExternoNoAtendimento";

describe("AC-007.2: aviso de privacidade do atendimento", () => {
  it("diz que os dados do contato vão a todos os servidores com ferramenta ligada neste agente", () => {
    render(<ServidorExternoNoAtendimento agentId="a" inicial={false} />);
    const aviso = screen.getByText(/todos os servidores/i);
    expect(aviso.textContent).toMatch(/ferramenta ligada neste agente/i);
    expect(screen.queryByText(/O servidor recebe a identidade/)).toBeNull();
  });
});
