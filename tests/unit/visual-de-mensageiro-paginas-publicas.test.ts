/**
 * #98 (épico #82): páginas públicas fora de /app, /admin e do acesso (login, cadastro, onboarding).
 *
 * Varredura: nas páginas públicas (legal, convite de equipe, vitrine de agenda, erros e telas
 * terminais) nenhuma cor solta pode aparecer. Cor vem de token, que troca sozinho entre claro e
 * escuro. Mais três pontos de forma: a casca legal e o convite usam o fundo e o cartão do tema, e o
 * aviso de acesso revogado usa o token de atenção (não âmbar cru).
 *
 * `app/global-error.tsx` fica de fora da varredura de hex por construção: ele substitui o layout
 * raiz, então o `globals.css` não está carregado e os tokens não existem ali. Em vez disso há uma
 * trava própria: sem a paleta antiga (greige/stone) e com tema escuro.
 */
import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const RAIZ = path.resolve(__dirname, "../..");
const PASTAS = [
  "app/legal",
  "app/team",
  "app/vitrine-agenda",
  "app/403",
  "app/500",
  "app/503",
  "app/account-suspended",
  "app/acesso-revogado",
  "app/support-ended",
  "app/cobranca",
  "app/lgpd",
];
const AVULSOS = ["app/page.tsx", "app/not-found.tsx", "app/error.tsx"];
const SEM_TOKENS = "app/global-error.tsx";

function arquivos(dir: string): string[] {
  const abs = path.join(RAIZ, dir);
  if (!fs.existsSync(abs)) return [];
  return fs.readdirSync(abs, { withFileTypes: true }).flatMap((e) => {
    const rel = `${dir}/${e.name}`;
    if (e.isDirectory()) return arquivos(rel);
    return /\.(tsx?|css)$/.test(e.name) && !/\.test\.tsx?$/.test(e.name) ? [rel] : [];
  });
}
const ler = (f: string) => fs.readFileSync(path.join(RAIZ, f), "utf8");

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
  ["rgb/hsl literal", /\b(?:rgba?|hsla?)\(\s*\d/],
  ["hsl(var(--x)) sobre token hex", /hsl\(\s*var\(/],
];

describe("#98 páginas públicas: sem cor solta", () => {
  const todos = [...PASTAS.flatMap(arquivos), ...AVULSOS.filter((f) => fs.existsSync(path.join(RAIZ, f)))];

  it("encontra os arquivos das páginas públicas", () => {
    expect(todos.length).toBeGreaterThan(10);
  });

  for (const [nome, re] of PROIBIDOS) {
    it(`sem ${nome}`, () => {
      const achados: string[] = [];
      for (const f of todos) {
        ler(f)
          .split("\n")
          .forEach((linha, i) => {
            if (re.test(linha)) achados.push(`${f}:${i + 1}: ${linha.trim().slice(0, 120)}`);
          });
      }
      expect(achados).toEqual([]);
    });
  }
});

describe("#98 páginas públicas: forma no tema", () => {
  it("a casca legal usa fundo e cartão do tema", () => {
    const src = ler("app/legal/layout.tsx");
    expect(src).toContain("bg-background");
    expect(src).toContain("bg-card");
    expect(src).toContain("border-border");
    expect(src).not.toContain("bg-muted/40");
  });

  it("o convite de equipe usa fundo e cartão do tema", () => {
    const src = ler("app/team/accept-invite/[token]/page.tsx");
    expect(src).toContain("bg-background");
    expect(src).toContain("bg-card");
    expect(src).toContain("border-border");
  });

  it("o aviso de acesso revogado usa o token de atenção", () => {
    const src = ler("app/acesso-revogado/page.tsx");
    expect(src).toContain("bg-warning-bg");
    expect(src).toContain("border-warning/40");
  });

  it("global-error: sem a paleta antiga e com tema escuro", () => {
    const src = ler(SEM_TOKENS);
    expect(src).not.toMatch(/#(?:fafaf9|1c1917|e7e5e4|57534e|f5f5f4|d6d3d1)\b/i);
    expect(src).toContain("prefers-color-scheme: dark");
  });
});
