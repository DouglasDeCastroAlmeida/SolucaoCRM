/**
 * VISUAL DE MENSAGEIRO: A JORNADA QUE TIRA AS CAPTURAS (issue #82, ADR 0007).
 *
 * Abre as telas de uma etapa no computador e no celular, nos temas claro e escuro, e guarda uma captura
 * de cada. É a prova que o dono olha na homologação antes de uma etapa ir para produção, e também o
 * "antes" (rodado antes de mexer em qualquer tela).
 *
 * Como rodar (precisa do app e do Supabase locais, como as outras specs):
 *   VISUAL_ETAPA=1 VISUAL_FASE=antes  pnpm playwright test tests/e2e/visual-de-mensageiro-jornada.spec.ts
 *   VISUAL_ETAPA=1 VISUAL_FASE=depois pnpm playwright test tests/e2e/visual-de-mensageiro-jornada.spec.ts
 *   (`VISUAL_ETAPA=todas` percorre as cinco; o padrão é a etapa 1.)
 *
 * As capturas vão para `evidence/visual-de-mensageiro/<fase>/etapa-<N>/<tela>-<viewport>-<tema>.png`.
 *
 * O que ela afirma, além de capturar: a tela abriu (sem a página de erro), nada estoura a largura da janela
 * no celular, e não houve erro de console da própria página. Não compara imagem com imagem: a marca muda a
 * cor de destaque, e o visual é aprovado pelo dono olhando as capturas.
 *
 * FORA_DO_CI: escrita sem poder rodar na máquina do autor (sem Docker/Supabase local). Sobe para uma
 * `SPECS_PARTE_*` depois de passar uma vez a mão.
 */
import { mkdirSync } from "node:fs";
import * as path from "node:path";

import { expect, test, type Page } from "./helpers/test";

import { lerCreds, loginComoAdmin, loginComoDono } from "./helpers/login-admin";
import {
  CHAVE_DO_TEMA,
  ETAPAS,
  TELAS_POR_ETAPA,
  TEMAS,
  VALOR_DO_TEMA,
  VIEWPORTS,
  type Acesso,
  type Etapa,
  type TelaDoVisual,
} from "./helpers/visual-de-mensageiro-telas";

const FASE = process.env.VISUAL_FASE === "depois" ? "depois" : "antes";
const PEDIDA = process.env.VISUAL_ETAPA ?? "1";
const ETAPAS_PEDIDAS: Etapa[] =
  PEDIDA === "todas" ? [...ETAPAS] : ETAPAS.filter((e) => String(e) === PEDIDA);

const RAIZ_DA_EVIDENCIA = path.join(process.cwd(), "evidence", "visual-de-mensageiro", FASE);

// Um login por papel: o seguinte esperaria a próxima janela do TOTP.
const SESSAO: Record<Exclude<Acesso, "publica">, string> = {
  app: `/tmp/e2e-sessao-visual-app-${process.pid}.json`,
  plataforma: `/tmp/e2e-sessao-visual-plataforma-${process.pid}.json`,
};

test.describe.configure({ mode: "serial", timeout: 120_000 });

test.beforeAll(async ({ browser }, testInfo) => {
  test.setTimeout(180_000);
  const creds = lerCreds();
  for (const [papel, login] of [
    ["app", loginComoAdmin],
    ["plataforma", loginComoDono],
  ] as const) {
    const contexto = await browser.newContext({ baseURL: testInfo.project.use.baseURL, storageState: undefined });
    const page = await contexto.newPage();
    await login(page, creds);
    await contexto.storageState({ path: SESSAO[papel] });
    await contexto.close();
  }
});

test("a etapa pedida existe", () => {
  expect(ETAPAS_PEDIDAS, `VISUAL_ETAPA=${PEDIDA}: use 1 a 5 ou "todas"`).not.toHaveLength(0);
});

async function estouroHorizontal(page: Page): Promise<number> {
  return page.evaluate(() => document.body.scrollWidth - document.documentElement.clientWidth);
}

for (const etapa of ETAPAS_PEDIDAS) {
  for (const tela of TELAS_POR_ETAPA[etapa]) {
    for (const vp of VIEWPORTS) {
      for (const tema of TEMAS) {
        test(`etapa ${etapa} · ${tela.slug} · ${vp.nome} · ${tema}`, async ({ browser, baseURL }) => {
          const pasta = path.join(RAIZ_DA_EVIDENCIA, `etapa-${etapa}`);
          mkdirSync(pasta, { recursive: true });

          const contexto = await browser.newContext({
            baseURL: baseURL ?? undefined,
            viewport: { width: vp.largura, height: vp.altura },
            isMobile: vp.celular,
            hasTouch: vp.celular,
            locale: "pt-BR",
            storageState: semSessao(tela) ? undefined : SESSAO[tela.acesso as Exclude<Acesso, "publica">],
          });
          const valor = VALOR_DO_TEMA[tema];
          await contexto.addInitScript(
            ([chave, v]) => {
              try {
                window.localStorage.setItem(chave as string, v as string);
              } catch {
                // sem localStorage: segue com o tema do sistema.
              }
            },
            [CHAVE_DO_TEMA, valor],
          );
          const page = await contexto.newPage();
          const errosDeConsole: string[] = [];
          page.on("pageerror", (e) => errosDeConsole.push(e.message));

          try {
            const resposta = await page.goto(tela.rota, { waitUntil: "domcontentloaded" });
            expect(resposta?.status() ?? 0, `${tela.rota} respondeu`).toBeLessThan(400);
            await page.waitForLoadState("networkidle", { timeout: 20_000 }).catch(() => undefined);
            await expect(page.locator("html")).toHaveAttribute("data-theme", valor);

            if (vp.celular) expect(await estouroHorizontal(page), "estouro horizontal no celular").toBeLessThanOrEqual(0);
            expect(errosDeConsole, "erro de script da própria página").toEqual([]);

            await page.screenshot({ path: path.join(pasta, `${tela.slug}-${vp.nome}-${tema}.png`), fullPage: false });
          } finally {
            await contexto.close();
          }
        });
      }
    }
  }
}

function semSessao(tela: TelaDoVisual): boolean {
  return tela.acesso === "publica";
}
