import { render, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import type { UsoDoPeriodo } from "@/lib/ai/orcamento/uso-por-agente";

import { UsoPorAgente } from "./_uso-por-agente";

function uso(sobre: Partial<UsoDoPeriodo> = {}): UsoDoPeriodo {
  return {
    tetoCents: 5000,
    total: { agentId: null, nome: "", tokens: 5000, custoCents: 1200, estimado: false },
    porAgente: [
      { agentId: "a1", nome: "Atendimento", tokens: 3500, custoCents: 900, estimado: false },
      { agentId: "a2", nome: "Vendas", tokens: 1500, custoCents: 300, estimado: false },
    ],
    ...sobre,
  };
}

describe("AC-004.4: tela de uso por agente e total", () => {
  it("AC-004.4: mostra o teto do período e uma linha por agente com tokens e custo em dólar", () => {
    render(<UsoPorAgente uso={uso()} />);

    expect(screen.getByTestId("uso-teto").textContent).toContain("US$");
    expect(screen.getByTestId("uso-teto").textContent).toContain("50,00");
    const linha = screen.getByTestId("uso-agente-a1");
    expect(within(linha).getByText("Atendimento")).toBeInTheDocument();
    expect(linha.textContent).toContain("3.500");
    expect(linha.textContent).toContain("9,00");
    expect(screen.getByTestId("uso-agente-a2").textContent).toContain("3,00");
  });

  it("AC-004.4: a linha do total soma tokens e custo e mostra a parte do teto já usada", () => {
    render(<UsoPorAgente uso={uso()} />);

    const total = screen.getByTestId("uso-total");
    expect(total.textContent).toContain("5.000");
    expect(total.textContent).toContain("12,00");
    expect(total.textContent).toContain("24%");
  });

  it("AC-004.6: agente com custo estimado leva a palavra estimado; o que tem preço real não leva", () => {
    render(
      <UsoPorAgente
        uso={uso({
          porAgente: [
            { agentId: "a1", nome: "Atendimento", tokens: 3500, custoCents: 900, estimado: false },
            { agentId: "a2", nome: "Vendas", tokens: 1500, custoCents: 300, estimado: true },
          ],
          total: { agentId: null, nome: "", tokens: 5000, custoCents: 1200, estimado: true },
        })}
      />,
    );

    expect(within(screen.getByTestId("uso-agente-a2")).getByText(/estimado/iu)).toBeInTheDocument();
    expect(within(screen.getByTestId("uso-agente-a1")).queryByText(/estimado/iu)).toBeNull();
    expect(within(screen.getByTestId("uso-total")).getByText(/estimado/iu)).toBeInTheDocument();
    expect(screen.getByTestId("uso-nota-estimado").textContent).toMatch(/nunca um preço real/iu);
  });

  it("AC-004.6: sem nenhum custo estimado, a nota explicativa não aparece", () => {
    render(<UsoPorAgente uso={uso()} />);

    expect(screen.queryByTestId("uso-nota-estimado")).toBeNull();
  });

  it("AC-004.4: sem teto definido diz isso, em vez de mostrar US$ 0,00", () => {
    render(<UsoPorAgente uso={uso({ tetoCents: null })} />);

    expect(screen.getByTestId("uso-teto").textContent).toMatch(/sem teto/iu);
    expect(screen.getByTestId("uso-total").textContent).not.toContain("%");
  });

  it("AC-004.4: sem agentes criados mostra a explicação, não uma tabela vazia", () => {
    render(<UsoPorAgente uso={uso({ porAgente: [] })} />);

    expect(screen.getByText(/nenhum agente/iu)).toBeInTheDocument();
  });

  it("AC-004.4: a tabela tem legenda e cabeçalhos de coluna para leitor de tela", () => {
    render(<UsoPorAgente uso={uso()} />);

    expect(screen.getByRole("table")).toBeInTheDocument();
    expect(screen.getAllByRole("columnheader").length).toBeGreaterThanOrEqual(4);
    expect(screen.getByRole("table").querySelector("caption")).not.toBeNull();
  });

  it("AC-004.1: organização antiga sem proteção vê o aviso de que a IA não para sozinha por gasto", () => {
    render(<UsoPorAgente uso={uso()} semProtecao />);

    expect(screen.getByTestId("uso-sem-teto").textContent).toMatch(/não para sozinha/iu);
  });

  it("AC-004.1: com a proteção ligada o aviso não aparece", () => {
    render(<UsoPorAgente uso={uso()} />);

    expect(screen.queryByTestId("uso-sem-teto")).toBeNull();
  });
});
