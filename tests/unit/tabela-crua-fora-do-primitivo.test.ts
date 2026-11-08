import { describe, expect, it } from "vitest";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative, sep } from "node:path";

/**
 * Trava do visual de mensageiro (#110): `<table>` cru novo fora do primitivo
 * `components/ui/table.tsx` reprova. Tabela nova usa `Table`, `TableRow`...
 */
const RAIZ = process.cwd();

/** Exceções legítimas, com motivo. Caminho relativo com "/". */
const EXCECOES: Record<string, string> = {
  "components/ui/table.tsx": "é o próprio primitivo",
  "app/design/sections/SectionTokens.tsx":
    "laboratório de design: mostra os tokens com estilo em linha, de propósito fora do primitivo",
};

function arquivos(dir: string, saida: string[] = []): string[] {
  for (const nome of readdirSync(dir)) {
    const p = join(dir, nome);
    if (statSync(p).isDirectory()) arquivos(p, saida);
    else if (/\.tsx$/.test(nome) && !/\.test\.tsx$/.test(nome)) saida.push(p);
  }
  return saida;
}

describe("tabela crua fora do primitivo (#110)", () => {
  it("nenhum <table> novo fora de components/ui/table.tsx", () => {
    const achados: string[] = [];
    for (const pasta of ["app", "components"]) {
      for (const f of arquivos(join(RAIZ, pasta))) {
        const rel = relative(RAIZ, f).split(sep).join("/");
        if (rel in EXCECOES) continue;
        const codigo = readFileSync(f, "utf8").replace(/\/\*[\s\S]*?\*\//g, "");
        if (/<table[\s>]/.test(codigo)) achados.push(rel);
      }
    }
    expect(achados, "use o primitivo Table de components/ui/table").toEqual([]);
  });

  it("as exceções declaradas existem e têm motivo", () => {
    for (const [rel, motivo] of Object.entries(EXCECOES)) {
      expect(statSync(join(RAIZ, rel)).isFile()).toBe(true);
      expect(motivo.length).toBeGreaterThan(10);
    }
  });
});
