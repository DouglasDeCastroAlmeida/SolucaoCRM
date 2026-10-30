import fs from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

import { PISOS, razaoDeContraste } from "@/lib/branding/contraste";

/**
 * 009 / AC-003.1 e AC-003.3 — a casca no padrão de uso do WhatsApp, com a cor e o logo da MARCA.
 *
 * Não duplica as cercas existentes: `tailwind-tokens` (ponte token -> utilitário),
 * `branding` (vazamento de marca) e `branding-regua-do-produto` (régua x globals.css) seguem
 * valendo. Aqui só entra o que a 009 acrescenta: nenhum verde/logo do WhatsApp, nenhum hex em
 * componente da casca, e o texto "subtle" dentro do piso de contraste sobre as três superfícies.
 */
const RAIZ = process.cwd();
const lerArq = (p: string) => fs.readFileSync(path.join(RAIZ, p), "utf8");
const CSS = lerArq("app/globals.css");

function bloco(seletor: string): string {
  const i = CSS.indexOf(`\n${seletor} {`);
  if (i < 0) throw new Error(`sem bloco ${seletor}`);
  return CSS.slice(i, CSS.indexOf("\n}", i));
}
const token = (b: string, nome: string) => b.match(new RegExp(String.raw`${nome}:\s*(#[0-9a-f]{6})`, "i"))?.[1] as string;

function arquivos(dir: string): string[] {
  return fs.readdirSync(path.join(RAIZ, dir), { withFileTypes: true }).flatMap((e) => {
    const rel = `${dir}/${e.name}`;
    if (e.isDirectory()) return e.name === "node_modules" ? [] : arquivos(rel);
    return /\.(tsx?|css)$/.test(e.name) && !/\.test\./.test(e.name) ? [rel] : [];
  });
}

/** Identidade do CANAL na caixa de entrada (qual conta é WhatsApp, Instagram…), não a marca do produto: fica de fora, e só ele. */
const LOGO_DE_CANAL = "components/inbox/ChannelLogo.tsx";

describe("casca 009: marca e tokens", () => {
  it("AC-003.3: nenhum verde ou asset do WhatsApp em app, components ou lib", () => {
    const proibidos = /#(?:25d366|128c7e|075e54|00a884|008069|dcf8c6|d9fdd3|34b7f1|111b21|202c33)\b/i;
    const achados = ["app", "components", "lib"]
      .flatMap(arquivos)
      .filter((f) => f !== LOGO_DE_CANAL)
      .filter((f) => proibidos.test(lerArq(f)) || /whatsapp[-_]?(?:logo|icon)\.(?:svg|png)/i.test(lerArq(f)));
    expect(achados, "cor ou ícone do WhatsApp: use os tokens da marca").toEqual([]);
  });

  it("AC-003.1: o cabeçalho da casca não usa cor fixa nem valor arbitrário", () => {
    const topo = lerArq("components/shell/TopBar.tsx");
    expect(topo).not.toMatch(/#[0-9a-fA-F]{3,8}\b/);
    expect(topo).not.toMatch(/\b(?:bg|text|border)-\[/);
    expect(topo).toContain("bg-surface");
    expect(topo).not.toMatch(/backdrop-blur|shadow-/);
  });

  it("AC-003.1: os cantos seguem a escala nova e os dois blocos de tema continuam espelhados", () => {
    const raiz = bloco(":root");
    const px = (n: string) => Number(raiz.match(new RegExp(String.raw`${n}:\s*(\d+)px`))?.[1]);
    expect([px("--radius-sm"), px("--radius-md"), px("--radius-lg"), px("--radius-xl")]).toEqual([6, 10, 14, 20]);
    const claro = bloco('[data-theme="light"]');
    for (const n of ["--color-bg", "--color-surface-elevated", "--color-text-subtle"]) {
      expect(token(claro, n), n).toBe(token(raiz, n));
    }
  });

  it("AC-003.2: texto muted e subtle passam de 4,5:1 sobre bg, surface e elevated nos dois temas", () => {
    for (const b of [bloco(":root"), bloco('[data-theme="dark"]')]) {
      for (const t of ["--color-text", "--color-text-muted", "--color-text-subtle"]) {
        for (const f of ["--color-bg", "--color-surface", "--color-surface-elevated"]) {
          const r = razaoDeContraste(token(b, t), token(b, f));
          expect(r, `${t} sobre ${f}`).toBeGreaterThanOrEqual(PISOS.texto);
        }
      }
    }
  });

  it("AC-003.2: o número do sino e o texto de botão destrutivo passam de 4,5:1 sobre a cor de erro nos dois temas", () => {
    for (const b of [bloco(":root"), bloco('[data-theme="dark"]')]) {
      const r = razaoDeContraste(token(b, "--destructive-foreground"), token(b, "--color-error"));
      expect(r).toBeGreaterThanOrEqual(PISOS.texto);
    }
  });

  it("AC-003.2: o texto de erro (--color-error-fg) passa de 4,5:1 sobre bg, surface e elevated nos dois temas, e Tarefas o usa em Atrasadas", () => {
    for (const b of [bloco(":root"), bloco('[data-theme="dark"]')]) {
      for (const f of ["--color-bg", "--color-surface", "--color-surface-elevated"]) {
        const r = razaoDeContraste(token(b, "--color-error-fg"), token(b, f));
        expect(r, `--color-error-fg sobre ${f}`).toBeGreaterThanOrEqual(PISOS.texto);
      }
    }
    const lista = lerArq("app/app/tasks/_components/ListaDeTarefas.tsx");
    expect(lista).toContain("text-error-fg");
    expect(lista).not.toMatch(/text-destructive(?!-foreground)/);
  });
});
