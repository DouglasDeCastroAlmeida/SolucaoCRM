import fs from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

import { PISOS, razaoDeContraste } from "@/lib/branding/contraste";

/**
 * Fundo da conversa do Inbox (#89, ADR 0007): bege liso com padrão PRÓPRIO e discreto, nunca o
 * desenho do WhatsApp. O token existe nos três blocos de tema, o padrão tem equivalente no escuro
 * e dá para desligar sem tocar em componente.
 */
const CSS = fs.readFileSync(path.join(process.cwd(), "app/globals.css"), "utf8");

function bloco(seletor: string): string {
  const inicio = CSS.indexOf("\n" + seletor + " {");
  if (inicio < 0) throw new Error("sem bloco " + seletor);
  return CSS.slice(inicio, CSS.indexOf("\n}", inicio));
}
const BLOCOS = { root: ":root", claro: '[data-theme="light"]', escuro: '[data-theme="dark"]' } as const;

describe("fundo da conversa", () => {
  it.each(Object.entries(BLOCOS))("o token de fundo existe no bloco %s como hex próprio", (_n, sel) => {
    expect(bloco(sel)).toMatch(/--color-chat-bg:\s*#[0-9a-f]{6};/i);
  });

  it.each(Object.entries(BLOCOS))("o padrão próprio existe no bloco %s", (_n, sel) => {
    expect(bloco(sel)).toMatch(/--chat-padrao:\s*url\("data:image\/svg\+xml/);
  });

  it("o padrão do escuro é diferente do claro (equivalente desenhado à parte)", () => {
    const pega = (sel: string) => /--chat-padrao:\s*(url\([^;]+\));/.exec(bloco(sel))![1];
    expect(pega(BLOCOS.escuro)).not.toBe(pega(BLOCOS.claro));
  });

  it("o token vira utilitário (bg-chat-bg) pelo @theme inline", () => {
    expect(CSS).toMatch(/--color-chat-bg:\s*var\(--color-chat-bg\);/);
  });

  it("a classe do fundo usa o token e o padrão, e o desligamento zera só o padrão", () => {
    expect(CSS).toMatch(/\.fundo-da-conversa\s*\{[^}]*background-color:\s*var\(--color-chat-bg\)/);
    expect(CSS).toMatch(/\.fundo-da-conversa\s*\{[^}]*var\(--chat-padrao\)/);
    expect(CSS).toMatch(/\.fundo-da-conversa\[data-sem-padrao\]\s*\{[^}]*background-image:\s*none/);
  });

  it.each(["claro", "escuro"] as const)("a leitura continua: texto sobre o fundo (%s) passa do piso", (tema) => {
    const sel = BLOCOS[tema];
    const fundo = /--color-chat-bg:\s*(#[0-9a-f]{6})/i.exec(bloco(sel))![1]!;
    const texto = /--color-text:\s*(#[0-9a-f]{6})/i.exec(bloco(sel))![1]!;
    const muted = /--color-text-muted:\s*(#[0-9a-f]{6})/i.exec(bloco(sel))![1]!;
    expect(razaoDeContraste(texto, fundo)).toBeGreaterThanOrEqual(PISOS.texto);
    expect(razaoDeContraste(muted, fundo)).toBeGreaterThanOrEqual(PISOS.texto);
  });
});
