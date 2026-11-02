import { describe, expect, it } from "vitest";

import { anexarCobrancaAsContas, estadoDaContaNoPainel, linkSeguroDoAsaas } from "./contas-do-painel";

describe("AC-009.2: estado da conta no painel", () => {
  it("AC-009.2: sem assinatura e ativa e cortesia", () => {
    expect(estadoDaContaNoPainel(null, { status: "active", suspended_kind: null })).toBe("cortesia");
  });
  it("AC-009.2: org suspensa por cobranca e suspensa; assinatura mantem os demais estados", () => {
    expect(estadoDaContaNoPainel({ estado: "trial" }, { status: "suspended", suspended_kind: "cobranca" })).toBe("suspensa");
    expect(estadoDaContaNoPainel({ estado: "em_atraso" }, { status: "active", suspended_kind: null })).toBe("em_atraso");
    expect(estadoDaContaNoPainel({ estado: "cancelada" }, { status: "suspended", suspended_kind: "cobranca" })).toBe("cancelada");
  });
  it("AC-009.2: suspensao administrativa nao vira suspensa de cobranca", () => {
    expect(estadoDaContaNoPainel({ estado: "ativa" }, { status: "suspended", suspended_kind: "administrativa" })).toBe("ativa");
  });
});

describe("AC-009.3: link do Asaas", () => {
  it("AC-009.3: so https de origem do Asaas", () => {
    expect(linkSeguroDoAsaas("https://www.asaas.com/i/abc")).toBe("https://www.asaas.com/i/abc");
    expect(linkSeguroDoAsaas("http://www.asaas.com/i/abc")).toBeNull();
    expect(linkSeguroDoAsaas("https://evil.example/i/abc")).toBeNull();
    expect(linkSeguroDoAsaas("javascript:alert(1)")).toBeNull();
    expect(linkSeguroDoAsaas(null)).toBeNull();
  });
});

describe("AC-009.3: anexa cobranca as contas", () => {
  it("AC-009.3: devolve plano, datas, estado e link, sem dado pessoal", () => {
    const [c] = anexarCobrancaAsContas(
      [{ id: "o1", name: "A", status: "active", suspended_kind: null, brand_id: "b" }],
      [{ organization_id: "o1", estado: "trial", plano_id: "p1", trial_ate: "2026-11-10T00:00:00Z", proximo_vencimento: null, link_de_pagamento: "https://sandbox.asaas.com/i/1" }],
      [{ id: "p1", nome: "Pro" }],
    );
    expect(c?.cobranca).toEqual({
      estado: "trial",
      plano: "Pro",
      trial_ate: "2026-11-10T00:00:00Z",
      proximo_vencimento: null,
      link_asaas: "https://sandbox.asaas.com/i/1",
    });
    const [s] = anexarCobrancaAsContas([{ id: "o2", name: "B", status: "active", suspended_kind: null, brand_id: "b" }], [], []);
    expect(s?.cobranca.estado).toBe("cortesia");
    expect(s?.cobranca.plano).toBeNull();
  });
});
