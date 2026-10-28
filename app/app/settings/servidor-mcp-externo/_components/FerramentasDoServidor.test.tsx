/**
 * Mudança 006, T-036 (AC-007.2 e AC-007.4): as ferramentas de um servidor MCP externo, por agente.
 *
 * - todas nascem DESLIGADAS e o admin liga, por agente, só as que quer;
 * - ligar edita o RASCUNHO do agente, e a tela avisa que vale ao publicar;
 * - "pode rodar sem aprovação" existe só para ferramenta de ESCRITA, fica atrás de um diálogo com
 *   o aviso do risco, e a confirmação segue no corpo da chamada.
 */
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { ApiError } from "@/lib/api/types";

vi.mock("@/hooks/i18n/useT", () => ({ useT: () => (texto: string) => texto }));
vi.mock("@/lib/api/client", () => ({ apiClient: { get: vi.fn(), patch: vi.fn(), post: vi.fn() } }));

import { apiClient } from "@/lib/api/client";

import { FerramentasDoServidor } from "./FerramentasDoServidor";

const SERVIDOR = "11111111-1111-4111-8111-111111111111";
const AGENTE = "22222222-2222-4222-8222-222222222222";

const get = () => vi.mocked(apiClient.get);
const patch = () => vi.mocked(apiClient.patch);
const post = () => vi.mocked(apiClient.post);

function ferramentas(sobrescreve: Record<string, unknown> = {}) {
  return {
    data: {
      servidor_id: SERVIDOR,
      agente_id: AGENTE,
      versao: "rascunho",
      modo_do_agente: "assisted",
      ferramentas: [
        { nome: "buscar_pedido", descricao: "Consulta um pedido", somente_leitura: true, ligada: false, marca: null, liberada_sem_aprovacao: false },
        { nome: "criar_pedido", descricao: "Cria um pedido", somente_leitura: false, ligada: false, marca: null, liberada_sem_aprovacao: false },
      ],
      ...sobrescreve,
    },
  };
}

function rota(url: string): unknown {
  if (url.startsWith("/api/v1/ai/agents")) return { data: [{ id: AGENTE, name: "Atendente" }] };
  if (url.startsWith(`/api/v1/mcp-servidores/${SERVIDOR}/ferramentas`)) return ferramentas();
  throw new Error(`rota inesperada ${url}`);
}

async function abrirComAgente() {
  render(<FerramentasDoServidor servidorId={SERVIDOR} nome="Loja" ativo />);
  const seletor = await screen.findByLabelText("Agente");
  fireEvent.change(seletor, { target: { value: AGENTE } });
  await screen.findByText("buscar_pedido");
}

beforeEach(() => {
  get().mockReset();
  patch().mockReset();
  post().mockReset();
  get().mockImplementation(async (url: string) => rota(url) as never);
  patch().mockResolvedValue({ data: {} } as never);
});

describe("AC-007.2: ferramentas nascem desligadas e ligam por agente", () => {
  it("AC-007.2: mostra todas as ferramentas desligadas, com selo de Leitura e de Escrita", async () => {
    await abrirComAgente();
    const ligar = screen.getAllByRole("switch", { name: /^Ligar / });
    expect(ligar).toHaveLength(2);
    for (const interruptor of ligar) expect(interruptor.getAttribute("aria-checked")).toBe("false");
    expect(screen.getByText("Leitura")).toBeTruthy();
    expect(screen.getByText("Escrita")).toBeTruthy();
  });

  it("AC-007.2: ligar manda a ação 'ligar' para o agente escolhido e avisa que vale ao publicar", async () => {
    await abrirComAgente();
    expect(screen.getByText(/só vale quando você publicar/i)).toBeTruthy();
    // Depois de gravar, a tela relê a lista: o servidor agora devolve a ferramenta ligada.
    get().mockImplementation(async (url: string) =>
      url.startsWith("/api/v1/ai/agents")
        ? ({ data: [{ id: AGENTE, name: "Atendente" }] } as never)
        : (ferramentas({
            ferramentas: [
              { nome: "buscar_pedido", somente_leitura: true, ligada: true, marca: "leitura", liberada_sem_aprovacao: false },
            ],
          }) as never),
    );
    fireEvent.click(screen.getByRole("switch", { name: "Ligar buscar_pedido" }));
    await waitFor(() =>
      expect(patch()).toHaveBeenCalledWith(`/api/v1/mcp-servidores/${SERVIDOR}/ferramentas`, {
        acao: "ligar",
        agente_id: AGENTE,
        ferramenta: "buscar_pedido",
        marca: "leitura",
      }),
    );
    await waitFor(() =>
      expect(screen.getByRole("switch", { name: "Ligar buscar_pedido" }).getAttribute("aria-checked")).toBe("true"),
    );
  });

  it("AC-007.2: agente sem rascunho (409) recebe uma mensagem que diz o que fazer, sem código interno", async () => {
    patch().mockRejectedValue(new ApiError(409, "mcp_sem_rascunho", undefined, "r1", "texto do servidor"));
    await abrirComAgente();
    fireEvent.click(screen.getByRole("switch", { name: "Ligar criar_pedido" }));
    const alerta = await screen.findByRole("alert");
    expect(alerta.textContent).toMatch(/não tem um rascunho/i);
    expect(alerta.textContent).not.toMatch(/mcp_sem_rascunho/);
    expect(screen.getByRole("switch", { name: "Ligar criar_pedido" }).getAttribute("aria-checked")).toBe("false");
  });
});

