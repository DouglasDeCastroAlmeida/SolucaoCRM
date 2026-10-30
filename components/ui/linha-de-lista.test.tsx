import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { LinhaDeLista } from "./linha-de-lista";

afterEach(() => cleanup());

function renderLinha(props: Partial<React.ComponentProps<typeof LinhaDeLista>> = {}) {
  return render(
    <ul>
      <LinhaDeLista
        avatar={{ nome: "Maria Souza" }}
        titulo="Maria Souza"
        previa={<span>maria@exemplo.com</span>}
        direita={<span>ontem</span>}
        {...props}
      />
    </ul>,
  );
}

describe("LinhaDeLista", () => {
  it("AC-004.1: mostra avatar com iniciais, título, prévia e direita num item de lista", () => {
    renderLinha();
    expect(screen.getByRole("listitem")).toBeInTheDocument();
    expect(screen.getByText("MS")).toBeInTheDocument();
    expect(screen.getByText("Maria Souza")).toBeInTheDocument();
    expect(screen.getByText("maria@exemplo.com")).toBeInTheDocument();
    expect(screen.getByText("ontem")).toBeInTheDocument();
  });

  it("AC-004.2: href vira link, onClick vira botão e as ações ficam fora do alvo", async () => {
    const user = userEvent.setup();
    const aoAgir = vi.fn();
    const aoClicar = vi.fn();
    renderLinha({
      onClick: aoClicar,
      children: <button type="button" onClick={aoAgir}>Agir</button>,
    });
    await user.click(screen.getByRole("button", { name: "Agir" }));
    expect(aoAgir).toHaveBeenCalledTimes(1);
    expect(aoClicar).not.toHaveBeenCalled();
    await user.click(screen.getByRole("button", { name: /Maria Souza/ }));
    expect(aoClicar).toHaveBeenCalledTimes(1);
  });

  it("AC-004.2: com href o alvo é um link", () => {
    renderLinha({ href: "/app/contacts/1" });
    expect(screen.getByRole("link", { name: /Maria Souza/ })).toHaveAttribute("href", "/app/contacts/1");
  });

  it("AC-004.2: a caixa de seleção só existe com onSelecionar e reflete o estado recebido", async () => {
    const user = userEvent.setup();
    const onSelecionar = vi.fn();
    renderLinha();
    expect(screen.queryByRole("checkbox")).toBeNull();
    cleanup();
    renderLinha({ onSelecionar, selecionado: true, rotuloDaSelecao: "Selecionar Maria" });
    const caixa = screen.getByRole("checkbox", { name: "Selecionar Maria" });
    expect(caixa).toHaveAttribute("aria-checked", "true");
    await user.click(caixa);
    expect(onSelecionar).toHaveBeenCalledTimes(1);
  });

  it("AC-004.1: só tokens de cor (nenhum hex) e alvo de toque de 44 px", () => {
    const { container } = renderLinha({ href: "/x", onSelecionar: () => {} });
    expect(container.innerHTML).not.toMatch(/#[0-9a-fA-F]{3,8}\b/);
    const alvo = screen.getByRole("link");
    expect(alvo.className).toContain("min-h-[44px]");
    expect(alvo.className).toContain("focus-visible:ring-2");
  });
});
