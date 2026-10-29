/**
 * AC-012.1: a varredura de segredos reprova segredo plantado e aprova diff limpo.
 *
 * Os casos que rodam o binário usam `it.skipIf(!temGitleaks)`: sem `gitleaks` no
 * PATH o teste é PULADO (e dito no relatório), nunca verde de mentira. Os casos
 * estáticos (config + passo no CI) rodam sempre.
 */
import { spawnSync } from "node:child_process";
import { randomBytes } from "node:crypto";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const raiz = process.env.REPO ?? process.cwd();
const temGitleaks = spawnSync("gitleaks", ["version"]).status === 0;

function varrer(conteudo: string): number {
  const dir = mkdtempSync(join(tmpdir(), "gl-"));
  try {
    writeFileSync(join(dir, "app.ts"), conteudo);
    const r = spawnSync(
      "gitleaks",
      ["detect", "--no-git", "--source", dir, "--config", join(raiz, ".gitleaks.toml"), "--no-banner"],
      { encoding: "utf8" },
    );
    return r.status ?? -1;
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

describe("gitleaks", () => {
  it.skipIf(!temGitleaks)("AC-012.1: reprova um segredo falso plantado", () => {
    // montado em tempo de execução: o literal nunca entra no repositório
    const token = "gh" + "p_" + randomBytes(27).toString("base64url").replace(/[-_]/g, "a").slice(0, 36);
    expect(varrer(`const t = "${token}";\n`)).toBe(1);
  });

  it.skipIf(!temGitleaks)("AC-012.1: aprova um diff limpo", () => {
    expect(varrer("export const soma = (a: number, b: number) => a + b;\n")).toBe(0);
  });

  it("AC-012.1: o verify roda o gitleaks fixado por commit, com .gitleaks.toml", () => {
    const ci = readFileSync(join(raiz, ".github", "workflows", "ci.yml"), "utf8");
    expect(ci).toMatch(/uses: gitleaks\/gitleaks-action@[0-9a-f]{40}/);
    expect(ci).not.toMatch(/gitleaks-action@(latest|main|master)/);
    expect(ci).toContain("GITLEAKS_CONFIG: .gitleaks.toml");
    const cfg = readFileSync(join(raiz, ".gitleaks.toml"), "utf8");
    expect(cfg).toMatch(/useDefault = true/);
    expect(cfg).toContain(String.raw`\.env\.example`);
  });

  it("o .gitleaksignore só tem impressão digital exata de commit completo, sem curinga, e o teto só desce", () => {
    const linhas = readFileSync(join(raiz, ".gitleaksignore"), "utf8")
      .split(/\r?\n/)
      .map((l) => l.trim())
      .filter((l) => l !== "" && !l.startsWith("#"));
    const TETO = 3;
    expect(linhas.length).toBeLessThanOrEqual(TETO);
    for (const l of linhas) {
      expect(l, `linha fora do formato commit:arquivo:regra:linha — ${l}`).toMatch(
        /^[0-9a-f]{40}:[^:*?\[\]]+:[a-z0-9-]+:\d+$/,
      );
    }
  });
});