describe("AC-007.4: rodar sem aprovação só para escrita, atrás de aviso", () => {
  it("AC-007.4: a opção não existe para ferramenta de leitura", async () => {
    await abrirComAgente();
    expect(screen.queryByRole("switch", { name: "Deixar buscar_pedido rodar sem aprovação" })).toBeNull();
    expect(screen.getByRole("switch", { name: "Deixar criar_pedido rodar sem aprovação" })).toBeTruthy();
  });

  it("AC-007.4: marcar abre o diálogo de aviso e só envia depois de confirmar, com a confirmação no corpo", async () => {
    await abrirComAgente();
    fireEvent.click(screen.getByRole("switch", { name: "Deixar criar_pedido rodar sem aprovação" }));
    const dialogo = await screen.findByRole("alertdialog");
    expect(within(dialogo).getByText(/sozinho/i)).toBeTruthy();
    expect(within(dialogo).getByText(/modo automático/i)).toBeTruthy();
    expect(patch()).not.toHaveBeenCalled();

    fireEvent.click(within(dialogo).getByRole("button", { name: "Entendi o risco, liberar" }));
    await waitFor(() =>
      expect(patch()).toHaveBeenCalledWith(`/api/v1/mcp-servidores/${SERVIDOR}/ferramentas`, {
        acao: "liberar_sem_aprovacao",
        agente_id: AGENTE,
        ferramenta: "criar_pedido",
        confirmar_sem_aprovacao: true,
      }),
    );
  });

  it("AC-007.4: cancelar o diálogo não envia nada", async () => {
    await abrirComAgente();
    fireEvent.click(screen.getByRole("switch", { name: "Deixar criar_pedido rodar sem aprovação" }));
    const dialogo = await screen.findByRole("alertdialog");
    fireEvent.click(within(dialogo).getByRole("button", { name: "Cancelar" }));
    expect(patch()).not.toHaveBeenCalled();
  });

  it("AC-007.4: voltar a exigir aprovação não pede confirmação", async () => {
    get().mockImplementation(async (url: string) =>
      url.startsWith("/api/v1/ai/agents")
        ? ({ data: [{ id: AGENTE, name: "Atendente" }] } as never)
        : (ferramentas({
            ferramentas: [
              { nome: "criar_pedido", somente_leitura: false, ligada: true, marca: "escrita", liberada_sem_aprovacao: true },
            ],
          }) as never),
    );
    render(<FerramentasDoServidor servidorId={SERVIDOR} nome="Loja" ativo />);
    fireEvent.change(await screen.findByLabelText("Agente"), { target: { value: AGENTE } });
    fireEvent.click(await screen.findByRole("switch", { name: "Deixar criar_pedido rodar sem aprovação" }));
    await waitFor(() =>
      expect(patch()).toHaveBeenCalledWith(`/api/v1/mcp-servidores/${SERVIDOR}/ferramentas`, {
        acao: "exigir_aprovacao",
        agente_id: AGENTE,
        ferramenta: "criar_pedido",
      }),
    );
  });
});

describe("Atualizar ferramentas", () => {
  it("mostra o que mudou (novas, removidas, alteradas) depois do clique do admin e diz que as novas nascem desligadas", async () => {
    post().mockResolvedValue({
      data: {
        servidor: { id: SERVIDOR },
        mudancas: { novas: ["cancelar_pedido"], removidas: ["antiga"], alteradas: ["criar_pedido"] },
      },
    } as never);
    await abrirComAgente();
    fireEvent.click(screen.getByRole("button", { name: "Atualizar ferramentas" }));
    const resumo = await screen.findByTestId("mudancas");
    expect(post()).toHaveBeenCalledWith(`/api/v1/mcp-servidores/${SERVIDOR}/atualizar-ferramentas`, {});
    expect(resumo.textContent).toContain("cancelar_pedido");
    expect(resumo.textContent).toContain("antiga");
    expect(resumo.textContent).toContain("criar_pedido");
    expect(resumo.textContent).toMatch(/desligadas/i);
  });
});
