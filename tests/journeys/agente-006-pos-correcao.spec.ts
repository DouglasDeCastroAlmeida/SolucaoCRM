/**
 * T-040 (reprova das correções do PR #28) — a 006 provada PELA TELA, na homologação, com serviços reais.
 *
 * Roda contra https://hml.corretora.io (BASE_URL). RECUSA a produção.
 *
 * Credenciais: lidas SÓ em tempo de execução de `~/.secrets/*.env`; nada disto vai para
 * arquivo, log ou captura. As capturas são do ELEMENTO relevante (nunca a página inteira) e
 * mascaram e-mail, campos de senha e qualquer chave.
 *
 * Rodar (sem o projeto `setup`, que pede o MFA do ambiente local):
 *   npx playwright test -c tests/journeys/playwright.config.ts --no-deps --project=chromium agente-006-na-homologacao
 *
 * Tudo o que cria na homologação leva o prefixo "[teste-006]" e NÃO é apagado.
 */
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";

import { expect, test, type BrowserContext, type Locator, type Page } from "@playwright/test";

const BASE_URL = (process.env.BASE_URL ?? "https://hml.corretora.io").replace(/\/+$/, "");
if (BASE_URL.includes("app.corretora.io")) {
  throw new Error("RECUSADO: este spec nunca roda contra a produção (app.corretora.io).");
}

const PASTA = path.join(process.cwd(), "evidence", "006-agente", "hml-2026-10-29");
const TEMPO = 60_000;
type Env = Record<"HML_ADMIN_EMAIL" | "HML_ADMIN_PASSWORD" | "SUPABASE_URL" | "SUPABASE_SERVICE_ROLE_KEY" | "API_KEY", string>;

