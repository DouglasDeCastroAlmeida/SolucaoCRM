import { describe, expect, it } from "vitest";
import { mostrarPagarAgora } from "./pagar-agora";

const base = { provedor: "asaas", estado: "trial", temProvedor: true, assinaturasVivas: 1, temLink: true } as const;

describe("mostrarPagarAgora", () => {
  it("AC-002.1: Asaas em trial com assinatura viva e cobrança agendada não mostra o botão", () => {
    expect(mostrarPagarAgora(base)).toBe(false);
  });

  it("AC-002.2: em atraso (ou fora do trial) mostra o botão quando há link", () => {
    expect(mostrarPagarAgora({ ...base, estado: "em_atraso" })).toBe(true);
    expect(mostrarPagarAgora({ ...base, estado: "cancelada" })).toBe(true);
    expect(mostrarPagarAgora({ ...base, estado: "ativa" })).toBe(true);
  });

  it("AC-002.2: trial sem assinatura viva ou sem provedor mantém o comportamento atual (link presente = mostra)", () => {
    expect(mostrarPagarAgora({ ...base, assinaturasVivas: 0 })).toBe(true);
    expect(mostrarPagarAgora({ ...base, temProvedor: false })).toBe(true);
  });

  it("AC-002.2: sem link nunca mostra", () => {
    expect(mostrarPagarAgora({ ...base, estado: "em_atraso", temLink: false })).toBe(false);
  });

  it("AC-002.2: outros provedores em trial mantêm o botão", () => {
    expect(mostrarPagarAgora({ ...base, provedor: "stripe" })).toBe(true);
  });
});
