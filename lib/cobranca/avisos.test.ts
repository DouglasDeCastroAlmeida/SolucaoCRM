import { describe, expect, it } from "vitest";

import { DEFAULT_APP_NAME } from "@/lib/branding";

import { diaEMes, textoDoAviso } from "./avisos";

/**
 * As frases da régua (spec §7d). A data sai no FUSO da empresa: formatada em
 * UTC, "venceu em 05/10" viraria 06/10 para quem venceu às 23 h em São Paulo.
 */
const MEIA_NOITE_E_MEIA_UTC = new Date("2026-10-06T02:30:00Z");
const SP = "America/Sao_Paulo";

describe("diaEMes", () => {
  it("⭐ a data sai no fuso da empresa: 02:30 UTC de 06/10 é 05/10 em São Paulo", () => {
    expect(diaEMes(MEIA_NOITE_E_MEIA_UTC, "pt-BR", SP)).toBe("05/10");
    expect(diaEMes(MEIA_NOITE_E_MEIA_UTC, "pt-BR", "UTC")).toBe("06/10");
  });

  it("fuso inválido gravado na empresa (ou nenhum) cai no de São Paulo", () => {
    expect(diaEMes(MEIA_NOITE_E_MEIA_UTC, "pt-BR", "Marte/Olimpo")).toBe("05/10");
    expect(diaEMes(MEIA_NOITE_E_MEIA_UTC, "pt-BR", null)).toBe("05/10");
  });
});

describe("textoDoAviso", () => {
  const base = { data: MEIA_NOITE_E_MEIA_UTC, idioma: "pt-BR" as const, fuso: SP };

  it.each([
    ["trial_acabando", "teste", "info", "Seu teste grátis termina em 05/10"],
    ["venceu", "atraso", "warn", "Não identificamos o pagamento de 05/10"],
    ["venceu", "teste", "warn", "Seu teste grátis acabou em 05/10"],
    ["suspende_em_breve", "atraso", "critical", "Sua conta será suspensa em 05/10"],
    ["suspende_em_breve", "teste", "critical", "Sua conta será suspensa em 05/10"],
    ["suspensa", "atraso", "critical", "Conta suspensa por falta de pagamento"],
    ["suspensa", "teste", "critical", "Conta suspensa: o teste grátis terminou"],
    ["liberada", "atraso", "info", "Sua conta foi liberada"],
  ] as const)("%s (%s) → %s: %s", (assunto, origem, severidade, titulo) => {
    const texto = textoDoAviso(assunto, { ...base, origem });
    expect(texto.titulo).toBe(titulo);
    expect(texto.severidade).toBe(severidade);
    expect(texto.corpo.length).toBeGreaterThan(20);
  });

  it("quem cancelou lê que precisa assinar de novo, e não que o pagamento falhou", () => {
    expect(textoDoAviso("suspende_em_breve", { ...base, origem: "cancelamento" }).corpo).toBe(
      "Você cancelou a assinatura. Assine de novo em Plano e cobrança para continuar usando.",
    );
  });

  it("⭐ trial vencido sem pagamento lê 'teste grátis' + 'assine'; pagamento atrasado lê 'pagamento' + 'pague' (#2753)", () => {
    const doTrial = textoDoAviso("suspende_em_breve", { ...base, origem: "teste" }).corpo;
    const doAtraso = textoDoAviso("suspende_em_breve", { ...base, origem: "atraso" }).corpo;
    expect(doTrial).toContain("teste grátis");
    expect(doTrial).toContain("Assine em Plano e cobrança");
    expect(doTrial).not.toContain("Pague pelo link");
    expect(doAtraso).toContain("Pague pelo link");
    expect(doAtraso).not.toContain("teste grátis");

    // Na suspensão a diferença é ainda maior: não há pagamento pendente para
    // esperar, então a conta volta a funcionar quando ele ASSINA.
    expect(textoDoAviso("suspensa", { ...base, origem: "teste" }).corpo).toContain("Assine em Plano e cobrança para reativar");
    expect(textoDoAviso("suspensa", { ...base, origem: "atraso" }).corpo).toContain("assim que o pagamento for confirmado");
  });

  it("fala espanhol", () => {
    expect(textoDoAviso("venceu", { ...base, origem: "atraso", idioma: "es" }).titulo).toBe("No identificamos el pago del 05/10");
  });
});

describe("textoDoAviso: trial com cartão (mudança 003)", () => {
  const base = { data: MEIA_NOITE_E_MEIA_UTC, idioma: "pt-BR" as const, fuso: SP, origem: "teste" as const };

  it("AC-004.1: 2 dias antes: título com a data e corpo com o valor e como cancelar", () => {
    const t = textoDoAviso("trial_cobra_em_2_dias", { ...base, valorCents: 4990 });
    expect(t.titulo).toBe("Seu cartão será cobrado em 2 dias, em 05/10");
    expect(t.corpo).toBe("Valor: R$ 49,90. Se não quiser continuar, cancele em Plano e cobrança antes dessa data e nada será cobrado.");
    expect(t.severidade).toBe("info");
  });

  it("AC-004.2: 1 dia antes: título com a data e corpo com o valor", () => {
    const t = textoDoAviso("trial_cobra_amanha", { ...base, valorCents: 4990 });
    expect(t.titulo).toBe("Seu cartão será cobrado amanhã, 05/10");
    expect(t.corpo).toContain("Valor: R$ 49,90.");
    expect(t.severidade).toBe("warn");
  });

  it("AC-004.1: sem valor conhecido, o corpo não inventa número", () => {
    expect(textoDoAviso("trial_cobra_em_2_dias", { ...base, valorCents: null }).corpo).not.toContain("Valor");
  });

  it("AC-010.4: em espanhol sai pelo dicionário, com o valor", () => {
    const t = textoDoAviso("trial_cobra_amanha", { ...base, idioma: "es", valorCents: 4990 });
    expect(t.titulo).toBe("Tu tarjeta será cobrada mañana, 05/10");
    expect(t.corpo).toMatch(/^Valor: /);
    expect(t.corpo).toContain("cancela hoy");
  });

  it("AC-005.2: cobrança do cartão que falhou pede para trocar o cartão (aviso, aviso final e suspensão)", () => {
    expect(textoDoAviso("venceu", { ...base, origem: "cartao" }).corpo).toContain("Troque o cartão");
    expect(textoDoAviso("suspende_em_breve", { ...base, origem: "cartao" }).corpo).toContain("Troque o cartão");
    expect(textoDoAviso("suspensa", { ...base, origem: "cartao" }).titulo).toBe("Conta suspensa por falta de pagamento");
  });

  it("AC-010.4: nenhum texto leva nome de marca nem cor fixos", () => {
    for (const assunto of ["trial_cobra_em_2_dias", "trial_cobra_amanha", "venceu", "suspende_em_breve", "suspensa"] as const) {
      const t = textoDoAviso(assunto, { ...base, origem: "cartao", valorCents: 100 });
      expect(`${t.titulo} ${t.corpo}`).not.toMatch(/#[0-9a-f]{3,8}/i);
      expect(`${t.titulo} ${t.corpo}`).not.toContain(DEFAULT_APP_NAME);
    }
  });
});
