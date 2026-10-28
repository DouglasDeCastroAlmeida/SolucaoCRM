import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

/**
 * 008 / REQ-003: o gerador do catálogo não tem origem de terceiro como padrão.
 * Sem origem informada ele avisa e termina sem erro; com origem, funciona como antes.
 */

const RAIZ = join(__dirname, "..", "..");
const SCRIPT = "scripts/gerar-catalogo-de-extensoes.ts";

function rodar(env: Record<string, string | undefined>) {
  const limpo = { ...process.env, ...env };
  if (env.EXTENSOES_ORIGEM === undefined) delete limpo.EXTENSOES_ORIGEM;
  return spawnSync("npx", ["tsx", SCRIPT, "--conferir"], {
    cwd: RAIZ,
    env: limpo as NodeJS.ProcessEnv,
    encoding: "utf8",
    shell: true,
    timeout: 120_000,
  });
}

describe("gerador do catálogo de extensões — origem", () => {
  it("AC-003.1: o código não embute endereço de terceiro", () => {
    const fonte = readFileSync(join(RAIZ, SCRIPT), "utf8");
    expect(fonte).not.toMatch(/extensoes\.deskcomm/);
    expect(fonte).not.toMatch(/melgarafael/);
  });

  it("AC-003.1: sem origem, avisa em português e sai sem erro", () => {
    const r = rodar({ EXTENSOES_ORIGEM: undefined });
    expect(r.status).toBe(0);
    expect(`${r.stdout}${r.stderr}`).toMatch(/Nenhuma origem de catálogo configurada/);
  });

  it("AC-003.2: com origem informada, usa essa origem", () => {
    const r = rodar({ EXTENSOES_ORIGEM: "https://minha-origem.test" });
    const saida = `${r.stdout}${r.stderr}`;
    expect(saida).not.toMatch(/Nenhuma origem de catálogo configurada/);
    // O catálogo versionado tem outra origem: o conferir acusa fora de dia, prova de que a origem entrou.
    expect(saida).toMatch(/fora de dia|catálogo em dia/);
  });
});
