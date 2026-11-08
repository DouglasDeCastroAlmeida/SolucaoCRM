/**
 * #94 (épico #82): demais áreas do app, lote 1 (campanhas, prospecção,
 * anúncios, IA, análise, métricas e radar).
 *
 * Varredura: nessas pastas nenhuma cor solta (paleta crua do Tailwind, hex,
 * rgb/hsl literal) pode aparecer. Cor vem de token (success/warning/error/info,
 * primary, border...), que troca sozinho entre claro e escuro. Também reprova
 * `hsl(var(--x))`: os tokens são hex, então esse wrapper produz cor inválida.
 */
import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const RAIZ = path.resolve(__dirname, "../..");
const PASTAS = [
  "app/app/campaigns",
  "app/app/prospecting",
  "app/app/ads",
  "app/app/ai",
  "app/app/analise",
  "app/app/metrics",
  "app/app/radar",
  "components/campanhas",
  "components/prospecting",
  "components/ai",
];

function arquivos(dir: string): string[] {
  const abs = path.join(RAIZ, dir);
  if (!fs.existsSync(abs)) return [];
  return fs.readdirSync(abs, { withFileTypes: true }).flatMap((e) => {
    const rel = `${dir}/${e.name}`;
    if (e.isDirectory()) return arquivos(rel);
    return /\.(tsx?|css)$/.test(e.name) && !/\.test\.tsx?$/.test(e.name)
      ? [rel]
      : [];
  });
}

const NOMES =
  "slate|gray|zinc|neutral|stone|red|orange|amber|yellow|lime|green|emerald|teal|cyan|sky|blue|indigo|violet|purple|fuchsia|pink|rose";
const PROIBIDOS: Array<[string, RegExp]> = [
  [
    "paleta crua do Tailwind",
    new RegExp(
      `\\b(?:bg|text|border|ring|from|to|via|fill|stroke|divide|outline|decoration|shadow|accent|caret|placeholder)-(?:${NOMES})-\\d{2,3}\\b`,
    ),
  ],
  ["branco/preto cru", /\b(?:bg|text|border|ring|fill|stroke)-(?:white|black)\b/],
  ["hex", /#(?:[0-9a-fA-F]{8}|[0-9a-fA-F]{6}|[0-9a-fA-F]{3,4})\b(?<=#\w*[a-fA-F]\w*)/],
  ["hex só de dígitos entre aspas", /["'`]#\d{3,8}["'`]/],
  ["rgb/hsl literal", /\b(?:rgba?|hsla?)\(\s*\d/],
  ["hsl(var(--x)) sobre token hex", /hsl\(\s*var\(/],
];

describe("#94 lote 1: sem cor solta nas áreas do lote", () => {
  const todos = PASTAS.flatMap(arquivos);

  it("encontra os arquivos do lote", () => {
    expect(todos.length).toBeGreaterThan(100);
  });

  for (const [nome, re] of PROIBIDOS) {
    it(`sem ${nome}`, () => {
      const achados: string[] = [];
      for (const f of todos) {
        fs.readFileSync(path.join(RAIZ, f), "utf8")
          .split("\n")
          .forEach((linha, i) => {
            if (re.test(linha)) achados.push(`${f}:${i + 1}: ${linha.trim().slice(0, 120)}`);
          });
      }
      expect(achados).toEqual([]);
    });
  }
});
