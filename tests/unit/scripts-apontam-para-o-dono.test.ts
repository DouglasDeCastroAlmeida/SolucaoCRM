/**
 * SDD 008 / T-006 (AC-002.1): os scripts que falam com o GitHub apontam para o
 * repositório do dono, lido da âncora `_identidade-deste-repo.ts` - o literal não
 * é repetido aqui. Trocar a âncora troca o que este teste exige, e o script que
 * ficou com o valor antigo reprova.
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { REPOSITORIO_DESTE_REPO } from "./_identidade-deste-repo";

const RAIZ = resolve(__dirname, "../..");
const ler = (p: string) => readFileSync(resolve(RAIZ, p), "utf-8");

// O dono do upstream é montado em pedaços para este arquivo não ser, ele mesmo,
// uma ocorrência que a cerca da fatia 5 teria de abrir exceção.
const UPSTREAM = ["mel", "garafael"].join("");

const SCRIPTS = [
  "scripts/cortar-release.ts",
  "scripts/instalar-guias.sh",
  "scripts/vigia-colisao-de-migration.ts",
  "scripts/migration-populacao.sh",
  "loop/hooks/check-migration-triple.sh",
];

describe("scripts de repositório apontam para o dono (SDD 008)", () => {
  for (const arquivo of SCRIPTS) {
    it(`AC-002.1: ${arquivo} não cita o upstream`, () => {
      expect(ler(arquivo).toLowerCase()).not.toContain(UPSTREAM);
    });
  }

  for (const arquivo of SCRIPTS.slice(0, 4)) {
    it(`AC-002.1: ${arquivo} referencia ${"o repositório da âncora"}`, () => {
      expect(ler(arquivo).toLowerCase()).toContain(REPOSITORIO_DESTE_REPO.toLowerCase());
    });
  }
});
