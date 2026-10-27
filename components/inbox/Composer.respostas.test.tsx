/**
 * Composer no estilo WhatsApp (SP4, AC-004.1 a AC-004.4): o botão que troca
 * entre gravar áudio e enviar, e o menu "/" de respostas rápidas (título,
 * atalho e prévia; escolher insere o texto para revisão; sem permissão de ver
 * templates o menu não abre e o "/" segue como texto).
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { fireEvent, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

const { sendMutate, estado } = vi.hoisted(() => ({
  sendMutate: vi.fn(),
  estado: { podeConsultar: true as boolean },
}));

const TEMPLATES = [
  { id: "t-1", title: "Boas-vindas", body: "Olá! Como posso ajudar hoje?", shortcut: "oi", owner_user_id: null },
  { id: "t-2", title: "Preço", body: "Nosso plano começa em R$ 99.", shortcut: "preco", owner_user_id: null },
];

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
  useMessageTemplates: () => ({
    data: estado.podeConsultar ? TEMPLATES : [],
    podeConsultar: estado.podeConsultar,
  }),
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
vi.mock("@/components/inbox/composer/AudioRecorder", () => ({
  AudioRecorder: () => <button type="button">gravar-audio</button>,
}));
vi.mock("@/components/inbox/composer/EmojiButton", () => ({ EmojiButton: () => null }));

import { Composer } from "./Composer";

function montar() {
  return render(<Composer conversationId="conv-1" initialDraft="" contactName="Rafael" />);
}

const menu = () => within(screen.getByRole("listbox"));
const campo = () => screen.getByRole("textbox") as HTMLTextAreaElement;

beforeEach(() => {
  estado.podeConsultar = true;
  sendMutate.mockReset();
});

describe("Composer — áudio ou enviar (AC-004.1)", () => {
  it("AC-004.1: com o campo vazio mostra gravar áudio e não mostra enviar", () => {
    montar();
    expect(screen.getByRole("button", { name: "gravar-audio" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Enviar" })).toBeNull();
  });

  it("AC-004.1: com texto digitado mostra enviar e esconde gravar áudio", () => {
    montar();
    fireEvent.change(campo(), { target: { value: "Oi" } });
    expect(screen.getByRole("button", { name: "Enviar" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "gravar-audio" })).toBeNull();
  });
});

describe("Composer — menu de respostas rápidas (AC-004.2 a AC-004.4)", () => {
  it("AC-004.2: digitar / abre o menu com título, atalho e prévia do texto", () => {
    montar();
    fireEvent.change(campo(), { target: { value: "/" } });
    expect(screen.getByRole("listbox")).toBeInTheDocument();
    expect(menu().getByText("Boas-vindas")).toBeInTheDocument();
    expect(menu().getByText("/oi")).toBeInTheDocument();
    expect(menu().getByText("Olá! Como posso ajudar hoje?")).toBeInTheDocument();
    expect(menu().getByText("Preço")).toBeInTheDocument();
  });

  it("AC-004.2: o menu filtra enquanto se digita (por título e por atalho)", () => {
    montar();
    fireEvent.change(campo(), { target: { value: "/pre" } });
    expect(menu().getByText("Preço")).toBeInTheDocument();
    expect(menu().queryByText("Boas-vindas")).toBeNull();
    fireEvent.change(campo(), { target: { value: "/oi" } });
    expect(menu().getByText("Boas-vindas")).toBeInTheDocument();
    expect(menu().queryByText("Preço")).toBeNull();
  });

  it("AC-004.3: escolher a resposta insere o texto no campo para revisão, sem enviar", async () => {
    montar();
    fireEvent.change(campo(), { target: { value: "/pre" } });
    await userEvent.click(menu().getByText("Preço"));
    expect(campo().value).toBe("Nosso plano começa em R$ 99.");
    expect(sendMutate).not.toHaveBeenCalled();
    expect(screen.queryByRole("listbox")).toBeNull();
  });

  it("AC-004.4: sem permissão de ver templates o menu não abre e o / segue como texto", () => {
    estado.podeConsultar = false;
    montar();
    fireEvent.change(campo(), { target: { value: "/" } });
    expect(screen.queryByRole("listbox")).toBeNull();
    expect(campo().value).toBe("/");
  });
});
