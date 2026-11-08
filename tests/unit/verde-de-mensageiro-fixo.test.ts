import fs from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

import { PISOS, razaoDeContraste } from "@/lib/branding/contraste";

/**
 * ADR 0008 (issue #114): o verde de mensageiro e os neutros são FIXOS no app inteiro, claros e escuros.
 * A cor da marca vale só para logo, nome, favicon e e-mails, e não colore mais a interface.
 *
 * Os valores saem do próprio `app/globals.css`; nenhum hex é copiado para cá, a não ser a lista do que o
 * WhatsApp usa de fato, que os nossos NUNCA podem repetir.
 */
const RAIZ = process.cwd();
const ler = (p: string) => fs.readFileSync(path.join(RAIZ, p), "utf8");
const CSS = ler("app/globals.css");

const TEMAS = { claro: "\n:root {", escuro: '\n[data-theme="dark"] {' } as const;
type Tema = keyof typeof TEMAS;

function bloco(tema: Tema): string {
  const ini = CSS.indexOf(TEMAS[tema]);
  if (ini < 0) throw new Error(`bloco ${tema} ausente`);
  return CSS.slice(ini, CSS.indexOf("\n}", ini));
}

function token(tema: Tema, nome: string): string {
  const m = new RegExp(`${nome}:\\s*(#[0-9a-fA-F]{6})\\b`).exec(bloco(tema));
  if (!m) throw new Error(`${nome} nao e hex literal no tema ${tema}`);
  return m[1]!.toLowerCase();
}

function rgb(hex: string): [number, number, number] {
  return [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16)) as [number, number, number];
}
function luminancia(hex: string): number {
  const [r, g, b] = rgb(hex).map((v) => {
    const c = v / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  }) as [number, number, number];
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}
function matiz(hex: string): number {
  const [r, g, b] = rgb(hex).map((v) => v / 255) as [number, number, number];
  const max = Math.max(r, g, b);
  const d = max - Math.min(r, g, b);
  if (d === 0) return 0;
  const h = max === r ? ((g - b) / d) % 6 : max === g ? (b - r) / d + 2 : (r - g) / d + 4;
  return (h * 60 + 360) % 360;
}
const espalhamento = (hex: string) => Math.max(...rgb(hex)) - Math.min(...rgb(hex));

/** Os hex do WhatsApp que a trava da arte da Meta conhece, mais os vizinhos de referência do dossiê. */
const DO_WHATSAPP = [
  "#25d366", "#128c7e", "#075e54", "#00a884", "#008069", "#dcf8c6", "#d9fdd3", "#34b7f1", "#111b21", "#202c33",
  "#005c4b", "#0b141a", "#2a3942", "#f0f2f5", "#efeae2", "#53bdeb", "#e9edef", "#8696a0", "#667781", "#182229",
  "#54656f",
];

const NOMES_NOVOS = [
  "--color-bubble-out", "--color-bubble-out-fg", "--color-bubble-out-meta", "--color-bubble-in",
  "--color-tick-read", "--color-selected",
];

