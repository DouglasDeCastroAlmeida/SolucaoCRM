import * as os from "node:os";
import * as path from "node:path";

import { defineConfig } from "@playwright/test";

import { resolverAlvo } from "./tests/e2e/helpers/visual-de-mensageiro-alvo";

/**
 * Configuração da jornada de capturas contra a HOMOLOGAÇÃO (issue #103).
 *
 * Não sobe servidor nem lê `.env.e2e`: o app é o de https://hml.corretora.io. Só vale com
 * `VISUAL_ALVO=hml`; qualquer outro alvo derruba o carregamento desta configuração. Sem rastro (trace,
 * vídeo, captura automática) porque o relatório do Playwright não pode carregar o formulário de login.
 */
const alvo = resolverAlvo(process.env);
if (alvo.modo !== "hml") {
  throw new Error("playwright.visual-hml.config.ts só serve a VISUAL_ALVO=hml.");
}

process.env.VISUAL_REGISTRO ??= path.join(os.tmpdir(), `visual-hml-registro-${Date.now()}.jsonl`);

export default defineConfig({
  testDir: "./tests/e2e",
  testMatch: "visual-de-mensageiro-jornada.spec.ts",
  timeout: 120_000,
  fullyParallel: false,
  workers: 1,
  reporter: [["line"]],
  use: {
    baseURL: alvo.baseURL,
    serviceWorkers: "block",
    trace: "off",
    video: "off",
    screenshot: "off",
  },
  projects: [{ name: "chromium", use: { browserName: "chromium" } }],
});
