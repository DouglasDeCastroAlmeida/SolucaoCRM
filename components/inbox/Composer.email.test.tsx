/**
 * Fatia 6 (T-036/T-037): o Composer segue o que o canal permite, perguntando à matriz de
 * capacidades e nunca "é e-mail?". E-mail não tem gravador de áudio e recusa, ANTES de subir o
 * arquivo, um anexo acima do teto, dizendo a causa em português simples. O WhatsApp fica igual.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";

const h = vi.hoisted(() => ({ toastError: vi.fn() }));

vi.mock("@/hooks/i18n/useT", () => ({ useT: () => (s: string) => s }));
vi.mock("@/hooks/inbox/useSendMessage", () => ({ useSendMessage: () => ({ mutate: vi.fn(), isPending: false }) }));
vi.mock("@/hooks/inbox/useCreateNote", () => ({ useCreateNote: () => ({ mutate: vi.fn(), isPending: false }) }));
vi.mock("@/hooks/inbox/useUploadMedia", () => ({ useUploadMedia: () => ({ mutateAsync: vi.fn(), isPending: false }) }));
vi.mock("@/hooks/inbox/useAssignableMembers", () => ({ useAssignableMembers: () => ({ data: [] }) }));
vi.mock("@/hooks/inbox/useMessageTemplates", () => ({ useMessageTemplates: () => ({ data: [] }) }));
vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: h.toastError, warning: vi.fn() } }));
vi.mock("@/lib/inbox/clipboard-image", () => ({ imagemDoClipboard: vi.fn(() => null) }));
vi.mock("@/lib/messaging/contact-card", () => ({ resolveSharedContact: vi.fn() }));
vi.mock("@/components/inbox/composer/ReplyReviewPanel", () => ({ ReplyReviewPanel: () => null }));
vi.mock("@/components/inbox/composer/BotaoSugerirResposta", () => ({ BotaoSugerirResposta: () => null }));
vi.mock("@/components/inbox/composer/TemplateMenu", () => ({
  resolveSlash: () => ({ open: false, query: "" }),
  TemplateMenu: () => null,
}));
vi.mock("@/components/inbox/composer/MentionMenu", () => ({
  resolverMencao: () => null,
  opcoesDeMencao: () => [],
  MentionMenu: () => null,
}));
vi.mock("@/components/inbox/composer/ContactPickerDialog", () => ({ ContactPickerDialog: () => null }));
vi.mock("@/components/inbox/composer/EmojiButton", () => ({ EmojiButton: () => null }));
vi.mock("@/components/inbox/composer/BarraDeRecursos", () => ({ BarraDeRecursos: () => null }));
vi.mock("@/components/inbox/composer/AudioRecorder", () => ({
  AudioRecorder: () => <span data-testid="gravador-de-audio" />,
}));
vi.mock("@/components/inbox/composer/AttachMenu", () => ({
  AttachMenu: ({ onPick }: { onPick: (f: File) => void }) => (
    <>
      <button type="button" onClick={() => onPick(new File([new Uint8Array(1024)], "pequeno.pdf"))}>
        escolher-pequeno
      </button>
      <button type="button" onClick={() => onPick(new File([new Uint8Array(19 * 1024 * 1024)], "grande.pdf"))}>
        escolher-grande
      </button>
    </>
  ),
}));
vi.mock("@/components/inbox/composer/AttachmentPreviewDialog", () => ({
  AttachmentPreviewDialog: ({ files }: { files: File[] }) => <span data-testid="previa">{files.length}</span>,
}));

import { DEFAULT_CHANNEL_PROVIDER } from "@/lib/channels/capabilities";

import { Composer } from "./Composer";

const montar = (provider: string | null) =>
  render(<Composer conversationId="c-1" provider={provider} contactName="Ana" />);

beforeEach(() => {
  h.toastError.mockClear();
});

describe("AC-008.5: Composer por capacidade", () => {
  it("e-mail não oferece o gravador de áudio; o canal padrão (WhatsApp) continua oferecendo", () => {
    const { unmount } = montar("email");
    expect(screen.queryByTestId("gravador-de-audio")).toBeNull();
    unmount();

    montar(DEFAULT_CHANNEL_PROVIDER);
    expect(screen.getByTestId("gravador-de-audio")).toBeTruthy();
  });

  it("sem informar o canal o comportamento é o de sempre (gravador aparece)", () => {
    montar(null);
    expect(screen.getByTestId("gravador-de-audio")).toBeTruthy();
  });

  it("e-mail recusa anexo acima de 18 MB, com a causa em português simples, e não abre a prévia", () => {
    montar("email");
    fireEvent.click(screen.getByText("escolher-grande"));

    expect(h.toastError).toHaveBeenCalledTimes(1);
    expect(String(h.toastError.mock.calls[0]![0])).toContain("18 MB");
    expect(screen.queryByTestId("previa")?.textContent ?? "0").toBe("0");
  });

  it("e-mail aceita anexo pequeno", () => {
    montar("email");
    fireEvent.click(screen.getByText("escolher-pequeno"));

    expect(h.toastError).not.toHaveBeenCalled();
    expect(screen.getByTestId("previa").textContent).toBe("1");
  });

  it("WhatsApp não ganha teto novo: o arquivo grande entra na prévia como antes", () => {
    montar(DEFAULT_CHANNEL_PROVIDER);
    fireEvent.click(screen.getByText("escolher-grande"));

    expect(h.toastError).not.toHaveBeenCalled();
    expect(screen.getByTestId("previa").textContent).toBe("1");
  });
});
