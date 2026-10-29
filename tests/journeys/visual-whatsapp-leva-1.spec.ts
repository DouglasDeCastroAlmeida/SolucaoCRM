/**
 * 009 / T-013 (AC-005.1, AC-005.2, AC-007.1, AC-001.3) — jornada da leva 1 (casca) na homologação.
 *
 * Roda contra a homologação (BASE_URL, padrão https://hml.corretora.io) e RECUSA a produção.
 * Credenciais: lidas SÓ em tempo de execução de `~/.secrets/hml-admin.env`; nunca impressas nem
 * gravadas. SÓ LÊ: navega, troca o tema (localStorage) e expande/recolhe o menu. Não cria dado.
 * Ao final restaura o menu para recolhido e o tema para o valor que a conta tinha.
 *
 * Capturas (só as novas) em evidence/009-visual-whatsapp/leva-1/:
 *   <tela>-<claro|escuro>-<1440|390>.png   e   medidas.md
 * E-mail e campos sensíveis saem com máscara magenta; nomes de clientes (listas, cartões,
 * linhas de tabela) saem borrados antes da captura.
 *
 * Rodar (sem o projeto `setup`):
 *   npx playwright test -c tests/journeys/playwright.config.ts --no-deps --project=chromium visual-whatsapp-leva-1
 */
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";

import { expect, test, type Browser, type BrowserContext, type Page } from "@playwright/test";

const BASE_URL = (process.env.BASE_URL ?? "https://hml.corretora.io").replace(/\/+$/, "");
if (BASE_URL.includes("app.corretora.io")) {
  throw new Error("RECUSADO: este spec nunca roda contra a produção (app.corretora.io).");
}

const PASTA = path.join(process.cwd(), "evidence", "009-visual-whatsapp", "leva-1");
const MAGENTA = "#ff00ff";

const TELAS = [
  { nome: "inbox", rota: "/app/inbox", pessoal: true },
  { nome: "contacts", rota: "/app/contacts", pessoal: true },
  { nome: "kanban", rota: "/app/kanban", pessoal: true },
  { nome: "agenda", rota: "/app/agenda", pessoal: true },
  { nome: "tasks", rota: "/app/tasks", pessoal: true },
  { nome: "agents", rota: "/app/ai/agents", pessoal: false },
  { nome: "usage", rota: "/app/ai/usage", pessoal: false },
  { nome: "analise", rota: "/app/analise", pessoal: false },
  { nome: "settings", rota: "/app/settings", pessoal: false },
] as const;
const TEMAS = [
  { chave: "light", rotulo: "claro" },
  { chave: "dark", rotulo: "escuro" },
] as const;

