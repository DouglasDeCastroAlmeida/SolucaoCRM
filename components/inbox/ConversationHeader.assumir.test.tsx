import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { ConversationHeader } from "./ConversationHeader";
import type { ConversationWithContact } from "@/hooks/inbox/useConversationsRealtime";

/**
 * AC-002.6: "Assumir" e "Devolver ao automatico" (a volta para a IA) mantem o
 * comportamento de antes da reestilizacao. Teste de caracterizacao: fixa o que
 * cada botao CHAMA e que a cor vem dos tokens da marca, nunca de cor fixa.
 */

const claimMutate = vi.hoisted(() => vi.fn());
const retomarMutate = vi.hoisted(() => vi.fn());

vi.mock("@/hooks/auth/AuthProvider", () => ({
  useAuth: () => ({ user: { id: "u1", support: null, is_platform_admin: true } }),
  usePermission: () => true,
}));
vi.mock("@/hooks/inbox/useClaimConversation", () => ({
  useClaimConversation: () => ({ mutate: claimMutate, isPending: false }),
}));
vi.mock("@/hooks/inbox/useReleaseConversation", () => ({
  useReleaseConversation: () => ({ mutate: vi.fn(), isPending: false }),
}));
vi.mock("@/hooks/inbox/useCloseConversation", () => ({
  useCloseConversation: () => ({ mutate: vi.fn(), isPending: false }),
  useReopenConversation: () => ({ mutate: vi.fn(), isPending: false }),
  useArchiveConversation: () => ({ mutate: vi.fn(), isPending: false }),
}));
vi.mock("@/hooks/inbox/useResumeAiAttendance", () => ({
  useResumeAiAttendance: () => ({ mutate: retomarMutate, isPending: false }),
}));
vi.mock("@/hooks/inbox/usePauseAiAttendance", () => ({
  usePauseAiAttendance: () => ({ mutate: vi.fn(), isPending: false }),
}));
vi.mock("@/hooks/contacts/usePersonalContact", () => ({
  useMarkPersonalContact: () => ({ mutate: vi.fn(), isPending: false }),
  useUnmarkPersonalContact: () => ({ mutate: vi.fn(), isPending: false }),
}));
vi.mock("@/hooks/ai/useAutomaticoAtivo", () => ({ useAutomaticoAtivo: () => ({ data: true }) }));
vi.mock("@/components/kanban/OwnerBadge", () => ({ OwnerBadge: () => null }));
vi.mock("@/components/inbox/FaixaDaCarteira", () => ({ FaixaDaCarteira: () => null }));
vi.mock("@/components/inbox/ReassignDialog", () => ({ ReassignDialog: () => null }));
vi.mock("@/components/inbox/JanelaSelo", () => ({ JanelaSelo: () => null }));
vi.mock("@/components/inbox/ChannelLogo", () => ({ ChannelLogo: () => null }));
vi.mock("@/components/voice/DialButton", () => ({ DialButton: () => null }));
vi.mock("@/components/inbox/VideoCallButton", () => ({ VideoCallButton: () => null }));
vi.mock("@/components/inbox/SnoozeButton", () => ({ SnoozeButton: () => null }));

function montar(conversa: Record<string, unknown> = {}) {
  const c = {
    id: "conv-1",
    organization_id: "org-1",
    contact_id: "contato-1",
    status: "open",
    assigned_to_user_id: null,
    assigned_to_user_name: null,
    assignee_kind: "ai",
    bot_silenced_until: null,
    snooze_until: null,
    service_revision: 3,
    is_group: false,
    tags: [],
    contacts: {
      id: "contato-1", display_name: "Fulana", name: null, phone_number: "5511999", tags: [],
      is_blocked: false, is_personal: false, is_anonymized: false, force_human: false,
    },
    channel_sessions: null,
    ...conversa,
  } as unknown as ConversationWithContact;
  return render(<ConversationHeader conversation={c} />);
}

beforeEach(() => {
  claimMutate.mockReset();
  retomarMutate.mockReset();
});

describe("ConversationHeader - Assumir e Devolver (AC-002.6)", () => {
  it("AC-002.6: Assumir chama a mesma rota com a conversa e o dono esperado", async () => {
    const user = userEvent.setup();
    montar({ assigned_to_user_id: null });
    await user.click(screen.getByRole("button", { name: "Assumir" }));
    expect(claimMutate).toHaveBeenCalledTimes(1);
    expect(claimMutate).toHaveBeenCalledWith({ conversation_id: "conv-1", expected_assignee: null });
  });

  it("AC-002.6: Devolver ao automatico chama a mesma rota, so com a conversa", async () => {
    const user = userEvent.setup();
    montar({
      assigned_to_user_id: "u1",
      assignee_kind: "user",
      bot_silenced_until: new Date(Date.now() + 10 * 60_000).toISOString(),
    });
    await user.click(screen.getByTestId("devolver-ao-automatico"));
    expect(retomarMutate).toHaveBeenCalledTimes(1);
    expect(retomarMutate).toHaveBeenCalledWith({ conversation_id: "conv-1" });
    expect(claimMutate).not.toHaveBeenCalled();
  });

  it("AC-002.6: a cor dos dois botoes vem dos tokens, nunca de cor fixa", () => {
    montar({
      assigned_to_user_id: "u1",
      assignee_kind: "user",
      bot_silenced_until: new Date(Date.now() + 10 * 60_000).toISOString(),
    });
    for (const nome of ["Assumir", "Devolver ao automático"]) {
      const classe = screen.getByRole("button", { name: nome }).className;
      expect(classe, nome).not.toMatch(/#[0-9a-f]{3,6}|\b(bg|text|border)-(blue|green|red|emerald|sky|indigo|violet|slate|gray|zinc)-\d/i);
    }
  });
});
