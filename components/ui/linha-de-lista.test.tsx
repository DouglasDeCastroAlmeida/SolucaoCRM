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

  it("AC-004.2: no celular as ações ficam em fileira própria e a prévia/título ocupam a largura, sem sobrepor", () => {
    const { container } = renderLinha({
      href: "/x",
      onSelecionar: () => {},
      children: <button type="button">Editar</button>,
    });
    const li = container.querySelector("li") as HTMLElement;
    expect(li.className).toContain("flex-wrap");
    expect(li.className).toContain("sm:flex-nowrap");
    const acoes = screen.getByRole("button", { name: "Editar" }).parentElement as HTMLElement;
    expect(acoes.className).toContain("w-full");
    expect(acoes.className).toContain("sm:w-auto");
    // título e "direita" empilham no celular (nome sempre visível) e só lado a lado de sm para cima
    const titulo = screen.getByText("Maria Souza", { selector: "span.truncate" }).parentElement as HTMLElement;
    expect(titulo.className).toContain("flex-col");
    expect(titulo.className).toContain("sm:flex-row");
  });

  it("AC-004.2: a caixa de seleção tem área de toque de pelo menos 44 px (16 + 2x16 de pseudo-elemento)", () => {
    renderLinha({ href: "/x", onSelecionar: () => {} });
    expect(screen.getByRole("checkbox").className).toContain("before:-inset-4");
  });
});
