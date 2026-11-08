/**
 * #84 (épico #82): neutros do visual de mensageiro, fonte do sistema e tamanho
 * mínimo de texto.
 *
 * Os valores esperados são literais da decisão de paleta (ADR 0007 e issue #84),
 * não recalculados a partir do CSS. O contraste de cada par é medido pela mesma
 * função que a régua da marca usa; nenhum piso é afrouxado.
 */
import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { razaoDeContraste } from "@/lib/branding/contraste";

const RAIZ = path.resolve(__dirname, "../..");
const css = fs.readFileSync(path.join(RAIZ, "app/globals.css"), "utf8");
const layout = fs.readFileSync(path.join(RAIZ, "app/layout.tsx"), "utf8");

function bloco(seletor: string): string {
  const i = css.indexOf(`\n${seletor} {`);
  expect(i, `bloco ${seletor} ausente`).toBeGreaterThan(-1);
  return css.slice(i, css.indexOf("\n}", i));
}
function token(corpo: string, nome: string): string | undefined {
  return new RegExp(`${nome}:\\s*([^;]+);`).exec(corpo)?.[1]?.trim();
}

const CLARO = {
  "--color-bg": "#f7f8f9",
  "--color-surface": "#ffffff",
  "--color-surface-elevated": "#f0f2f4",
  "--color-text": "#17222b",
  "--color-text-muted": "#4f6069",
  "--color-text-subtle": "#5f707a",
  "--color-border": "#e3e7ea",
  "--color-border-strong": "#cfd5d9",
};
const ESCURO = {
  "--color-bg": "#0e171d",
  "--color-surface": "#1a252c",
  "--color-surface-elevated": "#232f37",
  "--color-text": "#e7ecef",
  "--color-text-muted": "#a2b2bb",
  "--color-text-subtle": "#8fa0aa",
  "--color-border": "#2a373f",
  "--color-border-strong": "#394850",
};

describe("neutros do visual de mensageiro", () => {
  for (const [nome, seletor, esperado] of [
    ["claro (:root)", ":root", CLARO],
    ["claro (data-theme)", '[data-theme="light"]', CLARO],
    ["escuro", '[data-theme="dark"]', ESCURO],
  ] as const) {
    it(`tema ${nome} usa a paleta decidida`, () => {
      const corpo = bloco(seletor);
      for (const [k, v] of Object.entries(esperado)) {
        expect(token(corpo, k), `${seletor} ${k}`).toBe(v);
      }
    });
  }

  for (const [nome, tema] of [
    ["claro", CLARO],
    ["escuro", ESCURO],
  ] as const) {
    it(`texto do tema ${nome} chega a 4,5:1 em bg, surface e elevated`, () => {
      for (const t of ["--color-text", "--color-text-muted", "--color-text-subtle"] as const) {
        for (const f of ["--color-bg", "--color-surface", "--color-surface-elevated"] as const) {
          expect(razaoDeContraste(tema[t], tema[f]), `${nome} ${t} sobre ${f}`).toBeGreaterThanOrEqual(4.5);
        }
      }
    });
  }

  it("a rampa de neutros não guarda mais o greige quente do visual antigo", () => {
    const sem = css.toLowerCase();
    for (const antigo of ["#faf9f6", "#f3f1ec", "#e7e3da", "#d2cdbf", "#161510", "#1d1c17", "#f5f4ef", "#1c1a16"]) {
      expect(sem, antigo).not.toContain(antigo);
    }
  });
});

describe("fonte do sistema", () => {
  it("o --font-sans e o corpo usam a pilha do sistema, sem Atkinson", () => {
    expect(css).not.toMatch(/atkinson/i);
    expect(css).toMatch(/--font-sans:\s*ui-sans-serif,\s*system-ui,\s*-apple-system,\s*"Segoe UI",\s*Roboto/);
  });
  it("o layout não carrega mais a Atkinson e a monoespaçada continua", () => {
    expect(layout).not.toMatch(/atkinson/i);
    expect(layout).toContain('"--font-mono"');
  });
});

describe("tamanho mínimo de texto", () => {
  function arquivos(dir: string): string[] {
    return fs.readdirSync(path.join(RAIZ, dir), { withFileTypes: true }).flatMap((e) => {
      const rel = `${dir}/${e.name}`;
      if (e.isDirectory()) return e.name === "node_modules" ? [] : arquivos(rel);
      return /\.(tsx|ts)$/.test(e.name) ? [rel] : [];
    });
  }
  it("nenhuma classe de texto fixa abaixo de 10px em app/ e components/", () => {
    const abaixo: string[] = [];
    for (const f of [...arquivos("app"), ...arquivos("components")]) {
      const src = fs.readFileSync(path.join(RAIZ, f), "utf8");
      for (const m of src.matchAll(/text-\[(\d+(?:\.\d+)?)px\]/g)) {
        if (Number(m[1]) < 10) abaixo.push(`${f}: ${m[0]}`);
      }
    }
    expect(abaixo).toEqual([]);
  });
  // A regra real é 12px (docs/design-system/03-typography.md). As telas refeitas no épico #82
  // cumprem: nenhum texto fixo abaixo de 12px nelas. O piso de 10px acima segue valendo para o
  // resto do código (legado, ainda por migrar). Exceções só com motivo escrito em 03-typography.md.
  const SUPERFICIES_EM_12PX = [
    "components/inbox/MessageBubble.tsx",
    "components/inbox/media/AudioPlayer.tsx",
    "components/inbox/JanelaFechadaAviso.tsx",
    "components/inbox/JanelaSelo.tsx",
    "components/inbox/ConversationListItem.tsx",
    "components/inbox/InboxFilters.tsx",
    "components/shell/BarraInferior.tsx",
    "components/shell/ContadorDaFila.tsx",
    "components/shell/ContadorDeCasos.tsx",
    "components/shell/SearchTrigger.tsx",
    "components/connections/TemplatesParceiroClient.tsx",
    "components/admin/platform-admins/PlatformAdminsTable.tsx",
    "components/kanban/OwnerBadge.tsx",
  ];
  /** Exceção registrada em 03-typography.md ("Exceções ao mínimo de 12px"): arquivo -> quantos usos. */
  const EXCECOES_REGISTRADAS: Record<string, number> = {
    // Iniciais dentro do disco de 16px do cartão compacto do funil: 12px não cabe no disco.
    "components/kanban/OwnerBadge.tsx": 2,
  };
  it("as telas do mensageiro não têm texto fixo abaixo de 12px, salvo exceção registrada", () => {
    const doc = fs.readFileSync(path.join(RAIZ, "docs/design-system/03-typography.md"), "utf8");
    for (const f of SUPERFICIES_EM_12PX) {
      const src = fs.readFileSync(path.join(RAIZ, f), "utf8");
      const abaixo = [...src.matchAll(/text-\[(\d+(?:\.\d+)?)px\]/g)].filter((m) => Number(m[1]) < 12);
      expect(abaixo.length, f).toBe(EXCECOES_REGISTRADAS[f] ?? 0);
      if (abaixo.length) expect(doc, `${f} sem exceção em 03-typography.md`).toContain(f);
    }
  });
  it("nenhum font-size fixo abaixo de 10px no CSS global", () => {
    for (const m of css.matchAll(/font-size:\s*(\d+(?:\.\d+)?)px/g)) {
      expect(Number(m[1]), m[0]).toBeGreaterThanOrEqual(10);
    }
  });
});
