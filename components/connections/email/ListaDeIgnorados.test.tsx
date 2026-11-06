import { beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

import { ListaDeIgnorados } from "./ListaDeIgnorados";

const h = vi.hoisted(() => ({ get: vi.fn(), post: vi.fn(), toast: { success: vi.fn(), error: vi.fn() } }));
vi.mock("@/lib/api/client", () => ({ apiClient: { get: h.get, post: h.post } }));
vi.mock("@/hooks/i18n/useT", () => ({ useT: () => (s: string) => s }));
vi.mock("sonner", () => ({ toast: h.toast }));

beforeEach(() => {
  cleanup();
  vi.clearAllMocks();
});

const CAIXAS = [
  { id: "cx-1", endereco: "ana@exemplo.com" },
  { id: "cx-2", endereco: "vendas@exemplo.com" },
];

const linha = (extra: Record<string, unknown> = {}) => ({
  id: "ign-1",
  caixa_id: "cx-1",
  remetente: "ofertas@loja.com",
  assunto: "Promoção da semana",
  recebido_em: "2026-11-03T10:00:00.000Z",
  motivo: "envio_em_massa",
  ...extra,
});

function montar() {
  render(
    <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
      <ListaDeIgnorados caixas={CAIXAS} />
    </QueryClientProvider>,
  );
}

describe("AC-003.3: lista de e-mails ignorados", () => {
  it("AC-003.3: mostra por caixa o remetente, o assunto, a data e o motivo em português simples", async () => {
    h.get.mockResolvedValue({
      data: {
        ignorados: [
          linha(),
          linha({ id: "ign-2", caixa_id: "cx-2", remetente: "noreply@banco.com", assunto: null, motivo: "no_reply" }),
        ],
      },
    });
    montar();

    const ana = (await screen.findByText("ofertas@loja.com")).closest("[data-testid='ignorado']") as HTMLElement;
    expect(h.get).toHaveBeenCalledWith("/api/v1/channels/email/ignorados");
    expect(within(ana).getByText("Promoção da semana")).toBeTruthy();
    expect(ana.textContent).toContain("2026");
    expect(ana.textContent).toContain("Parece um envio em massa, como propaganda.");
    const vendas = screen.getByText("noreply@banco.com").closest("[data-testid='ignorado']") as HTMLElement;
    expect(vendas.textContent).toContain("(sem assunto)");
    expect(vendas.textContent).toContain("Vem de um endereço que não recebe resposta (no-reply).");
    // cada linha fica sob o título da caixa dela
    expect(screen.getByRole("heading", { name: "ana@exemplo.com" })).toBeTruthy();
    expect(screen.getByRole("heading", { name: "vendas@exemplo.com" })).toBeTruthy();
    // nenhum código técnico vaza para a tela
    expect(document.body.textContent).not.toMatch(/envio_em_massa|no_reply|lista_de_inscricao/);
  });

  it("AC-003.3: sem nenhum ignorado, diz com clareza que está vazio", async () => {
    h.get.mockResolvedValue({ data: { ignorados: [] } });
    montar();

    await screen.findByText("Nenhum e-mail foi deixado de fora nos últimos 30 dias.");
  });

  it("AC-003.3: falha ao listar aparece como erro, nunca como lista vazia", async () => {
    h.get.mockRejectedValue(new Error("Sem permissão"));
    montar();

    expect((await screen.findByRole("alert")).textContent).toContain("Sem permissão");
    expect(screen.queryByText("Nenhum e-mail foi deixado de fora nos últimos 30 dias.")).toBeNull();
  });

  it("AC-003.3: 'Abrir como conversa' promove aquele e-mail e recarrega a lista", async () => {
    h.get.mockResolvedValue({ data: { ignorados: [linha()] } });
    h.post.mockResolvedValue({ data: { conversation_id: "v-1" } });
    montar();

    fireEvent.click(await screen.findByRole("button", { name: "Abrir como conversa" }));

    await waitFor(() => expect(h.post).toHaveBeenCalledWith("/api/v1/channels/email/ignorados/ign-1/promover", {}));
    await waitFor(() => expect(h.toast.success).toHaveBeenCalledWith("E-mail aberto como conversa."));
    await waitFor(() => expect(h.get.mock.calls.length).toBeGreaterThan(1));
  });

  it("AC-003.3: promover que falha mostra o motivo e não some com o e-mail", async () => {
    h.get.mockResolvedValue({ data: { ignorados: [linha()] } });
    h.post.mockRejectedValue(new Error("Não foi possível ler esse e-mail agora."));
    montar();

    fireEvent.click(await screen.findByRole("button", { name: "Abrir como conversa" }));

    await waitFor(() => expect(h.toast.error).toHaveBeenCalledWith("Não foi possível ler esse e-mail agora."));
    expect(screen.getByText("ofertas@loja.com")).toBeTruthy();
  });
});

describe("AC-003.4: 'Não é cliente' na lista", () => {
  it("AC-003.4: pede confirmação dizendo o que acontece e só então manda o endereço", async () => {
    h.get.mockResolvedValue({ data: { ignorados: [linha()] } });
    h.post.mockResolvedValue({ data: { endereco: "ofertas@loja.com", conversas_arquivadas: 0 } });
    montar();

    fireEvent.click(await screen.findByRole("button", { name: "Não é cliente" }));
    const dialogo = await screen.findByRole("alertdialog");
    expect(h.post).not.toHaveBeenCalled();
    expect(dialogo.textContent).toContain("ofertas@loja.com");
    expect(dialogo.textContent).toContain("Os próximos e-mails dessa pessoa serão deixados de fora");
    expect(dialogo.textContent).toContain("As conversas de e-mail dela serão arquivadas");
    expect(dialogo.textContent).toContain("Nada é apagado");
    expect(dialogo.textContent).toContain("Para desfazer, use Abrir como conversa");

    fireEvent.click(within(dialogo).getByRole("button", { name: "Marcar como não é cliente" }));

    await waitFor(() => expect(h.post).toHaveBeenCalledWith("/api/v1/channels/email/remetentes", { endereco: "ofertas@loja.com" }));
    await waitFor(() => expect(h.get.mock.calls.length).toBeGreaterThan(1));
  });

  it("AC-003.4: cancelar na confirmação não manda nada", async () => {
    h.get.mockResolvedValue({ data: { ignorados: [linha()] } });
    montar();

    fireEvent.click(await screen.findByRole("button", { name: "Não é cliente" }));
    fireEvent.click(within(await screen.findByRole("alertdialog")).getByRole("button", { name: "Cancelar" }));

    await waitFor(() => expect(screen.queryByRole("alertdialog")).toBeNull());
    expect(h.post).not.toHaveBeenCalled();
  });

  it("AC-003.4: quem já foi marcado diz isso e não oferece marcar de novo; abrir como conversa desfaz", async () => {
    h.get.mockResolvedValue({ data: { ignorados: [linha({ motivo: "nao_e_cliente" })] } });
    montar();

    const item = (await screen.findByText("ofertas@loja.com")).closest("[data-testid='ignorado']") as HTMLElement;
    expect(item.textContent).toContain("Você marcou como não é cliente.");
    expect(within(item).queryByRole("button", { name: "Não é cliente" })).toBeNull();
    expect(within(item).getByRole("button", { name: "Abrir como conversa" })).toBeTruthy();
  });

  it("AC-003.4: remetente que não é um endereço (e-mail ilegível) não oferece 'Não é cliente'", async () => {
    h.get.mockResolvedValue({ data: { ignorados: [linha({ remetente: "desconhecido", motivo: "ilegivel" })] } });
    montar();

    await screen.findByText("desconhecido");
    expect(screen.queryByRole("button", { name: "Não é cliente" })).toBeNull();
  });
});
