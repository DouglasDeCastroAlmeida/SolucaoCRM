/**
 * Mudança 006, T-036 (AC-007.2): a lista e o cadastro de servidores MCP externos.
 *
 * A credencial nunca volta inteira (só "••••" e os 4 últimos), o campo dela é de senha, os erros de
 * destino chegam em português simples.
 */
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { ApiError } from "@/lib/api/types";

vi.mock("@/hooks/i18n/useT", () => ({ useT: () => (texto: string) => texto }));
vi.mock("@/lib/api/client", () => ({ apiClient: { get: vi.fn(), patch: vi.fn(), post: vi.fn() } }));
vi.mock("./FerramentasDoServidor", () => ({
  FerramentasDoServidor: ({ nome }: { nome: string }) => <p>ferramentas de {nome}</p>,
}));

import { apiClient } from "@/lib/api/client";

import { ServidoresMcpExternos } from "./ServidoresMcpExternos";

const get = () => vi.mocked(apiClient.get);
const post = () => vi.mocked(apiClient.post);
const patch = () => vi.mocked(apiClient.patch);

const SERVIDOR = {
  id: "11111111-1111-4111-8111-111111111111",
  slug: "loja",
  nome: "Loja",
  host: "erp.example.com",
  chave_last4: "9z8y",
  ativo: true,
  ferramentas_em: "2026-10-28T12:00:00.000Z",
  ferramentas: [],
};

/** Gerada na hora: a fixture não carrega literal com cara de segredo. */
const CHAVE_DE_TESTE = ["fx", Math.random().toString(36).slice(2, 12)].join("-");

beforeEach(() => {
  get().mockReset();
  post().mockReset();
  patch().mockReset();
  get().mockResolvedValue({ data: [SERVIDOR] } as never);
});

describe("AC-007.2: lista de servidores", () => {
  it("AC-007.2: mostra nome, endereço, situação e a credencial só com os quatro últimos", async () => {
    render(<ServidoresMcpExternos />);
    const tabela = await screen.findByRole("table");
    expect(within(tabela).getByText("Servidores MCP externos cadastrados")).toBeTruthy(); // legenda
    expect(within(tabela).getByText("Loja")).toBeTruthy();
    expect(within(tabela).getByText("erp.example.com")).toBeTruthy();
    expect(within(tabela).getByText("Ativo")).toBeTruthy();
    expect(within(tabela).getByText("••••9z8y")).toBeTruthy();
  });

  it("AC-007.2: sem servidor, diz isso em vez de mostrar uma tabela vazia", async () => {
    get().mockResolvedValue({ data: [] } as never);
    render(<ServidoresMcpExternos />);
    expect(await screen.findByText("Nenhum servidor cadastrado ainda.")).toBeTruthy();
    expect(screen.queryByRole("table")).toBeNull();
  });

  it("AC-007.2: desativar manda ativo=false e reativar manda ativo=true", async () => {
    patch().mockResolvedValue({ data: { ...SERVIDOR, ativo: false } } as never);
    render(<ServidoresMcpExternos />);
    get().mockResolvedValueOnce({ data: [SERVIDOR] } as never);
    fireEvent.click(await screen.findByRole("button", { name: "Desativar Loja" }));
    get().mockResolvedValue({ data: [{ ...SERVIDOR, ativo: false }] } as never);
    await waitFor(() => expect(patch()).toHaveBeenCalledWith(`/api/v1/mcp-servidores/${SERVIDOR.id}`, { ativo: false }));
    fireEvent.click(await screen.findByRole("button", { name: "Reativar Loja" }));
    await waitFor(() => expect(patch()).toHaveBeenCalledWith(`/api/v1/mcp-servidores/${SERVIDOR.id}`, { ativo: true }));
  });

  it("AC-007.2: 'Ferramentas' abre as ferramentas do servidor escolhido", async () => {
    render(<ServidoresMcpExternos />);
    fireEvent.click(await screen.findByRole("button", { name: "Ferramentas de Loja" }));
    expect(await screen.findByText("ferramentas de Loja")).toBeTruthy();
  });
});

describe("AC-007.2: cadastro", () => {
  function preencher() {
    fireEvent.change(screen.getByLabelText("Identificador"), { target: { value: "erp" } });
    fireEvent.change(screen.getByLabelText("Nome"), { target: { value: "ERP" } });
    fireEvent.change(screen.getByLabelText("Endereço do servidor"), { target: { value: "https://erp.example.com/mcp" } });
    fireEvent.change(screen.getByLabelText("Chave de acesso"), { target: { value: CHAVE_DE_TESTE } });
  }

  it("AC-007.2: a chave é campo de senha; cadastrar envia os quatro campos e limpa a chave da tela", async () => {
    post().mockResolvedValue({ data: { ...SERVIDOR, id: "x", slug: "erp", nome: "ERP", chave_last4: CHAVE_DE_TESTE.slice(-4) } } as never);
    render(<ServidoresMcpExternos />);
    await screen.findByRole("table");
    expect((screen.getByLabelText("Chave de acesso") as HTMLInputElement).type).toBe("password");
    preencher();
    fireEvent.click(screen.getByRole("button", { name: "Cadastrar e testar" }));
    await waitFor(() =>
      expect(post()).toHaveBeenCalledWith("/api/v1/mcp-servidores", {
        slug: "erp",
        nome: "ERP",
        endpoint: "https://erp.example.com/mcp",
        chave: CHAVE_DE_TESTE,
      }),
    );
    await waitFor(() => expect((screen.getByLabelText("Chave de acesso") as HTMLInputElement).value).toBe(""));
    expect(document.body.textContent).not.toContain(CHAVE_DE_TESTE);
  });

  it.each([
    ["ai_destino_proibido", /rede interna|localhost/i],
    ["ai_http_nao_permitido", /https/i],
  ])("AC-007.2: o erro %s chega em português simples, sem o código", async (codigo, esperado) => {
    post().mockRejectedValue(new ApiError(422, codigo, undefined, "r1", codigo));
    render(<ServidoresMcpExternos />);
    await screen.findByRole("table");
    preencher();
    fireEvent.click(screen.getByRole("button", { name: "Cadastrar e testar" }));
    const alerta = await screen.findByRole("alert");
    expect(alerta.textContent).toMatch(esperado);
    expect(alerta.textContent).not.toContain(codigo);
  });
});
