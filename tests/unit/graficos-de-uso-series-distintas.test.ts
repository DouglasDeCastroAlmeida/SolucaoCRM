/**
 * Séries dos gráficos de uso: cada linha/área de uma mesma tela tem a SUA cor, vinda de token do
 * tema (nunca hex). O accent da marca fica de fora: no padrão ele é verde e colide com `success`.
 */
import fs from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

import { deltaESimulado } from "@/lib/branding/contraste";

const RAIZ = process.cwd();
const ARQUIVOS = [
  "components/ai/UsageChart.tsx",
  "components/admin/usage/UsageCharts.tsx",
  "app/app/ai/evolution/_client.tsx",
];
const CSS = fs.readFileSync(path.join(RAIZ, "app/globals.css"), "utf8");

function coresDasSeries(arquivo: string): string[] {
  const fonte = fs.readFileSync(path.join(RAIZ, arquivo), "utf8");
  return [...fonte.matchAll(/\b(?:stroke|cor)="(var\(--color-[a-z-]+\))"/g)].map((m) => m[1]!);
}

function tokenNoTema(bloco: string, nome: string): string {
  const inicio = CSS.indexOf("\n" + bloco);
  const achado = new RegExp("--color-" + nome + ":\\s*(#[0-9a-fA-F]{6})").exec(CSS.slice(inicio));
  if (inicio < 0 || !achado) throw new Error(nome + " nao e hex em " + bloco);
  return achado[1]!;
}

describe("gráficos de uso: séries distintas", () => {
  it.each(ARQUIVOS)("%s não repete cor entre séries nem usa o accent da marca", (arquivo) => {
    const cores = coresDasSeries(arquivo);
    expect(cores.length).toBeGreaterThan(0);
    expect(new Set(cores).size, cores.join(" ")).toBe(cores.length);
    expect(cores).not.toContain("var(--color-accent)");
  });

  it.each([
    ["claro", ":root {"],
    ["escuro", '[data-theme="dark"] {'],
  ])("as cores usadas pelos gráficos são distinguíveis entre si no tema %s", (_tema, bloco) => {
    const nomes = new Set<string>();
    for (const a of ARQUIVOS) for (const c of coresDasSeries(a)) nomes.add(c.slice("var(--color-".length, -1));
    const hexes = [...nomes].map((n) => [n, tokenNoTema(bloco, n)] as const);
    for (let i = 0; i < hexes.length; i++) {
      for (let j = i + 1; j < hexes.length; j++) {
        expect(deltaESimulado(hexes[i]![1], hexes[j]![1]), `${hexes[i]![0]} x ${hexes[j]![0]}`).toBeGreaterThanOrEqual(0.03);
      }
    }
  });
});
