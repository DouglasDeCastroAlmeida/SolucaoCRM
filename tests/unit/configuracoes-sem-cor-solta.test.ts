/**
 * Visual de mensageiro 11/17 (#93): Configurações só usam tokens de cor.
 * Paleta crua do Tailwind (emerald, amber, sky...) não acompanha a marca nem o
 * tema escuro desenhado à parte; o token sim.
 */
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const RAIZ = join(process.cwd(), "app/app/settings");
const PALETA_CRUA =
  /\b(?:bg|text|border|ring|from|to|via|fill|stroke|divide|outline)-(?:red|green|amber|yellow|blue|emerald|rose|orange|sky|slate|gray|zinc|neutral|stone|indigo|violet|purple|pink|teal|cyan|lime|white|black)(?:-\d+)?(?:\/\d+)?\b/;

function arquivos(dir: string): string[] {
  return readdirSync(dir).flatMap((nome) => {
    const caminho = join(dir, nome);
    if (statSync(caminho).isDirectory()) return arquivos(caminho);
    return /\.tsx$/.test(nome) && !/\.test\.tsx$/.test(nome) ? [caminho] : [];
  });
}

describe("Configurações sem cor solta", () => {
  it("nenhuma tela de /app/settings usa paleta crua do Tailwind", () => {
    const culpados = arquivos(RAIZ).filter((f) =>
      readFileSync(f, "utf8")
        .split("\n")
        .some((linha) => PALETA_CRUA.test(linha)),
    );
    expect(culpados).toEqual([]);
  });
});