function lerEnv(arquivo: string): Env {
  const saida: Record<string, string> = {};
  const texto = fs.readFileSync(path.join(os.homedir(), ".secrets", arquivo), "utf8");
  for (const linha of texto.split(/\r?\n/)) {
    const m = linha.match(/^\s*([A-Za-z0-9_]+)\s*=\s*(.*)$/);
    if (m?.[1] !== undefined) saida[m[1]] = (m[2] ?? "").trim().replace(/^["']|["']$/g, "");
  }
  return saida as Env;
}

const admin = lerEnv("hml-admin.env");
const supa = lerEnv("supabase-hml.env");

/** Leitura (somente GET) por REST com a service role — para conferir o que a tela gravou. */
async function ler<T = Record<string, unknown>>(tabelaEFiltro: string): Promise<T[]> {
  const r = await fetch(`${supa.SUPABASE_URL}/rest/v1/${tabelaEFiltro}`, {
    headers: {
      apikey: supa.SUPABASE_SERVICE_ROLE_KEY,
      Authorization: `Bearer ${supa.SUPABASE_SERVICE_ROLE_KEY}`,
    },
  });
  if (!r.ok) throw new Error(`REST ${tabelaEFiltro.split("?")[0]} -> ${r.status}`);
  return (await r.json()) as T[];
}

// ─── registro dos passos ────────────────────────────────────────────────────
type Estado = "PASSOU" | "FALHOU" | "NÃO PÔDE SER EXERCITADO";
const resultados: Array<{ passo: string; estado: Estado; nota: string }> = [];
const medidas: string[] = [];
const criado: string[] = [];

function registrar(passo: string, estado: Estado, nota: string) {
  resultados.push({ passo, estado, nota });
}
function medir(linha: string) {
  medidas.push(linha);
}

let n = 0;
/** Captura o ELEMENTO (não a página) mascarando e-mail, senhas e o que mais vier. */
async function foto(page: Page, nome: string, alvo?: Locator, extraMask: Locator[] = []) {
  n += 1;
  const arquivo = path.join(PASTA, `${String(n + 30).padStart(2, "0")}-${nome}-pos-correcao.png`);
  const mask = [
    page.getByText(admin.HML_ADMIN_EMAIL),
    page.locator('input[type="password"]'),
    page.locator('[data-sensivel="true"]'),
    ...extraMask,
  ];
  const el = alvo ?? conteudo(page);
  await el.screenshot({ path: arquivo, mask, animations: "disabled" });
  return arquivo;
}


/** Roda um passo; registra o resultado SEM interromper os próximos. */
async function passo(
  id: string,
  fn: () => Promise<string | void>,
  opts: { naoExercitavel?: boolean } = {},
) {
  try {
    const nota = (await fn()) ?? "";
    registrar(id, opts.naoExercitavel ? "NÃO PÔDE SER EXERCITADO" : "PASSOU", nota);
  } catch (e) {
    const msg = String((e as Error).message ?? e).split("\n")[0]?.slice(0, 400) ?? "";
    registrar(id, "FALHOU", msg);
    // Não relança: o Playwright reinicia o worker após uma falha e perderia o estado compartilhado
    // (página logada, resultados). O FALHOU fica no medidas.md e a corrida termina com exit 1 no afterAll.
    fs.mkdirSync("test-results/falhas", { recursive: true });
    await page.screenshot({ path: `test-results/falhas/${id.replace(/[^a-z0-9]+/gi, "-")}.png`, mask: [page.getByText(admin.HML_ADMIN_EMAIL)] }).catch(() => undefined);
  }
}

// ─── ciclo de vida ──────────────────────────────────────────────────────────
test.use({ storageState: { cookies: [], origins: [] } });
test.describe.configure({ mode: "default", timeout: 240_000 });

let contexto: BrowserContext;
let page: Page;

test.beforeAll(async ({ browser }) => {
  fs.mkdirSync(PASTA, { recursive: true });
  contexto = await browser.newContext({ baseURL: BASE_URL, viewport: { width: 1360, height: 900 } });
  contexto.setDefaultTimeout(TEMPO);
  contexto.setDefaultNavigationTimeout(90_000);
  page = await contexto.newPage();
});

test.afterAll(async () => {
  const linhas = [
    "# Prova da 006 na homologacao (T-040 / AC-009.3)",
    "",
    `Alvo: ${BASE_URL}. Gerado pelo spec tests/journeys/agente-006-na-homologacao.spec.ts.`,
    "",
    "| Passo | Resultado | Observacao |",
    "|---|---|---|",
    ...resultados.map((r) => `| ${r.passo} | ${r.estado} | ${r.nota.replace(/\|/g, "/").replace(/\n/g, " ")} |`),
    "",
    "## Medidas por ferramenta",
    "",
    ...medidas.map((m) => `- ${m}`),
    "",
    "## Criado na homologacao (nao apagado)",
    "",
    ...criado.map((c) => `- ${c}`),
    "",
  ];
  fs.writeFileSync(path.join(PASTA, "medidas-pos-correcao.md"), linhas.join("\n"), "utf8");
  await contexto?.close();
  if (resultados.some((r) => r.estado === "FALHOU")) process.exitCode = 1;
});

/** A área de conteúdo da página (o <main> do shell). */
function conteudo(p: Page): Locator {
  return p.locator("main").first();
}


// ─── 1. login ───────────────────────────────────────────────────────────────
test("1. login com a conta da homologacao", async () => {
  await passo("1 login", async () => {
    await page.goto("/login", { waitUntil: "load" });
    await page.waitForLoadState("networkidle").catch(() => undefined);
    await page.locator("#email").fill(admin.HML_ADMIN_EMAIL);
    await page.locator("#password").fill(admin.HML_ADMIN_PASSWORD);
    await page.getByRole("button", { name: "Entrar", exact: true }).click();
    await page.waitForURL(/\/app/, { timeout: 90_000 });
    await expect(conteudo(page)).toBeVisible({ timeout: 60_000 });
    const orgs = await ler<{ id: string }>("organizations?select=id&limit=5");
    medir(`login: URL final ${new URL(page.url()).pathname}; organizacoes visiveis ao servico: ${orgs.length}`);
    return "entrou em /app sem pedir segundo fator";
  });
});

// ─── 3. criar o agente ──────────────────────────────────────────────────────
const FILTRO_AGENTE = "name=eq.%5Bteste-006%5D%20Agente";
// ─── 8. tema e idioma ───────────────────────────────────────────────────────
interface Contraste {
  checados: number;
  todos: Array<{ texto: string; razao: number; aba: boolean }>;
  abaixo: Array<{ texto: string; razao: number; tam: number }>;
  min: number;
}

async function medirContraste(): Promise<Contraste> {
  return page.evaluate(() => {
    const cv = document.createElement("canvas");
    cv.width = cv.height = 1;
    const cx = cv.getContext("2d", { willReadFrequently: true })!;
    const rgba = (css: string): [number, number, number, number] => {
      cx.clearRect(0, 0, 1, 1);
      cx.fillStyle = "#000";
      cx.fillStyle = css;
      cx.fillRect(0, 0, 1, 1);
      const d = cx.getImageData(0, 0, 1, 1).data;
      // pixel premultiplicado no canvas: recupera a cor cheia dividindo pelo alfa
      const a = d[3]! / 255;
      return a === 0 ? [0, 0, 0, 0] : [Math.min(255, d[0]! / a), Math.min(255, d[1]! / a), Math.min(255, d[2]! / a), a];
    };
    const lum = (r: number, g: number, b: number) => {
      const f = (v: number) => {
        v /= 255;
        return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4);
      };
      return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b);
    };
    const fundoDe = (el: Element): [number, number, number] => {
      let e: Element | null = el;
      while (e) {
        const c = rgba(getComputedStyle(e).backgroundColor);
        if (c[3] >= 0.95) return [c[0], c[1], c[2]];
        e = e.parentElement;
      }
      return [255, 255, 255];
    };
    const main = document.querySelector("main")!;
    const abaixo: Array<{ texto: string; razao: number; tam: number }> = [];
    let checados = 0;
    let min = 21;
    const todos: Array<{ texto: string; razao: number; aba: boolean }> = [];
    const walker = document.createTreeWalker(main, NodeFilter.SHOW_TEXT);
    const vistos = new Set<Element>();
    while (walker.nextNode()) {
      const no = walker.currentNode as Text;
      const el = no.parentElement;
      if (!el || vistos.has(el) || !no.textContent?.trim()) continue;
      const r = el.getBoundingClientRect();
      const cs = getComputedStyle(el);
      if (r.width === 0 || r.height === 0 || cs.visibility === "hidden" || cs.display === "none") continue;
      if (el.closest("[aria-hidden='true'], .sr-only, [disabled]")) continue;
      vistos.add(el);
      const fg = rgba(cs.color);
      const bg = fundoDe(el);
      const a = fg[3];
      const m = [0, 1, 2].map((i) => fg[i]! * a + bg[i]! * (1 - a)) as [number, number, number];
      const l1 = lum(...m);
      const l2 = lum(...bg);
      const razao = (Math.max(l1, l2) + 0.05) / (Math.min(l1, l2) + 0.05);
      checados++;
      min = Math.min(min, razao);
      todos.push({ texto: no.textContent!.trim().slice(0, 30), razao: Math.round(razao * 100) / 100, aba: Boolean(el.closest("[role=tab]")) });
      const tam = parseFloat(cs.fontSize);
      const grande = tam >= 24 || (tam >= 18.66 && parseInt(cs.fontWeight, 10) >= 700);
      if (razao < (grande ? 3 : 4.5)) {
        abaixo.push({ texto: no.textContent!.trim().slice(0, 40), razao: Math.round(razao * 100) / 100, tam });
      }
    }
    return { checados, todos, abaixo: abaixo.slice(0, 8), min: Math.round(min * 100) / 100 };
  });
}


