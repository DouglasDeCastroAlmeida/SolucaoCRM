import fs from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

import {
  ETAPAS,
  TELAS_POR_ETAPA,
  type TelaDoVisual,
} from "../e2e/helpers/visual-de-mensageiro-telas";

/**
 * A jornada do visual de mensageiro percorre `TELAS_POR_ETAPA`. Uma rota listada que não existe mais (ou
 * escrita errada) faria a jornada reprovar só no CI manual; aqui a lista é conferida contra as páginas do
 * disco, no `verify`.
 */
const RAIZ = process.cwd();

/** `/app/contacts` → `app/app/contacts/page.tsx`; `/login` → `app/(public)/login/page.tsx`. */
function paginasPossiveis(rota: string): string[] {
  const limpa = rota.split("?")[0]!.replace(/^\//, "");
  const base = limpa === "" ? "app" : `app/${limpa}`;
  const dirs = [base];
  if (/^(?:login|signup)$/.test(limpa)) dirs.push(`app/(public)/${limpa}`);
  if (limpa.startsWith("admin/")) dirs.push(`app/admin/(protected)/${limpa.slice("admin/".length)}`);
  return dirs.map((d) => path.join(RAIZ, d, "page.tsx"));
}

describe("visual de mensageiro: a lista de telas da jornada", () => {
  it("tem as cinco etapas, cada uma com pelo menos uma tela", () => {
    expect([...ETAPAS]).toEqual([1, 2, 3, 4, 5]);
    for (const e of ETAPAS) expect(TELAS_POR_ETAPA[e].length, `etapa ${e}`).toBeGreaterThan(0);
  });

  it("toda rota listada tem página no disco", () => {
    const sem: string[] = [];
    for (const e of ETAPAS) {
      for (const t of TELAS_POR_ETAPA[e] as TelaDoVisual[]) {
        if (!paginasPossiveis(t.rota).some((p) => fs.existsSync(p))) sem.push(`${e}: ${t.rota}`);
      }
    }
    expect(sem, "rota da jornada sem página: corrija a lista").toEqual([]);
  });

  it("o nome de captura (slug) não se repete dentro da mesma etapa", () => {
    for (const e of ETAPAS) {
      const slugs = TELAS_POR_ETAPA[e].map((t) => t.slug);
      expect(new Set(slugs).size, `etapa ${e}`).toBe(slugs.length);
    }
  });
});
