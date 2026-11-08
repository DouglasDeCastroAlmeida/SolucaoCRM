/**
 * Audio no formato do mensageiro (#89): botao redondo de tocar, onda de barras que vai se
 * preenchendo com o progresso, e o tempo embaixo. O controle de busca (range) continua para teclado
 * e leitor de tela.
 */
import { act, render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { AudioPlayer } from "./AudioPlayer";

function tocadas(): number {
  return screen.getAllByTestId("barra-do-audio").filter((b) => b.getAttribute("data-tocada") === "true").length;
}

describe("AudioPlayer - formato do mensageiro", () => {
  it("mostra o botao de tocar e a onda de barras, sem nenhuma tocada no inicio", () => {
    render(<AudioPlayer messageId="m1" isOutbound={false} />);
    expect(screen.getByLabelText("Reproduzir áudio")).toBeTruthy();
    expect(screen.getAllByTestId("barra-do-audio").length).toBeGreaterThanOrEqual(24);
    expect(tocadas()).toBe(0);
  });

  it("a onda e a mesma para a mesma mensagem e muda de uma mensagem para outra", () => {
    const alturas = () => screen.getAllByTestId("barra-do-audio").map((b) => b.getAttribute("data-altura")).join(",");
    const { unmount } = render(<AudioPlayer messageId="m1" isOutbound={false} />);
    const a = alturas();
    unmount();
    const { unmount: u2 } = render(<AudioPlayer messageId="m1" isOutbound={false} />);
    expect(alturas()).toBe(a);
    u2();
    render(<AudioPlayer messageId="outra" isOutbound={false} />);
    expect(alturas()).not.toBe(a);
  });

  it("as barras se preenchem conforme o tempo avanca", () => {
    const { container } = render(<AudioPlayer messageId="m1" isOutbound />);
    const audio = container.querySelector("audio")!;
    Object.defineProperty(audio, "duration", { value: 10, configurable: true });
    Object.defineProperty(audio, "currentTime", { value: 5, configurable: true, writable: true });
    act(() => {
      audio.dispatchEvent(new Event("loadedmetadata"));
      audio.dispatchEvent(new Event("timeupdate"));
    });
    const total = screen.getAllByTestId("barra-do-audio").length;
    expect(tocadas()).toBeGreaterThanOrEqual(Math.floor(total / 2) - 1);
    expect(tocadas()).toBeLessThanOrEqual(Math.ceil(total / 2) + 1);
    expect(screen.getByText("0:05")).toBeTruthy();
  });

  it("o controle de busca continua acessivel", () => {
    render(<AudioPlayer messageId="m1" isOutbound={false} />);
    expect(screen.getByLabelText("Progresso do áudio")).toBeTruthy();
  });
});