describe("tokens fixos do verde de mensageiro (ADR 0008)", () => {
  for (const tema of ["claro", "escuro"] as const) {
    describe(tema, () => {
      it("declara os tokens de bolha, tique lido e linha selecionada", () => {
        for (const nome of NOMES_NOVOS) expect(() => token(tema, nome), nome).not.toThrow();
      });

      it("o verde de ação é verde e o texto sobre ele passa de 4,5:1", () => {
        const accent = token(tema, "--color-accent-600") && bloco(tema).includes("--color-accent:");
        expect(accent).toBe(true);
        const alvo = token(tema, tema === "claro" ? "--color-accent-600" : "--color-accent-400");
        expect(matiz(alvo)).toBeGreaterThanOrEqual(140);
        expect(matiz(alvo)).toBeLessThanOrEqual(180);
        expect(espalhamento(alvo), "verde vivo, não oliva apagado").toBeGreaterThan(90);
        expect(razaoDeContraste(token(tema, "--color-accent-fg"), alvo)).toBeGreaterThanOrEqual(PISOS.texto);
      });

      it("texto da bolha enviada, da hora e da bolha recebida passa de 4,5:1", () => {
        const saida = token(tema, "--color-bubble-out");
        expect(razaoDeContraste(token(tema, "--color-bubble-out-fg"), saida)).toBeGreaterThanOrEqual(PISOS.texto);
        expect(razaoDeContraste(token(tema, "--color-bubble-out-meta"), saida)).toBeGreaterThanOrEqual(PISOS.texto);
        const entrada = token(tema, "--color-bubble-in");
        expect(razaoDeContraste(token(tema, "--color-text"), entrada)).toBeGreaterThanOrEqual(PISOS.texto);
        expect(razaoDeContraste(token(tema, "--color-text-muted"), entrada)).toBeGreaterThanOrEqual(PISOS.texto);
      });

      it("o tique lido é azul e se distingue da bolha enviada (3:1)", () => {
        const tique = token(tema, "--color-tick-read");
        expect(matiz(tique)).toBeGreaterThanOrEqual(190);
        expect(matiz(tique)).toBeLessThanOrEqual(215);
        expect(razaoDeContraste(tique, token(tema, "--color-bubble-out"))).toBeGreaterThanOrEqual(3);
      });

      it("a linha selecionada é cinza neutro e o texto dela passa de 4,5:1", () => {
        const sel = token(tema, "--color-selected");
        expect(espalhamento(sel), "neutro, sem verde").toBeLessThanOrEqual(tema === "claro" ? 12 : 22);
        for (const t of ["--color-text", "--color-text-muted", "--color-text-subtle"]) {
          expect(razaoDeContraste(token(tema, t), sel), t).toBeGreaterThanOrEqual(PISOS.texto);
        }
      });

      it("nenhum hex do tema é idêntico ao do WhatsApp", () => {
        const hexes = (bloco(tema).match(/#[0-9a-fA-F]{6}\b/g) ?? []).map((h) => h.toLowerCase());
        expect(hexes.filter((h) => DO_WHATSAPP.includes(h))).toEqual([]);
      });
    });
  }

  it("bolha enviada é pálida no claro e escura no escuro; recebida branca no claro e cinza-esverdeada no escuro", () => {
    expect(luminancia(token("claro", "--color-bubble-out"))).toBeGreaterThan(0.75);
    expect(luminancia(token("escuro", "--color-bubble-out"))).toBeLessThan(0.1);
    expect(token("claro", "--color-bubble-in")).toBe("#ffffff");
    const entradaEscura = rgb(token("escuro", "--color-bubble-in"));
    expect(luminancia(token("escuro", "--color-bubble-in"))).toBeLessThan(0.05);
    expect(entradaEscura[1], "verde acima do vermelho").toBeGreaterThan(entradaEscura[0]);
  });

  it("o espelho claro por subárvore tem os mesmos tokens novos", () => {
    const ini = CSS.indexOf('\n[data-theme="light"] {');
    const espelho = CSS.slice(ini, CSS.indexOf("\n}", ini));
    for (const nome of NOMES_NOVOS) expect(espelho, nome).toContain(`${nome}:`);
  });
});

describe("a marca não colore mais a interface (ADR 0008)", () => {
  it("o layout raiz e o do /app não injetam CSS de cor da marca", () => {
    for (const arq of ["app/layout.tsx", "app/app/layout.tsx"]) {
      const fonte = ler(arq);
      expect(fonte, arq).not.toMatch(/cssDaMarca\s*\(/);
      expect(fonte, arq).not.toContain("<EstiloDaMarca");
    }
    expect(fs.existsSync(path.join(RAIZ, "app/app/_components/EstiloDaMarcaDaOrganizacao.tsx"))).toBe(false);
  });

  it("bolha e linha selecionada usam os tokens fixos, não a cor de destaque", () => {
    const bolha = ler("components/inbox/MessageBubble.tsx");
    expect(bolha).toContain("bg-bubble-out");
    expect(bolha).toContain("bg-bubble-in");
    expect(bolha).not.toMatch(/isOutbound\s*\n?\s*\? cn\("bg-primary/);
    expect(ler("components/inbox/ConversationListItem.tsx")).toContain("bg-selected");
  });

  it("as telas de Marca dizem que a cor vale só para logo, nome, favicon e e-mails, com espanhol", () => {
    for (const arq of ["app/admin/(protected)/marca/_form.tsx", "app/app/settings/marca/_form.tsx", "components/admin/marcas/EditorDeMarca.tsx"]) {
      expect(ler(arq), arq).toContain("<AvisoDaCorDaMarca />");
    }
  });
});
