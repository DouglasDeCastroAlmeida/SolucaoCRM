import { beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";

import { AssistenteDeConexao } from "./AssistenteDeConexao";

const h = vi.hoisted(() => ({ post: vi.fn() }));
vi.mock("@/lib/api/client", () => ({ apiClient: { post: h.post } }));
vi.mock("@/hooks/i18n/useT", () => ({ useT: () => (s: string) => s }));
vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

beforeEach(() => {
  cleanup();
  vi.clearAllMocks();
});

const preencher = (rotulo: string | RegExp, valor: string) =>
  fireEvent.change(screen.getByLabelText(rotulo), { target: { value: valor } });

describe("assistente de conexão da caixa de e-mail", () => {
  it("AC-001.1: ao escolher Gmail, os servidores já vêm preenchidos e os passos da senha de app aparecem", () => {
    render(<AssistenteDeConexao onConectada={vi.fn()} />);
    fireEvent.click(screen.getByRole("button", { name: "Gmail" }));

    expect(screen.getByText(/imap\.gmail\.com/)).toBeTruthy();
    expect(screen.getByText(/smtp\.gmail\.com/)).toBeTruthy();
    const passos = screen.getByRole("list", { name: "Como criar a senha de app" });
    const itens = within(passos).getAllByRole("listitem");
    expect(itens).toHaveLength(3);
    expect(itens[0]?.textContent).toMatch(/verificação em duas etapas/i);
    expect(itens[1]?.textContent).toMatch(/senha de app/i);
    expect(itens[2]?.textContent).toMatch(/copie/i);
    // No Gmail a pessoa não preenche servidor nenhum.
    expect(screen.queryByLabelText("Servidor de leitura")).toBeNull();
  });

  it("AC-001.2: em Outro provedor pede servidor, porta, segurança, usuário e senha de leitura e envio", () => {
    render(<AssistenteDeConexao onConectada={vi.fn()} />);
    fireEvent.click(screen.getByRole("button", { name: "Outro provedor" }));

    for (const rotulo of [
      "Servidor de leitura",
      "Porta de leitura",
      "Segurança da leitura",
      "Servidor de envio",
      "Porta de envio",
      "Segurança do envio",
      "Usuário",
      "Senha",
    ]) {
      expect(screen.getByLabelText(rotulo)).toBeTruthy();
    }
    expect(screen.queryByRole("list", { name: "Como criar a senha de app" })).toBeNull();
  });

  it("AC-001.3: Conectar só é liberado depois de um teste que deu certo", async () => {
    h.post.mockResolvedValue({ data: { ok: true, teste_enviado: true } });
    render(<AssistenteDeConexao onConectada={vi.fn()} />);
    fireEvent.click(screen.getByRole("button", { name: "Gmail" }));
    preencher("Endereço de e-mail", "ana@gmail.com");
    preencher("Senha de app", "abcd efgh ijkl mnop");

    const conectar = screen.getByRole("button", { name: "Conectar" }) as HTMLButtonElement;
    expect(conectar.disabled).toBe(true);

    fireEvent.click(screen.getByRole("button", { name: "Testar" }));
    await screen.findByText(/enviamos um e-mail de teste/i);

    expect(h.post).toHaveBeenCalledWith(
      "/api/v1/channels/email/testar",
      {
        endereco: "ana@gmail.com",
        usuario: "ana@gmail.com",
        senha: "abcd efgh ijkl mnop",
        imap: { host: "imap.gmail.com", porta: 993, seguranca: "ssl" },
        smtp: { host: "smtp.gmail.com", porta: 465, seguranca: "ssl" },
      },
      expect.objectContaining({ timeoutMs: expect.any(Number) }),
    );
    expect((screen.getByRole("button", { name: "Conectar" }) as HTMLButtonElement).disabled).toBe(false);
  });

  it("AC-001.3: mudar qualquer campo depois do teste exige testar de novo", async () => {
    h.post.mockResolvedValue({ data: { ok: true, teste_enviado: true } });
    render(<AssistenteDeConexao onConectada={vi.fn()} />);
    fireEvent.click(screen.getByRole("button", { name: "Gmail" }));
    preencher("Endereço de e-mail", "ana@gmail.com");
    preencher("Senha de app", "abcdefghijklmnop");
    fireEvent.click(screen.getByRole("button", { name: "Testar" }));
    await screen.findByText(/enviamos um e-mail de teste/i);

    preencher("Senha de app", "outrasenhaoutra12");

    expect((screen.getByRole("button", { name: "Conectar" }) as HTMLButtonElement).disabled).toBe(true);
    expect(screen.queryByText(/enviamos um e-mail de teste/i)).toBeNull();
  });

  it("AC-001.4: teste que falha mostra a causa em português e mantém Conectar bloqueado", async () => {
    const { ApiError } = await import("@/lib/api/types");
    h.post.mockRejectedValue(
      new ApiError(422, "email_conexao_recusada", { causa: "senha_recusada" }, "req-1", "O servidor recusou o usuário ou a senha."),
    );
    render(<AssistenteDeConexao onConectada={vi.fn()} />);
    fireEvent.click(screen.getByRole("button", { name: "Outro provedor" }));
    preencher("Endereço de e-mail", "ana@exemplo.com");
    preencher("Senha", "segredo-qualquer");
    preencher("Servidor de leitura", "imap.exemplo.com");
    preencher("Servidor de envio", "smtp.exemplo.com");
    fireEvent.click(screen.getByRole("button", { name: "Testar" }));

    const alerta = await screen.findByRole("alert");
    expect(alerta.textContent).toContain("O servidor recusou o usuário ou a senha.");
    expect((screen.getByRole("button", { name: "Conectar" }) as HTMLButtonElement).disabled).toBe(true);
  });

  it("AC-001.4: Conectar que falha tira o aviso verde 'Deu certo', mostra só o erro e exige testar de novo", async () => {
    const { ApiError } = await import("@/lib/api/types");
    h.post.mockResolvedValueOnce({ data: { ok: true, teste_enviado: true } });
    render(<AssistenteDeConexao onConectada={vi.fn()} />);
    fireEvent.click(screen.getByRole("button", { name: "Gmail" }));
    preencher("Endereço de e-mail", "ana@gmail.com");
    preencher("Senha de app", "abcdefghijklmnop");
    fireEvent.click(screen.getByRole("button", { name: "Testar" }));
    await screen.findByText(/enviamos um e-mail de teste/i);

    h.post.mockRejectedValueOnce(
      new ApiError(422, "invalid_request", undefined, "req-2", "Não foi possível guardar a senha com segurança neste servidor."),
    );
    fireEvent.click(screen.getByRole("button", { name: "Conectar" }));

    const alerta = await screen.findByRole("alert");
    expect(alerta.textContent).toContain("Não foi possível guardar a senha com segurança neste servidor.");
    expect(screen.queryByText(/enviamos um e-mail de teste/i)).toBeNull();
    expect((screen.getByRole("button", { name: "Conectar" }) as HTMLButtonElement).disabled).toBe(true);
  });

  it("AC-001.3: Testar fica bloqueado enquanto faltam endereço, senha ou servidor", () => {
    render(<AssistenteDeConexao onConectada={vi.fn()} />);
    fireEvent.click(screen.getByRole("button", { name: "Outro provedor" }));

    expect((screen.getByRole("button", { name: "Testar" }) as HTMLButtonElement).disabled).toBe(true);
  });

  it("AC-001.5: conectar manda o mesmo conteúdo testado, com a assinatura, e avisa a tela", async () => {
    h.post.mockResolvedValue({ data: { ok: true, teste_enviado: true } });
    const aoConectar = vi.fn();
    render(<AssistenteDeConexao onConectada={aoConectar} />);
    fireEvent.click(screen.getByRole("button", { name: "Gmail" }));
    preencher("Endereço de e-mail", "ana@gmail.com");
    preencher("Senha de app", "abcdefghijklmnop");
    preencher("Assinatura (opcional)", "Ana, Corretora");
    fireEvent.click(screen.getByRole("button", { name: "Testar" }));
    await screen.findByText(/enviamos um e-mail de teste/i);

    h.post.mockResolvedValue({ data: { id: "cx-1" } });
    fireEvent.click(screen.getByRole("button", { name: "Conectar" }));

    await waitFor(() => expect(aoConectar).toHaveBeenCalledTimes(1));
    expect(h.post).toHaveBeenLastCalledWith(
      "/api/v1/channels/email",
      expect.objectContaining({
        endereco: "ana@gmail.com",
        senha: "abcdefghijklmnop",
        assinatura: "Ana, Corretora",
        imap: { host: "imap.gmail.com", porta: 993, seguranca: "ssl" },
      }),
      expect.anything(),
    );
  });

  it("AC-007.1: a senha fica em campo de senha, sem preenchimento automático", () => {
    render(<AssistenteDeConexao onConectada={vi.fn()} />);
    fireEvent.click(screen.getByRole("button", { name: "Gmail" }));
    const campo = screen.getByLabelText("Senha de app") as HTMLInputElement;
    expect(campo.type).toBe("password");
    expect(campo.autocomplete).toBe("off");
  });
});
