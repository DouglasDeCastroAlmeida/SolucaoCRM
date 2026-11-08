/**
 * Separador de data da conversa (#89): pilula centralizada ("Hoje", "Ontem", data), no visual de
 * mensageiro. O texto vem do rotulo do dia; a pilula e uma superficie opaca (legivel sobre o
 * padrao do fundo), nunca transparente.
 */
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { SeparadorDeData } from "./SeparadorDeData";

describe("SeparadorDeData", () => {
  it("mostra o rotulo do dia centralizado em pilula", () => {
    const { container } = render(<SeparadorDeData rotulo="Hoje" />);
    const pilula = screen.getByText("Hoje");
    expect(pilula.className).toContain("rounded-full");
    expect(container.firstElementChild?.className).toContain("justify-center");
  });

  it("a pilula e opaca (card) e com texto legivel, para ler sobre o padrao do fundo", () => {
    render(<SeparadorDeData rotulo="Ontem" />);
    const cls = screen.getByText("Ontem").className;
    expect(cls).toContain("bg-card");
    expect(cls).toContain("text-muted-foreground");
    expect(cls).not.toContain("backdrop-blur");
  });

  it("fica grudado no topo ao rolar o dia (sticky)", () => {
    const { container } = render(<SeparadorDeData rotulo="12/09/2026" />);
    expect(container.firstElementChild?.className).toContain("sticky");
  });
});
