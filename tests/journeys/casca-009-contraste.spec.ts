/**
 * 009 / AC-003.2 (T-010) — contraste de TODO texto visível nas telas principais, nos dois temas.
 *
 * Roda contra a homologação (BASE_URL, padrão https://hml.corretora.io) e RECUSA a produção.
 * Credenciais: lidas SÓ em tempo de execução de `~/.secrets/hml-admin.env`; nunca vão para
 * arquivo, log ou captura. Só lê (navega); não cria nem altera nada.
 *
 * Rodar (sem o projeto `setup`):
 *   npx playwright test -c tests/journeys/playwright.config.ts --no-deps --project=chromium casca-009-contraste
 *
 * Medida: por `getComputedStyle`, a cor do texto composta sobre o primeiro fundo opaco dos
 * ancestrais; razão WCAG. Piso: 4,5. Texto desabilitado e oculto fica de fora (WCAG 1.4.3).
 */
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";

import { expect, test, type Page } from "@playwright/test";

const BASE_URL = (process.env.BASE_URL ?? "https://hml.corretora.io").replace(/\/+$/, "");
if (BASE_URL.includes("app.corretora.io")) {
  throw new Error("RECUSADO: este spec nunca roda contra a produção (app.corretora.io).");
}

const PISO = 4.5;
const TELAS = [
  { nome: "inbox", rota: "/app/inbox" },
  { nome: "contacts", rota: "/app/contacts" },
  { nome: "tasks", rota: "/app/tasks" },
  { nome: "agents", rota: "/app/ai/agents" },
  { nome: "usage", rota: "/app/ai/usage" },
  { nome: "settings", rota: "/app/settings" },
] as const;
const TEMAS = ["light", "dark"] as const;

function lerEnv(arquivo: string): Record<string, string> {
  const saida: Record<string, string> = {};
  const texto = fs.readFileSync(path.join(os.homedir(), ".secrets", arquivo), "utf8");
  for (const linha of texto.split(/\r?\n/)) {
    const m = linha.match(/^\s*([A-Za-z0-9_]+)\s*=\s*(.*)$/);
    if (m?.[1] !== undefined) saida[m[1]] = (m[2] ?? "").trim().replace(/^["']|["']$/g, "");
  }
  return saida;
}

type Ruim = { texto: string; razao: number };

/** Mede todo texto visível do documento (casca incluída). Roda no navegador. */
async function medirContraste(page: Page): Promise<{ checados: number; ruins: Ruim[] }> {
  return page.evaluate((piso) => {
    const cv = document.createElement("canvas");
    cv.width = cv.height = 1;
    const cx = cv.getContext("2d", { willReadFrequently: true })!;
    const rgba = (css: string): [number, number, number, number] => {
      cx.clearRect(0, 0, 1, 1);
      cx.fillStyle = "#000";
      cx.fillStyle = css;
      cx.fillRect(0, 0, 1, 1);
      const d = cx.getImageData(0, 0, 1, 1).data;
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
    const ruins: Array<{ texto: string; razao: number }> = [];
    let checados = 0;
    const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
    const vistos = new Set<Element>();
    while (walker.nextNode()) {
      const no = walker.currentNode as Text;
      const el = no.parentElement;
      if (!el || vistos.has(el) || !no.textContent?.trim()) continue;
      if (["SCRIPT", "STYLE", "NOSCRIPT"].includes(el.tagName)) continue;
      const r = el.getBoundingClientRect();
      const cs = getComputedStyle(el);
      if (r.width === 0 || r.height === 0 || cs.visibility === "hidden" || cs.display === "none") continue;
      if (el.closest("[aria-hidden='true'], .sr-only, [disabled], [aria-disabled='true']")) continue;
      vistos.add(el);
      const fg = rgba(cs.color);
      const bg = fundoDe(el);
      const m = [0, 1, 2].map((i) => fg[i]! * fg[3] + bg[i]! * (1 - fg[3])) as [number, number, number];
      const l1 = lum(...m);
      const l2 = lum(...bg);
      const razao = (Math.max(l1, l2) + 0.05) / (Math.min(l1, l2) + 0.05);
      checados += 1;
      if (razao < piso) ruins.push({ texto: (no.textContent ?? "").trim().slice(0, 40), razao: Math.round(razao * 100) / 100 });
    }
    return { checados, ruins };
  }, PISO);
}

test.use({ storageState: { cookies: [], origins: [] } });
test.describe.configure({ mode: "default", timeout: 240_000 });

test("AC-003.2: todo texto visível tem contraste >= 4,5 nas telas principais, claro e escuro", async ({ browser }) => {
  const admin = lerEnv("hml-admin.env");
  const contexto = await browser.newContext({ baseURL: BASE_URL, viewport: { width: 1360, height: 900 } });
  const page = await contexto.newPage();
  try {
    await page.goto("/login", { waitUntil: "load" });
    await page.locator("#email").fill(admin.HML_ADMIN_EMAIL ?? "");
    await page.locator("#password").fill(admin.HML_ADMIN_PASSWORD ?? "");
    await page.getByRole("button", { name: "Entrar", exact: true }).click();
    await page.waitForURL(/\/app/, { timeout: 90_000 });

    const falhas: string[] = [];
    for (const tema of TEMAS) {
      // O script do layout lê `deskcomm-theme` antes do primeiro paint.
      await page.evaluate((t) => localStorage.setItem("deskcomm-theme", t), tema);
      for (const tela of TELAS) {
        await page.goto(tela.rota, { waitUntil: "load" });
        await expect(page.locator("main").first()).toBeVisible({ timeout: 60_000 });
        await page.waitForLoadState("networkidle").catch(() => undefined);
        expect(await page.locator("html").getAttribute("data-theme")).toBe(tema);
        const { checados, ruins } = await medirContraste(page);
        expect(checados, `${tela.nome}/${tema}: nenhum texto medido`).toBeGreaterThan(0);
        if (ruins.length) {
          falhas.push(`${tela.nome}/${tema}: ${ruins.slice(0, 5).map((r) => `"${r.texto}" ${r.razao}`).join("; ")}`);
        }
      }
    }
    expect(falhas, `texto abaixo de ${PISO}:1`).toEqual([]);
  } finally {
    await contexto.close();
  }
});
