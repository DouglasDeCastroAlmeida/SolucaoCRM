/**
 * AC-004.1 e AC-004.2: o selo "confirmado pelo cliente" (com a hora) e a
 * pendência "pediu para remarcar" que a equipe vê na agenda e no histórico do
 * contato. Texto + ícone (nunca só cor) e papel acessível para leitor de tela.
 */
import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

vi.mock("@/hooks/i18n/useT", () => ({ useT: () => (s: string) => s }));
vi.mock("@/hooks/i18n/useLocaleDeData", () => ({ useTagDeIdioma: () => "pt-BR" }));

import { SeloDaConfirmacaoDoCliente } from "./SeloDaConfirmacaoDoCliente";

describe("SeloDaConfirmacaoDoCliente", () => {
  it("AC-004.1: com a confirmação, mostra o texto e a hora no fuso da organização", () => {
    render(
      <SeloDaConfirmacaoDoCliente
        confirmadoEm="2026-10-27T15:30:00Z"
        pediuRemarcarEm={null}
        fuso="America/Sao_Paulo"
      />,
    );

    const selo = screen.getByTestId("selo-confirmado-pelo-cliente");
    expect(selo.textContent).toContain("Confirmado pelo cliente");
    expect(selo.textContent).toContain("12:30");
  });

  it("AC-004.2: com o pedido de remarcar, destaca a pendência com papel de status", () => {
    render(
      <SeloDaConfirmacaoDoCliente
        confirmadoEm={null}
        pediuRemarcarEm="2026-10-27T15:30:00Z"
        fuso="America/Sao_Paulo"
      />,
    );

    const pendencia = screen.getByRole("status");
    expect(pendencia.textContent).toContain("Pediu para remarcar");
    expect(pendencia.textContent).toContain("12:30");
    expect(screen.queryByTestId("selo-confirmado-pelo-cliente")).toBeNull();
  });

  it("AC-004.1: o ícone é decorativo (o texto carrega o sentido)", () => {
    const { container } = render(
      <SeloDaConfirmacaoDoCliente
        confirmadoEm="2026-10-27T15:30:00Z"
        pediuRemarcarEm={null}
        fuso="America/Sao_Paulo"
      />,
    );

    const icone = container.querySelector("svg");
    expect(icone?.getAttribute("aria-hidden")).toBe("true");
  });

  it("AC-004.1: sem nenhum dos dois, não desenha nada", () => {
    const { container } = render(
      <SeloDaConfirmacaoDoCliente confirmadoEm={null} pediuRemarcarEm={null} fuso="UTC" />,
    );

    expect(container.firstChild).toBeNull();
  });
});
