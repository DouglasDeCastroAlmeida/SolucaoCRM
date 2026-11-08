/**
 * O recibo do balão enviado: "lida" tem de se distinguir de "entregue" sem depender de cor fixa
 * (o balão leva a cor da MARCA) e o glifo esmaecido continua legível (piso de componente, 3:1).
 */
import fs from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

import { derivarMarca, extrairRegua, PISOS, razaoDeContraste } from "@/lib/branding/contraste";
import { VISUAL_DO_RECIBO } from "./recibo-visual";

const REGUA = extrairRegua(fs.readFileSync(path.join(process.cwd(), "app/globals.css"), "utf8"));
const CORES = ["#ffffff", "#000000", "#f5c518", "#ffff00", "#0f172a", "#506d48", "#7f7f7f", "#767676", "#e11d48", "#25d366", "#abcdef"];

function misturar(frente: string, fundo: string, alfa: number): string {
  const c = (h: string, i: number) => parseInt(h.replace("#", "").padEnd(6, "0").slice(i, i + 2), 16);
  const canal = (i: number) =>
    Math.round(c(frente, i) * alfa + c(fundo, i) * (1 - alfa)).toString(16).padStart(2, "0");
  return `#${canal(1)}${canal(3)}${canal(5)}`;
}

describe("recibo visual", () => {
  it("lida difere de entregue por traço e por opacidade, não por cor", () => {
    const { lida, entregue } = VISUAL_DO_RECIBO;
    expect(lida.traco).toBeGreaterThan(entregue.traco);
    expect(lida.opacidade).toBe(1);
    expect(entregue.opacidade).toBeLessThan(lida.opacidade);
  });

  it("o recibo esmaecido passa de 3:1 sobre o balão de qualquer cor de marca, nos dois temas", () => {
    for (const cor of CORES) {
      const marca = derivarMarca(cor, REGUA);
      for (const tema of ["claro", "escuro"] as const) {
        const { accent, accentFg } = marca[tema];
        for (const [nome, v] of Object.entries(VISUAL_DO_RECIBO)) {
          const visto = misturar(accentFg, accent, v.opacidade);
          expect(razaoDeContraste(visto, accent), `${cor}/${tema}/${nome}`).toBeGreaterThanOrEqual(PISOS.componente);
        }
      }
    }
  });
});