// ─── 1. Atualizar ferramentas x3 ────────────────────────────────────────────
test("C1. Atualizar ferramentas 3 vezes: sem quadro de mudanca e ferramenta segue ligada", async () => {
  await passo("C1 atualizar ferramentas x3", async () => {
    const ag = await ler<{ id: string }>(`ai_agents?select=id&${FILTRO_AGENTE}&limit=1`);
    expect(ag.length).toBe(1);
    await page.goto("/app/settings/servidor-mcp-externo", { waitUntil: "load" });
    for (let t = 1; t <= 3; t++) {
      if ((await page.getByText("[teste-006] DeepWiki").count()) > 0) break;
      await page.waitForTimeout(4000);
      await page.reload({ waitUntil: "load" });
    }
    await page.getByRole("button", { name: /Ferramentas de \[teste-006\] DeepWiki/ }).click();
    await page.locator('select[id^="agente-"]').selectOption({ label: "[teste-006] Agente" });
    await expect(page.getByRole("switch").first()).toBeVisible({ timeout: 60_000 });
    const ligados = () => page.locator('[role="switch"][aria-checked="true"]').count();
    if ((await ligados()) === 0) {
      await page.locator("tr", { has: page.getByRole("switch") }).first().getByRole("switch").first().click();
      await expect(page.locator('[role="switch"][aria-checked="true"]').first()).toBeVisible({ timeout: 30_000 });
    }
    const antes = await ligados();
    medir(`antes de atualizar: interruptores ligados=${antes}`);
    expect(antes).toBe(1);
    await foto(page, "mcp-antes-de-atualizar", conteudo(page));
    const falhas: string[] = [];
    for (let i = 1; i <= 3; i++) {
      await page.getByRole("button", { name: /Atualizar ferramentas|Atualizando/ }).click();
      await expect(page.getByRole("button", { name: "Atualizar ferramentas" })).toBeVisible({ timeout: 60_000 });
      await page.waitForTimeout(2500);
      const quadroPergunta = await page.getByTestId("mudancas").innerText().catch(() => "");
      const quadroAlteradas = /servidor mudou/i.test(quadroPergunta);
      const lig = await ligados();
      const ck = await page.getByRole("switch").first().getAttribute("aria-checked");
      medir(`atualizacao ${i}: quadro "O servidor mudou" presente=${quadroAlteradas}; quadro texto="${quadroPergunta.split(/\s+/).join(" ").slice(0, 120)}"; interruptores ligados=${lig}; primeiro interruptor aria-checked=${ck}`);
      if (quadroAlteradas || lig !== 1 || ck !== "true") falhas.push(`#${i}`);
      await foto(page, `mcp-atualizacao-${i}`, conteudo(page));
    }
    if (falhas.length) throw new Error(`atualizacoes com defeito: ${falhas.join(",")}`);
    return "3 atualizacoes seguidas: sem quadro 'O servidor mudou' e a ferramenta continuou ligada (aria-checked=true)";
  });
});

