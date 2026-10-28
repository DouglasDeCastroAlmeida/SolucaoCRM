import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

/**
 * A vitrine do upstream saiu do fluxo de release (SDD 008, AC-002.4).
 *
 * Este arquivo vigiava o passo "A versão aparece na página de changelog da LP?" do
 * `release.yml`, que consultava o site do upstream. O passo foi removido porque a vitrine
 * não é nossa. Ficam duas coisas:
 *
 *   1. a prova de que o passo e as URLs não voltaram (a cerca geral é
 *      `nada-executa-contra-o-upstream.test.ts`);
 *   2. o contrato de FORMA do cabeçalho do CHANGELOG, que continua útil a qualquer leitor
 *      (a tela do app na VPS lê o mesmo cabeçalho).
 */
const RAIZ = process.cwd();
const release = readFileSync(join(RAIZ, ".github/workflows/release.yml"), "utf8");
const changelog = readFileSync(join(RAIZ, "CHANGELOG.md"), "utf8");

describe("a vitrine do upstream saiu do release", () => {
  it("o release.yml não tem mais o passo da LP nem URL de site do upstream", () => {
    expect(release).not.toContain("A versão aparece na página de changelog da LP?");
    expect(release).not.toMatch(/deskcomm\.com\.br/i);
  });

  it("toda seção do CHANGELOG segue o cabeçalho `## [X.Y.Z] — AAAA-MM-DD`", () => {
    const CABECALHO_VERSAO = /^## \[(\d+\.\d+\.\d+)\]\s*[—–-]\s*(\d{4}-\d{2}-\d{2})\s*$/;
    const cabecalhos = changelog.split("\n").filter((l) => l.startsWith("## "));
    const fora = cabecalhos.filter((l) => !CABECALHO_VERSAO.test(l) && l.trim() !== "## [Não lançado]");
    expect(fora, "seção com cabeçalho fora do formato").toEqual([]);
    expect(cabecalhos.filter((l) => CABECALHO_VERSAO.test(l)).length).toBeGreaterThan(0);
  });
});
