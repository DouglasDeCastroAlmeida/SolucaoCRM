/**
 * AC-007.1: o inbox inteiro anda só pelo teclado — percorrer a lista, abrir a
 * conversa, enviar e usar os atalhos existentes — e o foco SE VÊ (anel/contorno
 * no item focado, não só uma troca de fundo).
 *
 * Caracterização: monta a linha real, os atalhos reais e o compositor real
 * (filhos de tela mockados, como em `Composer.respostas.test.tsx`).
 */
import { useState } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

const { sendMutate } = vi.hoisted(() => ({ sendMutate: vi.fn() }));

vi.mock("@/hooks/i18n/useT", () => ({ useT: () => (texto: string) => texto }));
vi.mock("@/hooks/inbox/useSendMessage", () => ({
  useSendMessage: () => ({ mutate: sendMutate, isPending: false }),
}));
vi.mock("@/hooks/inbox/useCreateNote", () => ({
  useCreateNote: () => ({ mutate: vi.fn(), isPending: false }),
}));
vi.mock("@/hooks/inbox/useUploadMedia", () => ({
  useUploadMedia: () => ({ mutateAsync: vi.fn(), isPending: false }),
}));
vi.mock("@/hooks/inbox/useAssignableMembers", () => ({
  useAssignableMembers: () => ({ data: [] }),
}));
vi.mock("@/hooks/inbox/useMessageTemplates", () => ({
  useMessageTemplates: () => ({ data: [], podeConsultar: true }),
}));
vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn(), warning: vi.fn() } }));
vi.mock("@/lib/inbox/clipboard-image", () => ({ imagemDoClipboard: vi.fn(() => null) }));
vi.mock("@/lib/messaging/contact-card", () => ({ resolveSharedContact: vi.fn() }));
vi.mock("@/components/inbox/composer/ReplyReviewPanel", () => ({ ReplyReviewPanel: () => null }));
vi.mock("@/components/inbox/composer/MentionMenu", () => ({
  resolverMencao: () => null,
  opcoesDeMencao: () => [],
  MentionMenu: () => null,
}));
vi.mock("@/components/inbox/composer/AttachMenu", () => ({ AttachMenu: () => null }));
vi.mock("@/components/inbox/composer/AttachmentPreviewDialog", () => ({
  AttachmentPreviewDialog: () => null,
}));
vi.mock("@/components/inbox/composer/ContactPickerDialog", () => ({
  ContactPickerDialog: () => null,
}));
vi.mock("@/components/inbox/composer/AudioRecorder", () => ({ AudioRecorder: () => null }));
vi.mock("@/components/inbox/composer/EmojiButton", () => ({ EmojiButton: () => null }));

import { Composer } from "./Composer";
import { ConversationListItem } from "./ConversationListItem";
import { InboxKeyboardShortcuts } from "./InboxKeyboardShortcuts";
import { conversaDeExemplo } from "./__fixtures__/conversa";

const IDS = ["c1", "c2", "c3"];

function Tela({ aoAbrir }: { aoAbrir: (id: string) => void }) {
  const [aberta, setAberta] = useState<string | null>(null);
  const abrir = (id: string) => {
    setAberta(id);
    aoAbrir(id);
  };
  return (
    <div>
      <InboxKeyboardShortcuts
        visibleIds={IDS}
        selectedId={aberta}
        onSelect={abrir}
        onFocusReply={() => (document.querySelector("textarea") as HTMLTextAreaElement | null)?.focus()}
        onClaim={() => undefined}
        onClose={() => undefined}
        onToggleHelp={() => undefined}
      />
      <ul>
        {IDS.map((id, i) => (
          <li key={id}>
            <ConversationListItem
              conversation={{
                ...conversaDeExemplo.conversation,
                id,
                contacts: { ...conversaDeExemplo.conversation.contacts!, id: `ct-${id}`, display_name: `Contato ${i + 1}`, name: `Contato ${i + 1}` },
              }}
              isSelected={aberta === id}
              onSelect={abrir}
            />
          </li>
        ))}
      </ul>
      {aberta ? <Composer conversationId={aberta} initialDraft="" contactName="Rafael" /> : null}
    </div>
  );
}

const botaoDaConversa = (id: string) =>
  document.querySelector<HTMLButtonElement>(`[data-conversation-id="${id}"]`)!;

beforeEach(() => sendMutate.mockReset());
afterEach(cleanup);

describe("inbox só pelo teclado (AC-007.1)", () => {
  it("AC-007.1: Tab percorre a lista e Enter abre a conversa focada", async () => {
    const user = userEvent.setup();
    const aoAbrir = vi.fn();
    render(<Tela aoAbrir={aoAbrir} />);

    await user.tab();
    expect(botaoDaConversa("c1")).toHaveFocus();
    await user.tab();
    expect(botaoDaConversa("c2")).toHaveFocus();

    await user.keyboard("{Enter}");
    expect(aoAbrir).toHaveBeenCalledWith("c2");
    expect(botaoDaConversa("c2")).toHaveAttribute("aria-current", "true");
  });

  it("AC-007.1: o item focado mostra o foco com anel, não só com troca de fundo", async () => {
    const user = userEvent.setup();
    render(<Tela aoAbrir={vi.fn()} />);
    await user.tab();
    const classes = botaoDaConversa("c1").className;
    expect(document.activeElement).toBe(botaoDaConversa("c1"));
    expect(classes).toMatch(/focus-visible:ring-2/);
    expect(classes).toMatch(/focus-visible:ring-accent/);
  });

  it("AC-007.1: os atalhos j/k percorrem a lista e r leva o foco ao campo de resposta", async () => {
    const user = userEvent.setup();
    const aoAbrir = vi.fn();
    render(<Tela aoAbrir={aoAbrir} />);

    await user.keyboard("j");
    expect(aoAbrir).toHaveBeenLastCalledWith("c1");
    await user.keyboard("j");
    expect(aoAbrir).toHaveBeenLastCalledWith("c2");
    await user.keyboard("k");
    expect(aoAbrir).toHaveBeenLastCalledWith("c1");

    await user.keyboard("r");
    expect(screen.getByRole("textbox")).toHaveFocus();
  });

  it("AC-007.1: Enter no campo envia e Shift+Enter não envia", async () => {
    const user = userEvent.setup();
    render(<Tela aoAbrir={vi.fn()} />);
    await user.keyboard("j");
    await user.keyboard("r");
    const campo = screen.getByRole("textbox");

    fireEvent.change(campo, { target: { value: "Oi" } });
    await user.keyboard("{Shift>}{Enter}{/Shift}");
    expect(sendMutate).not.toHaveBeenCalled();

    await user.keyboard("{Enter}");
    expect(sendMutate).toHaveBeenCalledTimes(1);
    expect((sendMutate.mock.calls[0] as unknown[])[0]).toMatchObject({
      conversation_id: "c1",
      body: "Oi",
    });
  });
});
