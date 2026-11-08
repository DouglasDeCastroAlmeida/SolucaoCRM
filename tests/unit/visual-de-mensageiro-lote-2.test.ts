/**
 * #95 (épico #82): demais áreas do app, lote 2 (conexões, integrações,
 * integração de dados, modelos, webhooks, importações, equipe, auditoria,
 * LGPD, faturamento, honorários, comandas, produtos, propostas, chamadas,
 * atividades, extensões e as restantes fora do lote 1 e das áreas próprias).
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
  "app/app/_components",
  "app/app/activities",
  "app/app/audit",
  "app/app/calls",
  "app/app/comandas",
  "app/app/connections",
  "app/app/extensions",
  "app/app/faturamento",
  "app/app/honorarios",
  "app/app/imports",
  "app/app/integracao-dados",
  "app/app/integrations",
  "app/app/layout.tsx",
  "app/app/leads",
  "app/app/lgpd",
  "app/app/products",
  "app/app/proposals",
  "app/app/team",
  "app/app/templates",
  "app/app/webhooks",
  "components/app",
  "components/auth",
  "components/channels",
  "components/cobranca",
  "components/connections",
  "components/empty",
  "components/extensions",
  "components/feedback",
  "components/modulos",
  "components/operacao",
  "components/recursos-opcionais",
  "components/tags",
  "components/team",
  "components/voice",
];

function arquivos(dir: string): string[] {
  const abs = path.join(RAIZ, dir);
  if (!fs.existsSync(abs)) return [];
  if (fs.statSync(abs).isFile()) return [dir];
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

describe("#95 lote 2: sem cor solta nas áreas do lote", () => {
  const todos = PASTAS.flatMap(arquivos);

  it("encontra os arquivos do lote", () => {
    expect(todos.length).toBeGreaterThan(150);
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
