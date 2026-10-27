/**
 * O texto padrão do lembrete (mudança 007, REQ-001).
 *
 * Função pura: o que se prende é o TEXTO que chega ao cliente, em cada idioma,
 * com as variáveis certas e sem nome de marca fixo.
 */
import { describe, expect, it } from "vitest";

import { aplicarMoldeDoLembrete } from "@/app/api/v1/cron/agenda-reminder/route";

import {
  DEGRAUS_DO_LEMBRETE_PADRAO,
  FRASE_DE_CONFIRMACAO_PT,
  lembretesPadrao,
  textoPadraoDoLembrete,
} from "./lembrete-padrao";

const PECAS = {
  nome: "Maria Souza",
  primeiro_nome: "Maria",
  tipo: "Consulta",
  dia: "quinta-feira, 03/09",
  hora: "14:30",
  organizacao: "Clínica Sol",
};

describe("textoPadraoDoLembrete", () => {
  it("AC-001.4: em pt-BR cita contato, serviço, data, hora e organização", () => {
    const molde = textoPadraoDoLembrete("dia_antes", "pt-BR", false);
    for (const v of ["primeiro_nome", "tipo", "dia", "hora", "organizacao"]) {
      expect(molde).toContain(`{{${v}}}`);
    }
    const texto = aplicarMoldeDoLembrete(molde, PECAS);
    expect(texto).toContain("Maria");
    expect(texto).toContain("Consulta");
    expect(texto).toContain("quinta-feira, 03/09");
    expect(texto).toContain("14:30");
    expect(texto).toContain("Clínica Sol");
  });

  it("AC-001.4: o degrau de horas também usa hora e organização", () => {
    const molde = textoPadraoDoLembrete("horas_antes", "pt-BR", false);
    expect(molde).toContain("{{hora}}");
    expect(molde).toContain("{{organizacao}}");
  });

  it("AC-001.4: en e es saem traduzidos, sem sobra de português", () => {
    const es = textoPadraoDoLembrete("dia_antes", "es", false);
    const en = textoPadraoDoLembrete("dia_antes", "en", false);
    expect(es).not.toBe(textoPadraoDoLembrete("dia_antes", "pt-BR", false));
    expect(en).not.toBe(textoPadraoDoLembrete("dia_antes", "pt-BR", false));
    expect(es).not.toMatch(/Passando|lembrar| às /);
    expect(en).not.toMatch(/Passando|lembrar| às /);
    expect(es).toContain("{{organizacao}}");
    expect(en).toContain("{{organizacao}}");
  });

  it("AC-001.4: nenhum idioma carrega nome de marca fixa", () => {
    for (const idioma of ["pt-BR", "es", "en"] as const) {
      for (const degrau of ["dia_antes", "horas_antes"] as const) {
        expect(textoPadraoDoLembrete(degrau, idioma, true)).not.toMatch(new RegExp(`${"desk" + "comm"}|crm|whatsapp`, "i"));
      }
    }
  });

  it("AC-001.5: com a confirmação ligada, a frase 1 / 2 entra nos três idiomas", () => {
    expect(textoPadraoDoLembrete("dia_antes", "pt-BR", true)).toContain(FRASE_DE_CONFIRMACAO_PT);
    expect(textoPadraoDoLembrete("dia_antes", "es", true)).toMatch(/1.*2/);
    expect(textoPadraoDoLembrete("dia_antes", "en", true)).toMatch(/1.*2/);
  });

  it("AC-001.5: com a confirmação desligada, a frase não aparece", () => {
    for (const idioma of ["pt-BR", "es", "en"] as const) {
      const texto = textoPadraoDoLembrete("dia_antes", idioma, false);
      expect(texto).not.toMatch(/\b1\b.*\b2\b/);
    }
  });
});

describe("lembretesPadrao", () => {
  it("AC-001.1: são dois degraus, 24 h e 2 h, cada um com texto", () => {
    const passos = lembretesPadrao("pt-BR", false);
    expect(passos.map((p) => p.minutes)).toEqual([1440, 120]);
    expect(DEGRAUS_DO_LEMBRETE_PADRAO).toEqual([1440, 120]);
    expect(passos.every((p) => p.body.length > 0)).toBe(true);
    expect(passos[0]!.body).not.toBe(passos[1]!.body);
  });
});
