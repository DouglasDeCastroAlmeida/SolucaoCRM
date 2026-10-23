/**
 * AC-006.4: o template de PR cobra "migration compatível com a versão anterior
 * do app" (mudança SDD 001; deploy com migration antes do app exige isso).
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

describe("template de PR", () => {
  it("AC-006.4: traz o item de checklist de migration compatível com a versão anterior do app", () => {
    const t = readFileSync(
      join(process.env.REPO ?? process.cwd(), ".github", "PULL_REQUEST_TEMPLATE.md"),
      "utf8",
    );
    expect(t).toMatch(
      /^- \[ \] Se há migration: ela é compatível com a versão anterior do app/m,
    );
    expect(t).toMatch(/só adiciona; apagar\/renomear em deploy posterior/);
  });
});
