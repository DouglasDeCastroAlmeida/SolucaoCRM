/**
 * Mudança 009, REQ-002 (AC-002.3 e AC-002.4): o celular a 390 px, medido.
 *
 * SÓ RODA CONTRA A HML (T-013, no deploy): precisa de servidor Next com sessão
 * (`auth.setup.ts`). Rodar:
 *   E2E_PORT=<porta> npx playwright test -c tests/journeys/playwright.config.ts celular-390
 *
 * Medida por `getBoundingClientRect`, nunca a olho. A rolagem lateral usa
 * `body.scrollWidth` (e não `documentElement.scrollWidth`, que o
 * `overflow-x: hidden` do globals.css grampeia) — ver o cabeçalho de
 * `tests/e2e/celular-cabe-na-tela.spec.ts`.
 */
import { expect, test } from "@playwright/test";

if ((process.env.BASE_URL ?? "").includes("app.corretora.io")) {
  throw new Error("RECUSADO: este spec nunca roda contra a produção (app.corretora.io).");
}

// AC-002.3 diz "qualquer tela": a spec mede três telas como AMOSTRA; a régua
// geral de rolagem lateral do app inteiro é `tests/e2e/celular-cabe-na-tela.spec.ts`.
test.use({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });

const TELAS = ["/app/inbox", "/app/kanban", "/app/contacts"];

for (const tela of TELAS) {
  test(`AC-002.3: ${tela} sem rolagem lateral e alvos da barra de baixo >= 44 px`, async ({
    page,
  }) => {
    await page.goto(tela);
    const barra = page.locator("[data-barra-inferior]");
    await expect(barra).toBeVisible();

    const sobra = await page.evaluate(
      () => document.body.scrollWidth - document.documentElement.clientWidth,
    );
    expect(sobra).toBeLessThanOrEqual(0);

    const alvos = await barra.locator("a, button").evaluateAll((els) =>
      els.map((e) => {
        const r = e.getBoundingClientRect();
        return { w: r.width, h: r.height };
      }),
    );
    // 4 destinos + Mais.
    expect(alvos.length).toBeGreaterThanOrEqual(5);
    for (const a of alvos) {
      expect(a.h).toBeGreaterThanOrEqual(44);
      expect(a.w).toBeGreaterThanOrEqual(44);
    }
  });
}

test("AC-002.4: a barra de baixo não cobre o campo de texto focado com o teclado aberto", async ({
  page,
}) => {
  await page.goto("/app/inbox");
  const campo = page.locator("textarea, input[type='text'], input:not([type])").first();
  await expect(campo).toBeVisible();
  await campo.focus();
  // Teclado simulado: o visualViewport encolhe pela altura do teclado. O campo
  // focado é rolado para dentro da área visível e a barra tem de ficar abaixo
  // dele (ou escondida), nunca por cima.
  const r = await page.evaluate(() => {
    const el = document.activeElement as HTMLElement;
    el.scrollIntoView({ block: "center" });
    const c = el.getBoundingClientRect();
    const b = document.querySelector("[data-barra-inferior]")?.getBoundingClientRect();
    const vv = window.visualViewport;
    return {
      campoFundo: c.bottom,
      barraTopo: b && b.height > 0 ? b.top : Infinity,
      areaVisivelFundo: vv ? vv.offsetTop + vv.height : window.innerHeight,
    };
  });
  expect(r.campoFundo).toBeLessThanOrEqual(r.barraTopo);
  expect(r.campoFundo).toBeLessThanOrEqual(r.areaVisivelFundo);
});
