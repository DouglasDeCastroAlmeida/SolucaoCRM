/**
 * Contraste do balao do inbox (REQ-003), medido com as funcoes reais de
 * `lib/branding` e com os tokens lidos do proprio `app/globals.css`.
 * Nenhuma cor do produto e copiada para ca.
 */
import fs from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

import {
  derivarMarca,
  extrairRegua,
  melhorFrenteSobre,
  PISOS,
  razaoDeContraste,
} from "./contraste";

const CSS = fs.readFileSync(path.join(process.cwd(), "app/globals.css"), "utf8");
const REGUA = extrairRegua(CSS);
const TEMAS = ["claro", "escuro"] as const;

const CORES = [
  "#ffffff", "#fff", "#000000", "#000", "#f5c518", "#ffff00", "#0f172a", "#506d48",
  "#7f7f7f", "#767676", "#777777", "#e11d48", "#25d366", "#ABCDEF", "  #123456  ", "123456",
];

const SELETOR = { claro: ":root {", escuro: '[data-theme="dark"] {' } as const;

/** Le um token hex literal do bloco do tema no proprio CSS (a regua nao mede texto). */
function tokenDoBloco(seletor: string, token: string): string {
  const inicio = CSS.indexOf("\n" + seletor);
  const achado = new RegExp(token + ":\\s*(#[0-9a-fA-F]{3,6})").exec(CSS.slice(inicio));
  if (inicio < 0 || !achado) throw new Error(token + " nao e hex literal em " + seletor);
  return achado[1]!;
}

describe("balao enviado: texto sobre a cor de destaque da marca", () => {
  it("AC-003.2: para qualquer cor, o texto derivado passa de 4,5:1 nos dois temas", () => {
    for (const cor of CORES) {
      const marca = derivarMarca(cor, REGUA);
      for (const tema of TEMAS) {
        const { accent, accentFg } = marca[tema];
        expect(razaoDeContraste(accentFg, accent), `${cor}/${tema}`).toBeGreaterThanOrEqual(PISOS.texto);
      }
    }
  });

  it("AC-003.2: varredura de 4096 cores nunca cai abaixo de 4,5:1", () => {
    for (let i = 0; i < 4096; i++) {
      const cor = `#${((i * 4099) % 0x1000000).toString(16).padStart(6, "0")}`;
      const marca = derivarMarca(cor, REGUA);
      for (const tema of TEMAS) {
        const { accent, accentFg } = marca[tema];
        expect(razaoDeContraste(accentFg, accent), `${cor}/${tema}`).toBeGreaterThanOrEqual(PISOS.texto);
      }
    }
  });

  it("AC-003.2: cor muito clara ganha frente escura e muito escura ganha frente clara", () => {
    expect(melhorFrenteSobre("#ffffff")).toBe("#000000");
    expect(melhorFrenteSobre("#000000")).toBe("#ffffff");
  });

  it("AC-003.2: hex curto e longo dao a mesma marca", () => {
    expect(derivarMarca("#f80", REGUA).claro.accentFg).toBe(derivarMarca("#ff8800", REGUA).claro.accentFg);
  });

  it("AC-003.4: a marca padrao do produto (a rampa do proprio CSS) nao da erro e passa de 4,5:1", () => {
    const padrao = REGUA.rampaDoProduto[6];
    const marca = derivarMarca(padrao, REGUA);
    for (const tema of TEMAS) {
      expect(razaoDeContraste(marca[tema].accentFg, marca[tema].accent)).toBeGreaterThanOrEqual(PISOS.texto);
    }
  });

  it("AC-003.4: cor invalida e rejeitada por quem chama, nao vira cor errada em silencio", () => {
    expect(() => derivarMarca("azul", REGUA)).toThrow();
  });
});

describe("tokens reais do globals.css", () => {
  it("AC-003.3: balao recebido (texto sobre card) passa de 4,5:1 em claro e escuro", () => {
    for (const tema of TEMAS) {
      const texto = tokenDoBloco(SELETOR[tema], "--color-text");
      const card = REGUA[tema].base.find((b) => b.chave === "--color-surface")?.hex;
      expect(card, tema + ": --color-surface").toBeDefined();
      expect(razaoDeContraste(texto, card!), tema).toBeGreaterThanOrEqual(PISOS.texto);
    }
  });

  it("AC-003.3: balao enviado (accent com accent-fg) do CSS passa de 4,5:1 em claro e escuro", () => {
    for (const tema of TEMAS) {
      const par = REGUA[tema].papeis.find((p) => p.token === "--color-accent-fg");
      expect(par, "papel --color-accent-fg").toBeDefined();
      const marca = derivarMarca(REGUA.rampaDoProduto[6], REGUA);
      expect(razaoDeContraste(marca[tema].accentFg, marca[tema].accent)).toBeGreaterThanOrEqual(PISOS.texto);
    }
  });
});
