/**
 * O recibo do balão enviado (paleta fixa, ADR 0008): "lida" é azul, traço grosso e opaca; entregue e
 * enviada continuam legíveis esmaecidas (piso de componente, 3:1) sobre a bolha enviada de cada tema.
 */
import fs from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

import { PISOS, razaoDeContraste } from "@/lib/branding/contraste";
import { VISUAL_DO_RECIBO } from "./recibo-visual";

const CSS = fs.readFileSync(path.join(process.cwd(), "app/globals.css"), "utf8");
const BLOCOS = { claro: "\n:root {", escuro: '\n[data-theme="dark"] {' } as const;

function token(tema: keyof typeof BLOCOS, nome: string): string {
  const ini = CSS.indexOf(BLOCOS[tema]);
  const m = new RegExp(`${nome}:\\s*(#[0-9a-fA-F]{6})\\b`).exec(CSS.slice(ini));
  if (!m) throw new Error(`${nome} ausente`);
  return m[1]!;
}

function misturar(frente: string, fundo: string, alfa: number): string {
  const c = (h: string, i: number) => parseInt(h.replace("#", "").slice(i, i + 2), 16);
  const canal = (i: number) =>
    Math.round(c(frente, i) * alfa + c(fundo, i) * (1 - alfa)).toString(16).padStart(2, "0");
  return `#${canal(0)}${canal(2)}${canal(4)}`;
}

describe("recibo visual", () => {
  it("lida difere de entregue por traço e por opacidade, e leva a cor dos tiques de leitura", () => {
    const { lida, entregue } = VISUAL_DO_RECIBO;
    expect(lida.traco).toBeGreaterThan(entregue.traco);
    expect(lida.opacidade).toBe(1);
    expect(entregue.opacidade).toBeLessThan(lida.opacidade);
    expect(lida.classe).toContain("text-tick-read");
  });

  it("entregue e enviada, esmaecidas na cor da hora, passam de 3:1 sobre a bolha enviada nos dois temas", () => {
    for (const tema of ["claro", "escuro"] as const) {
      const bolha = token(tema, "--color-bubble-out");
      for (const nome of ["entregue", "enviada"] as const) {
        const visto = misturar(token(tema, "--color-bubble-out-meta"), bolha, VISUAL_DO_RECIBO[nome].opacidade);
        expect(razaoDeContraste(visto, bolha), `${tema}/${nome}`).toBeGreaterThanOrEqual(PISOS.componente);
      }
    }
  });
});
