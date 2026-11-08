import { describe, it, expect } from "vitest";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";

const RAIZ = process.cwd();

// Glifos em que o desenho do WhatsApp Web é o mesmo (ADR 0007): vêm dos
// Material Symbols (Apache-2.0). O resto do produto continua Phosphor.
const GLIFOS_ABERTOS = [
  "TickEnviado",
  "TickEntregue",
  "Clipe",
  "Microfone",
  "Emoji",
  "TresPontos",
  "Lupa",
  "Voltar",
  "Conversa",
  "Status",
] as const;

type Icone = React.ComponentType<import("@/lib/ui/material-symbols").PropsDoGlifoAberto>;

function arquivosDeCodigo(pasta: string): string[] {
  const achados: string[] = [];
  for (const nome of readdirSync(pasta)) {
    if (["node_modules", ".next", ".git", ".claude"].includes(nome)) continue;
    const caminho = join(pasta, nome);
    if (statSync(caminho).isDirectory()) achados.push(...arquivosDeCodigo(caminho));
    else if (/\.(ts|tsx)$/.test(nome)) achados.push(caminho);
  }
  return achados;
}

describe("mapa único de ícones: Material Symbols", () => {
  it("expõe os glifos abertos pelo mapa, desenhando um svg que herda a cor do texto", { timeout: 30_000 }, async () => {
    const mapa = (await import("@/lib/ui/icons")) as unknown as Record<string, Icone>;
    for (const nome of GLIFOS_ABERTOS) {
      const Glifo = mapa[nome]!;
      expect(Glifo, nome).toBeTypeOf("function");
      const html = renderToStaticMarkup(createElement(Glifo, { size: 20, className: "x", "aria-hidden": true }));
      expect(html, nome).toContain("<svg");
      expect(html, nome).toContain('viewBox="0 -960 960 960"');
      expect(html, nome).toContain('fill="currentColor"');
      expect(html, nome).toContain('width="20"');
      expect(html, nome).toContain('class="x"');
      expect(html, nome).toMatch(/<path d="[^"]{20,}"/);
    }
  });

  it("aceita rótulo acessível e usa 1em quando não há tamanho (como o Phosphor)", { timeout: 30_000 }, async () => {
    const mapa = (await import("@/lib/ui/icons")) as unknown as Record<string, Icone>;
    const html = renderToStaticMarkup(createElement(mapa.TickEntregue!, { "aria-label": "Lida" }));
    expect(html).toContain('aria-label="Lida"');
    expect(html).toContain('width="1em"');
  });

  it("registra a licença Apache-2.0 junto dos glifos e no aviso de origem", () => {
    const licenca = join(RAIZ, "lib/ui/material-symbols/LICENSE");
    expect(existsSync(licenca)).toBe(true);
    expect(readFileSync(licenca, "utf8")).toContain("Apache License");
    expect(readFileSync(join(RAIZ, "NOTICE"), "utf8")).toMatch(/Material\s+Symbols[\s\S]*Apache/);
  });

  it("nenhum componente importa ícone direto do pacote: só lib/ui/icons.ts", () => {
    const permitidos = new Set(["lib/ui/icons.ts", "lib/ui/material-symbols/index.tsx"]);
    // `import type` é permitido (só tipo, sem ícone em tempo de execução).
    const diretos =
      /(?:import|export)\s+(?!type\b)[^;]*?from\s+["'](?:@phosphor-icons\/react[^"']*|@material-symbols\/[^"']*|@\/lib\/ui\/material-symbols[^"']*)["']/;
    const infratores: string[] = [];
    for (const pasta of ["app", "components", "lib", "hooks"]) {
      const base = join(RAIZ, pasta);
      if (!existsSync(base)) continue;
      for (const arquivo of arquivosDeCodigo(base)) {
        const rel = relative(RAIZ, arquivo).replace(/\\/g, "/");
        if (permitidos.has(rel) || /\.test\.tsx?$/.test(rel)) continue;
        if (diretos.test(readFileSync(arquivo, "utf8"))) infratores.push(rel);
      }
    }
    expect(infratores).toEqual([]);
  });
});