function lerEnv(arquivo: string): Record<string, string> {
  const saida: Record<string, string> = {};
  const texto = fs.readFileSync(path.join(os.homedir(), ".secrets", arquivo), "utf8");
  for (const linha of texto.split(/\r?\n/)) {
    const m = linha.match(/^\s*([A-Za-z0-9_]+)\s*=\s*(.*)$/);
    if (m?.[1] !== undefined) saida[m[1]] = (m[2] ?? "").trim().replace(/^["']|["']$/g, "");
  }
  return saida;
}

const admin = lerEnv("hml-admin.env");
const medidas: string[] = [];
const falhasGerais: string[] = [];

function linha(texto: string) {
  medidas.push(texto);
}

async function entrar(browser: Browser, mobile: boolean): Promise<{ ctx: BrowserContext; page: Page }> {
  const ctx = await browser.newContext({
    baseURL: BASE_URL,
    viewport: mobile ? { width: 390, height: 844 } : { width: 1440, height: 900 },
    hasTouch: mobile,
    isMobile: mobile,
    deviceScaleFactor: mobile ? 2 : 1,
  });
  ctx.setDefaultTimeout(60_000);
  ctx.setDefaultNavigationTimeout(90_000);
  const page = await ctx.newPage();
  await page.goto("/login", { waitUntil: "load" });
  await page.locator("#email").fill(admin.HML_ADMIN_EMAIL ?? "");
  await page.locator("#password").fill(admin.HML_ADMIN_PASSWORD ?? "");
  await page.getByRole("button", { name: "Entrar", exact: true }).click();
  await page.waitForURL(/\/app/, { timeout: 90_000 });
  return { ctx, page };
}

/** Borra nomes de clientes (listas, cartões, linhas) para a captura; não altera layout. */
async function borrarPessoas(page: Page) {
  await page.addStyleTag({
    content: `main :is(td, li, a, [role="row"], [role="listitem"], [data-etapa-do-quadro] > *) { filter: blur(7px) !important; }
      main :is(h1, h2, nav, [role="tablist"], [data-testid="alternador-de-visao"]) { filter: none !important; }`,
  });
}

function mascaras(page: Page) {
  return [
    page.getByText(admin.HML_ADMIN_EMAIL ?? "\u0000nunca"),
    page.locator('input[type="password"]'),
    page.locator('[data-sensivel="true"]'),
  ];
}

type Medida = {
  menu: number | null;
  rolagem: number;
  topbar: number | null;
  alvoMin: number | null;
};

async function medir(page: Page): Promise<Medida> {
  return page.evaluate(() => {
    const vis = (el: Element | null) => {
      if (!el) return null;
      const r = el.getBoundingClientRect();
      return r.width > 0 && r.height > 0 ? r : null;
    };
    const aside = vis(document.querySelector("aside"));
    const header = vis(document.querySelector("header"));
    const barra = document.querySelector("[data-barra-inferior]");
    let alvoMin: number | null = null;
    if (barra && vis(barra)) {
      for (const el of Array.from(barra.querySelectorAll("a, button"))) {
        const r = vis(el);
        if (!r) continue;
        const menor = Math.min(r.width, r.height);
        alvoMin = alvoMin === null ? menor : Math.min(alvoMin, menor);
      }
    }
    return {
      menu: aside ? Math.round(aside.width * 100) / 100 : null,
      rolagem: document.body.scrollWidth - document.documentElement.clientWidth,
      topbar: header ? Math.round(header.height * 100) / 100 : null,
      alvoMin: alvoMin === null ? null : Math.round(alvoMin * 100) / 100,
    };
  });
}

function marca(ok: boolean) {
  return ok ? "PASSOU" : "FALHOU";
}

test.use({ storageState: { cookies: [], origins: [] } });
test.describe.configure({ mode: "default", timeout: 480_000 });

test.beforeAll(() => {
  fs.mkdirSync(PASTA, { recursive: true });
});

test.afterAll(() => {
  const cab = [
    "# Medidas — leva 1 (casca) na homologação",
    "",
    `Base: ${BASE_URL}. Gerado por tests/journeys/visual-whatsapp-leva-1.spec.ts.`,
    "Esperado: menu recolhido 64 px (só computador; no celular o menu é gaveta), rolagem lateral <= 0,",
    "TopBar 56 px, menor alvo de toque da barra de baixo >= 44 px (só celular).",
    "",
  ];
  fs.writeFileSync(path.join(PASTA, "medidas.md"), [...cab, ...medidas, ""].join("\n"), "utf8");
});

async function percorrer(page: Page, mobile: boolean) {
  const tamanho = mobile ? "390" : "1440";
  const temaOriginal = await page.evaluate(() => localStorage.getItem("deskcomm-theme"));
  try {
    for (const tema of TEMAS) {
      await page.evaluate((t) => localStorage.setItem("deskcomm-theme", t), tema.chave);
      for (const tela of TELAS) {
        const rotulo = `${tela.nome}/${tema.rotulo}/${tamanho}`;
        const erros: string[] = [];
        const aoErrar = (e: Error) => erros.push(e.message.slice(0, 120));
        page.on("pageerror", aoErrar);
        try {
          const resp = await page.goto(tela.rota, { waitUntil: "load" });
          await expect(page.locator("main").first()).toBeVisible({ timeout: 60_000 });
          await page.waitForLoadState("networkidle").catch(() => undefined);
          expect(await page.locator("html").getAttribute("data-theme")).toBe(tema.chave);

          const falhas: string[] = [];
          if ((resp?.status() ?? 200) >= 400) falhas.push(`HTTP ${resp?.status()}`);
          if (erros.length) falhas.push(`erro de página: ${erros[0]}`);

          // Formas que não podem mudar (AC-005.1) e telas que só herdam a casca (AC-005.2).
          let forma = "";
          if (tela.nome === "kanban") {
            const colunas = await page.locator("[data-etapa-do-quadro]").count();
            forma = `colunas do kanban visíveis: ${colunas}`;
            if (colunas < 1) falhas.push("nenhuma coluna do kanban");
          } else if (tela.nome === "agenda") {
            const tela_ = await page.getByTestId("tela-agenda").isVisible();
            const alternador = await page.getByTestId("alternador-de-visao").isVisible();
            forma = `agenda: tela=${tela_} alternador de visão=${alternador}`;
            if (!tela_ || !alternador) falhas.push("agenda sem tela/alternador de visão");
          } else if (tela.nome === "analise" || tela.nome === "settings") {
            forma = "abriu sem erro";
          }

          const m = await medir(page);
          if (!mobile) {
            if (m.menu !== 64) falhas.push(`menu ${m.menu} (esperado 64)`);
          } else if (m.menu !== null) {
            falhas.push(`menu visível no celular (${m.menu}); esperado gaveta`);
          }
          if (m.rolagem > 0) falhas.push(`rolagem lateral ${m.rolagem}`);
          if (m.topbar !== 56) falhas.push(`TopBar ${m.topbar} (esperado 56)`);
          if (mobile && (m.alvoMin === null || m.alvoMin < 44)) falhas.push(`alvo mínimo ${m.alvoMin} (esperado >= 44)`);

          if (tela.pessoal) await borrarPessoas(page);
          await page.screenshot({
            path: path.join(PASTA, `${tela.nome}-${tema.rotulo}-${tamanho}.png`),
            mask: mascaras(page),
            maskColor: MAGENTA,
            animations: "disabled",
          });

          linha(
            `- ${marca(falhas.length === 0)} ${rotulo}: menu=${mobile ? "gaveta (oculto)" : `${m.menu}px`}; ` +
              `rolagem lateral=${m.rolagem}; TopBar=${m.topbar}px; ` +
              `menor alvo da barra de baixo=${mobile ? `${m.alvoMin}px` : "n/a (computador)"}` +
              `${forma ? `; ${forma}` : ""}${falhas.length ? ` | ${falhas.join("; ")}` : ""}`,
          );
          if (falhas.length) falhasGerais.push(`${rotulo}: ${falhas.join("; ")}`);
        } catch (e) {
          const msg = String((e as Error).message ?? e).split("\n")[0]?.slice(0, 200) ?? "";
          linha(`- FALHOU ${rotulo}: ${msg}`);
          falhasGerais.push(`${rotulo}: ${msg}`);
        } finally {
          page.off("pageerror", aoErrar);
        }
      }
    }
  } finally {
    // Restaura o tema que a conta tinha.
    await page.evaluate((t) => {
      if (t === null) localStorage.removeItem("deskcomm-theme");
      else localStorage.setItem("deskcomm-theme", t);
    }, temaOriginal);
  }
}

test("AC-005.1/005.2/007.1: telas da leva 1 no computador (1440x900), claro e escuro", async ({ browser }) => {
  const { ctx, page } = await entrar(browser, false);
  try {
    await percorrer(page, false);
    expect(falhasGerais.filter((f) => f.includes("/1440")), "falhas 1440").toEqual([]);
  } finally {
    await ctx.close();
  }
});

test("AC-005.1/005.2/007.1: telas da leva 1 no celular com toque (390x844), claro e escuro", async ({ browser }) => {
  const { ctx, page } = await entrar(browser, true);
  try {
    await percorrer(page, true);
    expect(falhasGerais.filter((f) => f.includes("/390")), "falhas 390").toEqual([]);
  } finally {
    await ctx.close();
  }
});

test("AC-001.3: expandir o menu mostra 240 px, persiste ao recarregar; recolher também persiste", async ({ browser }) => {
  const { ctx, page } = await entrar(browser, false);
  const largura = async () => (await medir(page)).menu;
  const alternar = () => page.locator('aside button[aria-label*="sidebar" i]').first().click();
  try {
    await page.goto("/app/inbox", { waitUntil: "load" });
    await expect(page.locator("aside").first()).toBeVisible({ timeout: 60_000 });
    // Ponto de partida: recolhido (padrão da leva 1). Se a conta o deixou expandido, recolhe.
    if ((await largura()) !== 64) {
      await alternar();
      await expect.poll(largura, { timeout: 15_000 }).toBe(64);
    }

    await alternar();
    await expect.poll(largura, { timeout: 15_000 }).toBe(240);
    await page.reload({ waitUntil: "load" });
    await expect.poll(largura, { timeout: 15_000 }).toBe(240);
    await page.screenshot({ path: path.join(PASTA, "menu-expandido-claro-1440.png"), mask: mascaras(page), maskColor: MAGENTA, animations: "disabled" });
    linha("- PASSOU AC-001.3: expandir => 240px, persistiu após recarregar");

    await alternar();
    await expect.poll(largura, { timeout: 15_000 }).toBe(64);
    await page.reload({ waitUntil: "load" });
    await expect.poll(largura, { timeout: 15_000 }).toBe(64);
    linha("- PASSOU AC-001.3: recolher => 64px, persistiu após recarregar");
  } catch (e) {
    linha(`- FALHOU AC-001.3: ${String((e as Error).message ?? e).split("\n")[0]?.slice(0, 200)}`);
    throw e;
  } finally {
    // Restaura: menu recolhido.
    try {
      if ((await largura()) === 240) await alternar();
      await expect.poll(largura, { timeout: 15_000 }).toBe(64);
    } catch {
      /* melhor esforço */
    }
    await ctx.close();
  }
});