// ─── 2. Uso: frase do teto ──────────────────────────────────────────────────
test("C2. Uso: limite so acompanhamento nao diz 'sem teto'", async () => {
  await passo("C2 frase do teto", async () => {
    await page.goto("/app/ai/usage", { waitUntil: "load" });
    await expect(page.getByTestId("uso-sem-teto")).toBeVisible({ timeout: 60_000 });
    const texto = (await page.getByTestId("uso-sem-teto").innerText()).split(/\s+/).join(" ");
    const cartao = (await conteudo(page).innerText()).match(/US\$\s[\d.,]+\sgastos de US\$\s[\d.,]+/)?.[0];
    medir(`uso pt: cartao="${cartao}"; aviso="${texto}"; contem "sem teto"=${/sem teto/i.test(texto)}`);
    await foto(page, "uso-aviso-pt", conteudo(page));
    expect(texto).not.toMatch(/sem teto/i);
    expect(texto).toMatch(/s[oó] um acompanhamento/i);
    expect(texto).toMatch(/n[aã]o para sozinha/i);
    await page.getByRole("button", { name: /Idioma/ }).click();
    await page.getByRole("menuitem", { name: /Espa/ }).click();
    await page.waitForTimeout(2500);
    try {
      await page.goto("/app/ai/usage", { waitUntil: "load" });
      await expect(page.getByTestId("uso-sem-teto")).toBeVisible({ timeout: 60_000 });
      const es = (await page.getByTestId("uso-sem-teto").innerText()).split(/\s+/).join(" ");
      medir(`uso es: aviso="${es}"`);
      await foto(page, "uso-aviso-es", conteudo(page));
      expect(es).toContain("El límite del mes es solo de seguimiento");
      expect(es).not.toMatch(/no tiene tope/i);
    } finally {
      await page.goto("/app/ai/usage", { waitUntil: "load" });
      await page.getByRole("button", { name: /Idioma|Idiom/ }).click();
      await page.getByRole("menuitem", { name: /Portugu/ }).click();
      await page.waitForTimeout(2000);
    }
    return "aviso diz que o limite e so acompanhamento e a IA nao para sozinha; traducao nova em espanhol presente; idioma devolvido ao portugues";
  });
});

// ─── 3. Contraste no tema escuro ────────────────────────────────────────────
test("C3. Tema escuro: abas inativas e x dos chips >= 4,5", async () => {
  await passo("C3 contraste escuro", async () => {
    const ruins: string[] = [];
    await page.emulateMedia({ colorScheme: "dark" });
    const ag = await ler<{ id: string }>(`ai_agents?select=id&${FILTRO_AGENTE}&limit=1`);
    const telas = [
      { rota: `/app/ai/agents/${ag[0]!.id}`, nome: "agente" },
      { rota: "/app/ai/inbox", nome: "central" },
      { rota: "/app/ai/usage", nome: "uso" },
      { rota: "/app/settings/servidor-mcp-externo", nome: "mcp" },
    ];
    for (const t of telas) {
      await page.goto(t.rota, { waitUntil: "load" });
      await expect(conteudo(page)).toBeVisible({ timeout: 60_000 });
      await page.waitForTimeout(3000);
      const c = await medirContraste();
      const abas = c.todos.filter((x) => x.aba);
      const xs = c.todos.filter((x) => x.texto === "×");
      const minAbas = abas.length ? Math.min(...abas.map((x) => x.razao)) : null;
      const minX = xs.length ? Math.min(...xs.map((x) => x.razao)) : null;
      medir(`escuro ${t.nome}: textos=${c.checados}; menor razao geral=${c.min}; abas=${abas.length} (menor ${minAbas}); "x"=${xs.length} (menor ${minX}); abaixo do minimo=${c.abaixo.length}${c.abaixo.length ? " -> " + c.abaixo.map((a) => `"${a.texto}" ${a.razao}`).join("; ") : ""}`);
      if (c.abaixo.length) ruins.push(`${t.nome}: ${c.abaixo.map((a) => `"${a.texto}" ${a.razao}`).join("; ")}`);
      await foto(page, `escuro-${t.nome}`, conteudo(page));
    }
    await page.emulateMedia({ colorScheme: "light" });
    if (ruins.length) throw new Error(`abaixo de 4,5: ${ruins.join(" || ").slice(0, 300)}`);
    return "todos os textos medidos (inclusive abas inativas e x dos chips) >= 4,5 no tema escuro";
  });
});
