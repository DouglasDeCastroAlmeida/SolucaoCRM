import { beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

import { CanalEmailClient } from "./CanalEmailClient";

const h = vi.hoisted(() => ({ get: vi.fn(), post: vi.fn(), patch: vi.fn(), delete: vi.fn() }));
vi.mock("@/lib/api/client", () => ({ apiClient: { get: h.get, post: h.post, patch: h.patch, delete: h.delete } }));
vi.mock("@/hooks/i18n/useT", () => ({ useT: () => (s: string) => s }));
vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

beforeEach(() => {
  cleanup();
  vi.clearAllMocks();
});

function montar() {
  render(
    <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
      <CanalEmailClient />
    </QueryClientProvider>,
  );
}

describe("aba de e-mail em Conexões", () => {
  it("AC-001.5: mostra a caixa conectada com endereço e estado, e só os 4 últimos da senha", async () => {
    h.get.mockResolvedValue({
      data: {
        caixas: [
          {
            id: "cx-1",
            endereco: "ana@exemplo.com",
            status: "WORKING",
            usuario: "ana@exemplo.com",
            imap: { host: "imap.exemplo.com", porta: 993 },
            smtp: { host: "smtp.exemplo.com", porta: 465 },
            senha_ultimos4: "m9z2",
            assinatura: null,
            teto_diario: 200,
            intervalo_segundos: 30,
          },
        ],
      },
    });
    montar();

    await screen.findByText("ana@exemplo.com");
    expect(screen.getByText("Conectada")).toBeTruthy();
    expect(document.body.textContent).toContain("••••m9z2");
    expect(screen.getByRole("button", { name: "Conectar outra caixa" })).toBeTruthy();
    // Com caixa conectada o assistente não ocupa a tela até a pessoa pedir.
    expect(screen.queryByTestId("assistente-email")).toBeNull();
  });

  it("AC-001.1: sem nenhuma caixa, o assistente já aparece", async () => {
    h.get.mockResolvedValue({ data: { caixas: [] } });
    montar();

    await screen.findByTestId("assistente-email");
  });

  it("AC-001.4: falha ao listar aparece como erro, nunca como lista vazia", async () => {
    h.get.mockRejectedValue(new Error("Sem permissão"));
    montar();

    expect((await screen.findByRole("alert")).textContent).toContain("Sem permissão");
    expect(screen.queryByTestId("assistente-email")).toBeNull();
  });
});

const caixa = (extra: Record<string, unknown> = {}) => ({
  id: "cx-1",
  endereco: "ana@exemplo.com",
  status: "WORKING",
  usuario: "ana@exemplo.com",
  imap: { host: "imap.exemplo.com", porta: 993 },
  smtp: { host: "smtp.exemplo.com", porta: 465 },
  senha_ultimos4: "m9z2",
  assinatura: "Abraço da Ana",
  teto_diario: 200,
  intervalo_segundos: 30,
  pausada: false,
  pausa_motivo: null,
  ...extra,
});

describe("AC-008.1: várias caixas, cada uma com assinatura, teto e estado próprios", () => {
  it("mostra cada caixa com o seu teto, o seu intervalo, a sua assinatura e o seu estado", async () => {
    h.get.mockResolvedValue({
      data: {
        caixas: [
          caixa(),
          caixa({ id: "cx-2", endereco: "vendas@exemplo.com", teto_diario: 50, intervalo_segundos: 90, assinatura: null, pausada: true, pausa_motivo: "pausada_pela_equipe" }),
          caixa({ id: "cx-3", endereco: "suporte@exemplo.com", pausada: true, pausa_motivo: "senha_recusada" }),
        ],
      },
    });
    montar();

    const ana = (await screen.findByText("ana@exemplo.com")).closest("[data-testid='caixa-email']") as HTMLElement;
    const vendas = screen.getByText("vendas@exemplo.com").closest("[data-testid='caixa-email']") as HTMLElement;
    const suporte = screen.getByText("suporte@exemplo.com").closest("[data-testid='caixa-email']") as HTMLElement;

    expect(within(ana).getByText("Conectada")).toBeTruthy();
    expect(ana.textContent).toContain("Abraço da Ana");
    expect(ana.textContent).toContain("200");
    expect(within(vendas).getByText("Pausada")).toBeTruthy();
    expect(vendas.textContent).toContain("50");
    expect(vendas.textContent).toContain("90");
    expect(within(suporte).getByText("Senha recusada")).toBeTruthy();
  });
});

describe("AC-008.2: pausar e retomar por caixa", () => {
  it("Pausar manda pausada:true só para aquela caixa e recarrega o estado", async () => {
    h.get.mockResolvedValue({ data: { caixas: [caixa(), caixa({ id: "cx-2", endereco: "vendas@exemplo.com" })] } });
    h.patch.mockResolvedValue({ data: {} });
    montar();

    const vendas = (await screen.findByText("vendas@exemplo.com")).closest("[data-testid='caixa-email']") as HTMLElement;
    fireEvent.click(within(vendas).getByRole("button", { name: "Pausar" }));

    await waitFor(() => expect(h.patch).toHaveBeenCalledWith("/api/v1/channels/email/cx-2", { pausada: true }));
    expect(h.patch).toHaveBeenCalledTimes(1);
    // depois de pausar, a lista é lida de novo (o estado mostrado vem do servidor)
    await waitFor(() => expect(h.get.mock.calls.length).toBeGreaterThan(1));
  });

  it("caixa pausada pela equipe oferece Retomar e explica que nada se perde", async () => {
    h.get.mockResolvedValue({ data: { caixas: [caixa({ pausada: true, pausa_motivo: "pausada_pela_equipe" })] } });
    h.patch.mockResolvedValue({ data: {} });
    montar();

    await screen.findByText("ana@exemplo.com");
    expect(document.body.textContent).toContain("as conversas ficam como estão");
    fireEvent.click(screen.getByRole("button", { name: "Retomar" }));
    await waitFor(() => expect(h.patch).toHaveBeenCalledWith("/api/v1/channels/email/cx-1", { pausada: false }));
  });

  it("caixa parada por senha recusada NÃO oferece Retomar: pede a senha nova", async () => {
    h.get.mockResolvedValue({ data: { caixas: [caixa({ pausada: true, pausa_motivo: "senha_recusada" })] } });
    montar();

    await screen.findByText("ana@exemplo.com");
    expect(screen.queryByRole("button", { name: "Retomar" })).toBeNull();
    expect(document.body.textContent).toContain("senha nova");
  });
});

describe("AC-008.1: configurar a caixa", () => {
  it("Salvar manda só assinatura, teto e intervalo daquela caixa", async () => {
    h.get.mockResolvedValue({ data: { caixas: [caixa()] } });
    h.patch.mockResolvedValue({ data: {} });
    montar();

    await screen.findByText("ana@exemplo.com");
    fireEvent.click(screen.getByRole("button", { name: "Configurar" }));
    fireEvent.change(screen.getByLabelText("Assinatura"), { target: { value: "Até logo" } });
    fireEvent.change(screen.getByLabelText("Limite por dia"), { target: { value: "80" } });
    fireEvent.change(screen.getByLabelText("Intervalo entre envios (segundos)"), { target: { value: "45" } });
    fireEvent.click(screen.getByRole("button", { name: "Salvar" }));

    await waitFor(() =>
      expect(h.patch).toHaveBeenCalledWith("/api/v1/channels/email/cx-1", {
        assinatura: "Até logo",
        teto_diario: 80,
        intervalo_segundos: 45,
      }),
    );
  });
});

describe("REQ-008: remover a caixa", () => {
  it("AC-008.2: Remover caixa pede confirmação que diz o que acontece, e só então chama a rota", async () => {
    h.get.mockResolvedValue({ data: { caixas: [caixa(), caixa({ id: "cx-2", endereco: "vendas@exemplo.com" })] } });
    h.delete.mockResolvedValue({ data: { id: "cx-2", removida: true } });
    montar();

    const vendas = (await screen.findByText("vendas@exemplo.com")).closest("[data-testid='caixa-email']") as HTMLElement;
    fireEvent.click(within(vendas).getByRole("button", { name: "Remover caixa" }));
    const dialogo = await screen.findByRole("alertdialog");
    expect(h.delete).not.toHaveBeenCalled();
    expect(dialogo.textContent).toContain("vendas@exemplo.com");
    expect(dialogo.textContent).toContain("O sistema para de ler e de enviar e-mails por esta caixa.");
    expect(dialogo.textContent).toContain("As conversas e as mensagens continuam no sistema.");
    expect(dialogo.textContent).toContain("A senha guardada é apagada.");
    expect(dialogo.textContent).toContain("Para voltar, conecte a caixa de novo com a senha.");

    fireEvent.click(within(dialogo).getByRole("button", { name: "Remover a caixa" }));

    await waitFor(() => expect(h.delete).toHaveBeenCalledWith("/api/v1/channels/email/cx-2"));
    expect(h.delete).toHaveBeenCalledTimes(1);
    await waitFor(() => expect(h.get.mock.calls.length).toBeGreaterThan(2));
  });

  it("AC-008.2: cancelar a confirmação não remove nada", async () => {
    h.get.mockResolvedValue({ data: { caixas: [caixa()] } });
    montar();

    await screen.findByText("ana@exemplo.com");
    fireEvent.click(screen.getByRole("button", { name: "Remover caixa" }));
    fireEvent.click(within(await screen.findByRole("alertdialog")).getByRole("button", { name: "Cancelar" }));

    await waitFor(() => expect(screen.queryByRole("alertdialog")).toBeNull());
    expect(h.delete).not.toHaveBeenCalled();
  });

  it("AC-008.2: remoção que falha mostra o motivo e a caixa continua na tela", async () => {
    const { toast } = await import("sonner");
    h.get.mockResolvedValue({ data: { caixas: [caixa()] } });
    h.delete.mockRejectedValue(new Error("Não foi possível remover a caixa agora. Tente de novo."));
    montar();

    await screen.findByText("ana@exemplo.com");
    fireEvent.click(screen.getByRole("button", { name: "Remover caixa" }));
    fireEvent.click(within(await screen.findByRole("alertdialog")).getByRole("button", { name: "Remover a caixa" }));

    await waitFor(() => expect(toast.error).toHaveBeenCalledWith("Não foi possível remover a caixa agora. Tente de novo."));
    expect(screen.getByText("ana@exemplo.com")).toBeTruthy();
  });
});

describe("AC-003.3: a aba traz a lista de e-mails ignorados", () => {
  it("AC-003.3: com caixa conectada a lista aparece; sem caixa nenhuma, só o assistente", async () => {
    h.get.mockImplementation(async (url: string) =>
      url.endsWith("/ignorados")
        ? { data: { ignorados: [{ id: "ign-1", caixa_id: "cx-1", remetente: "ofertas@loja.com", assunto: "Oi", recebido_em: "2026-11-03T10:00:00.000Z", motivo: "no_reply" }] } }
        : { data: { caixas: [caixa()] } },
    );
    montar();
    await screen.findByText("ofertas@loja.com");
    expect(screen.getByTestId("ignorados-email")).toBeTruthy();

    cleanup();
    h.get.mockReset();
    h.get.mockResolvedValue({ data: { caixas: [] } });
    montar();
    await screen.findByTestId("assistente-email");
    expect(screen.queryByTestId("ignorados-email")).toBeNull();
    expect(h.get).not.toHaveBeenCalledWith("/api/v1/channels/email/ignorados");
  });
});
