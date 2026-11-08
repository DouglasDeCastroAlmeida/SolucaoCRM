/**
 * Prototipo do Inbox no laboratorio de design (#115, spec #112). Seam: a pagina estatica renderizada
 * com os dados de exemplo. Cada teste guarda uma decisao do grill sobre a FORMA da tela.
 */
import { render, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { PrototipoDoInbox } from "./PrototipoDoInbox";

describe("PrototipoDoInbox", () => {
  it("a lista tem busca sozinha e UMA linha rolavel de chips", () => {
    render(<PrototipoDoInbox />);
    const busca = screen.getByRole("searchbox");
    expect(busca.parentElement?.className).toContain("rounded-full");
    const chips = screen.getByTestId("proto-chips");
    expect(chips.className).toContain("overflow-x-auto");
    expect(chips.className).toContain("flex-nowrap");
    expect(chips.contains(busca)).toBe(false);
    expect(screen.getByRole("button", { name: "Filtrar por tag e atendente" })).toBeTruthy();
  });

  it("a linha selecionada e cinza neutro e a nao lida tem hora verde e contador", () => {
    render(<PrototipoDoInbox />);
    const selecionada = screen.getByTestId("proto-linha-selecionada");
    expect(selecionada.className).toContain("bg-selected");
    expect(selecionada.className).not.toContain("accent");
    const naoLida = screen.getByTestId("proto-linha-nao-lida");
    expect(within(naoLida).getByTestId("proto-hora").className).toContain("text-accent");
    expect(within(naoLida).getByTestId("proto-contador").textContent).toBe("3");
  });

  it("o cabecalho da conversa tem avatar, nome, UM subtitulo e tres icones", () => {
    render(<PrototipoDoInbox />);
    const cab = screen.getByTestId("proto-cabecalho");
    expect(within(cab).getAllByRole("button")).toHaveLength(3);
    expect(within(cab).getByRole("button", { name: "Buscar na conversa" })).toBeTruthy();
    expect(within(cab).getByRole("button", { name: "Ver contato" })).toBeTruthy();
    expect(within(cab).getByRole("button", { name: "Mais ações" })).toBeTruthy();
    expect(within(cab).getAllByTestId("proto-subtitulo")).toHaveLength(1);
    expect(cab.className).toContain("h-[60px]");
  });

  it("o menu de mais acoes so aparece na variante aberta", () => {
    const { rerender } = render(<PrototipoDoInbox />);
    expect(screen.queryByRole("menu")).toBeNull();
    rerender(<PrototipoDoInbox menuAberto />);
    expect(within(screen.getByRole("menu")).getAllByRole("menuitem").length).toBeGreaterThan(4);
  });

  it("as bolhas tem raio de 8px, pontinha, hora pequena e tique lido azul", () => {
    render(<PrototipoDoInbox />);
    const enviada = screen.getByTestId("proto-bolha-enviada");
    expect(enviada.className).toContain("rounded-[8px]");
    expect(enviada.className).toContain("bg-bubble-out");
    expect(within(enviada).getByTestId("balao-pontinha")).toBeTruthy();
    expect(within(enviada).getByTestId("proto-hora-bolha").className).toContain("text-[11px]");
    expect(within(enviada).getByTestId("proto-tique-lido").getAttribute("class")).toContain("text-tick-read");
    expect(screen.getByTestId("proto-bolha-recebida").className).toContain("bg-bubble-in");
    expect(screen.getByTestId("proto-separador-de-data").className).toContain("rounded-lg");
    expect(screen.getByTestId("proto-midia")).toBeTruthy();
  });

  it("a area de escrever e de uma linha, com enviar em circulo verde de 40px", () => {
    render(<PrototipoDoInbox />);
    const barra = screen.getByTestId("proto-escrever");
    expect(within(barra).getByRole("textbox").tagName).toBe("INPUT");
    expect(within(barra).getByRole("button", { name: "Emoji" })).toBeTruthy();
    expect(within(barra).getByRole("button", { name: "Anexar" })).toBeTruthy();
    const mic = within(barra).getByRole("button", { name: "Gravar áudio" });
    expect(mic.className).toContain("size-10");
    expect(mic.className).toContain("rounded-full");
    expect(mic.className).toContain("bg-accent");
  });

  it("o painel Dados do contato aparece na vista de contato", () => {
    render(<PrototipoDoInbox />);
    expect(screen.getByTestId("proto-painel-contato")).toBeTruthy();
    expect(screen.getByText("Dados do contato")).toBeTruthy();
  });
});
