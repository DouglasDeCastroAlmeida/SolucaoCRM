/**
 * 009 / T-023 (AC-004.x, AC-003.2, AC-007.1) — jornada da leva 2 (listas como conversa) na homologação.
 *
 * Roda contra a homologação (BASE_URL, padrão https://hml.corretora.io) e RECUSA a produção.
 * Credenciais: lidas SÓ em tempo de execução de `~/.secrets/hml-admin.env`; nunca impressas nem
 * gravadas. A homologação está vazia, então o spec CRIA dados FICTÍCIOS pela API do próprio app
 * (sessão do navegador, sem service role, nada de WhatsApp/e-mail/envio), todos com o prefixo
 * "[teste-009]", e os REMOVE no fim (também numa varredura por prefixo, caso uma corrida anterior
 * tenha parado no meio).
 *
 * Capturas em evidence/009-visual-whatsapp/leva-2/: <tela>-<claro|escuro>-<1440|390>.png e medidas.md
 * E-mail do admin e campos sensíveis saem com máscara magenta.
 *
 * Rodar (sem o projeto `setup`):
 *   npx playwright test -c tests/journeys/playwright.config.ts --no-deps --project=chromium visual-whatsapp-leva-2
 */
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";

import { expect, test, type APIRequestContext, type Browser, type BrowserContext, type Page } from "@playwright/test";

const BASE_URL = (process.env.BASE_URL ?? "https://hml.corretora.io").replace(/\/+$/, "");
if (BASE_URL.includes("app.corretora.io")) {
  throw new Error("RECUSADO: este spec nunca roda contra a produção (app.corretora.io).");
}

const PASTA = path.join(process.cwd(), "evidence", "009-visual-whatsapp", "leva-2");
const MAGENTA = "#ff00ff";
const PREFIXO = "[teste-009]";
const PISO_CONTRASTE = 4.5;
const ALVO_MIN = 44;

type Tela = { nome: string; rota: string; lista: boolean; aba?: string };
const TELAS: Tela[] = [
  { nome: "contacts", rota: "/app/contacts", lista: true },
  { nome: "tasks", rota: "/app/tasks", lista: true },
  { nome: "cases", rota: "/app/ai/cases", lista: true },
  { nome: "followups-fluxos", rota: "/app/ai/followups", lista: true, aba: "Fluxos" },
  { nome: "followups-fila", rota: "/app/ai/followups", lista: true, aba: "Fila" },
  { nome: "central", rota: "/app/ai/inbox", lista: true },
  { nome: "kanban", rota: "/app/kanban", lista: false },
  { nome: "agenda", rota: "/app/agenda", lista: false },
];
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
const criado = { contatos: 0, tarefas: 0, fluxos: 0, observacoes: [] as string[] };
const removido = { contatos: 0, tarefas: 0, fluxos: 0, anonimizados: 0, sobrou: [] as string[] };

function linha(texto: string) {
  medidas.push(texto);
}
function marca(ok: boolean) {
  return ok ? "PASSOU" : "FALHOU";
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

function mascaras(page: Page) {
  return [
    page.getByText(admin.HML_ADMIN_EMAIL ?? "\u0000nunca"),
    page.locator('input[type="password"]'),
    page.locator('[data-sensivel="true"]'),
  ];
}

// ───────────────────────── dados fictícios (API do app, sessão do navegador) ─────────────────────────

type Json = Record<string, unknown>;

async function chamar(api: APIRequestContext, metodo: "get" | "post" | "patch" | "delete", url: string, corpo?: Json) {
  let resp: Awaited<ReturnType<APIRequestContext["get"]>> | null = null;
  for (let tentativa = 0; tentativa < 4 && !resp; tentativa += 1) {
    try {
      resp = await api[metodo](url, {
        ...(corpo ? { data: corpo } : {}),
        headers: { "Idempotency-Key": crypto.randomUUID() },
      });
    } catch (e) {
      if (tentativa === 3) throw e; // falha de rede passageira: tenta de novo
      await new Promise((r) => setTimeout(r, 1500));
    }
  }
  if (!resp) throw new Error("sem resposta");
  let json: unknown = null;
  try {
    json = await resp.json();
  } catch {
    /* sem corpo */
  }
  return { status: resp.status(), json: json as Json | null };
}

function listaDe(json: Json | null, chave: string): Array<Json> {
  const d = json?.data as unknown;
  if (Array.isArray(d)) return d as Array<Json>;
  const interno = (d as Json | undefined)?.[chave];
  return Array.isArray(interno) ? (interno as Array<Json>) : [];
}

const iso = (dias: number, horas = 0) => new Date(Date.now() + dias * 86_400_000 + horas * 3_600_000).toISOString();

async function criarDados(api: APIRequestContext) {
  const contatos: Array<{ name: string; tags?: string[]; pessoal?: boolean }> = [
    { name: `${PREFIXO} Ana Exemplo`, tags: ["vip", "retorno"] },
    { name: `${PREFIXO} Bruno Ficticio`, tags: ["lead"] },
    { name: `${PREFIXO} Carla Inventada`, tags: ["vip"] },
    { name: `${PREFIXO} Diego Teste` },
    { name: `${PREFIXO} Elisa Imaginaria`, tags: ["orcamento"] },
    { name: `${PREFIXO} Fabio Ficticio` },
    { name: `${PREFIXO} Gabi Pessoal`, pessoal: true },
    { name: `${PREFIXO} Heitor Exemplo`, tags: ["lead", "retorno"] },
  ];
  let n = 1;
  for (const c of contatos) {
    const r = await chamar(api, "post", "/api/v1/contacts", {
      name: c.name,
      phone_number: `+55119000000${String(n).padStart(2, "0")}`,
      email: `contato${n}@exemplo.invalid`,
      ...(c.tags ? { tags: c.tags } : {}),
    });
    n += 1;
    if (r.status >= 300) {
      criado.observacoes.push(`contato "${c.name}" não criado (HTTP ${r.status})`);
      continue;
    }
    criado.contatos += 1;
    const id = ((r.json?.data as Json | undefined)?.id ?? "") as string;
    if (c.pessoal && id) {
      const p = await chamar(api, "post", `/api/v1/contacts/${id}/personal`);
      criado.observacoes.push(p.status < 300 ? "contato marcado como pessoal" : `marcar pessoal falhou (HTTP ${p.status})`);
    }
  }
  criado.observacoes.push("contato bloqueado: sem porta de API que bloqueie sem mensagem/opt-out; não criado");

  const tarefas: Array<Json> = [
    { title: `${PREFIXO} Ligar para Ana Exemplo`, description: "Retorno do orçamento fictício", due_date: iso(-2), priority: "high" },
    { title: `${PREFIXO} Enviar proposta de exemplo`, description: "Texto inventado para teste", due_date: iso(-1), priority: "medium" },
    { title: `${PREFIXO} Revisar cadastro`, due_date: iso(0, 3), priority: "low" },
    { title: `${PREFIXO} Tarefa sem prazo`, priority: "medium" },
    { title: `${PREFIXO} Preparar reunião de teste`, description: "Agenda fictícia", due_date: iso(3), priority: "urgent" },
    { title: `${PREFIXO} Tarefa já concluída`, due_date: iso(-3), priority: "medium", status: "done" },
  ];
  for (const t of tarefas) {
    const r = await chamar(api, "post", "/api/v1/tasks", t);
    if (r.status >= 300) criado.observacoes.push(`tarefa "${String(t.title)}" não criada (HTTP ${r.status})`);
    else criado.tarefas += 1;
  }

  const f = await chamar(api, "post", "/api/v1/ai/followup-flows", { name: `${PREFIXO} Fluxo de exemplo` });
  if (f.status >= 300) criado.observacoes.push(`fluxo de follow-up não criado (HTTP ${f.status})`);
  else criado.fluxos += 1;
  criado.observacoes.push("casos e avisos da Central: sem rota de criação sem efeito externo; capturados no estado real da hml");
}

async function limpar(api: APIRequestContext) {
  // Contatos
  for (let volta = 0; volta < 3; volta += 1) {
    const r = await chamar(api, "get", `/api/v1/contacts?search=${encodeURIComponent("teste-009")}&limit=100`);
    const achados = listaDe(r.json, "contacts").filter((c) => String(c.name ?? c.display_name ?? "").startsWith(PREFIXO));
    if (achados.length === 0) break;
    for (const c of achados) {
      const id = String(c.id);
      const d = await chamar(api, "delete", `/api/v1/contacts/${id}`);
      if (d.status < 300) removido.contatos += 1;
      else {
        const a = await chamar(api, "post", "/api/v1/lgpd/anonymize", { contact_id: id });
        if (a.status < 300) removido.anonimizados += 1;
        else removido.sobrou.push(`contato ${id.slice(0, 8)} (apagar HTTP ${d.status}; anonimizar HTTP ${a.status})`);
      }
    }
  }
  // Tarefas (todas as situações)
  const tr = await chamar(api, "get", "/api/v1/tasks");
  for (const t of listaDe(tr.json, "tasks").filter((x) => String(x.title ?? "").startsWith(PREFIXO))) {
    const d = await chamar(api, "delete", `/api/v1/tasks/${String(t.id)}`);
    if (d.status < 300) removido.tarefas += 1;
    else removido.sobrou.push(`tarefa ${String(t.id).slice(0, 8)} (HTTP ${d.status})`);
  }
  // Fluxos
  const fr = await chamar(api, "get", "/api/v1/ai/followup-flows");
  for (const f of listaDe(fr.json, "flows").filter((x) => String(x.name ?? "").startsWith(PREFIXO))) {
    const d = await chamar(api, "delete", `/api/v1/ai/followup-flows/${String(f.id)}`);
    if (d.status < 300) removido.fluxos += 1;
    else removido.sobrou.push(`fluxo ${String(f.id).slice(0, 8)} (HTTP ${d.status})`);
  }
}

// ───────────────────────── medidas no navegador ─────────────────────────

type Medida = {
  rolagem: number;
  linhas: number;
  alturaMin: number | null;
  alvoMin: number | null;
  alvoPior: string;
  acoesSemHover: { total: number; visiveis: number };
  contraste: { checados: number; ruins: Array<{ texto: string; razao: number }> };
  estouros: Array<{ seletor: string; direita: number }>;
  ladoALado: { lista: boolean; painel: boolean } | null;
  urgente: Array<{ texto: string; razao: number }>;
};

async function medir(page: Page): Promise<Medida> {
  return page.evaluate((piso) => {
    const vis = (el: Element | null) => {
      if (!el) return null;
      const r = el.getBoundingClientRect();
      const cs = getComputedStyle(el);
      return r.width > 0 && r.height > 0 && cs.visibility !== "hidden" && cs.display !== "none" ? r : null;
    };
    const main = document.querySelector("main") ?? document.body;
    const linhas = Array.from(main.querySelectorAll("ul > li")).filter((li) => vis(li) && li.querySelector("a, button"));
    let alturaMin: number | null = null;
    let alvoMin: number | null = null;
    let alvoPior = "";
    let total = 0;
    let visiveis = 0;
    for (const li of linhas) {
      const r = li.getBoundingClientRect();
      alturaMin = alturaMin === null ? r.height : Math.min(alturaMin, r.height);
      for (const el of Array.from(li.querySelectorAll("a, button, [role=checkbox]"))) {
        const e = vis(el);
        if (!e) continue;
        let w = e.width;
        let h = e.height;
        // A caixa de seleção tem 16 px desenhados e um ::before absoluto que estende o alvo de toque.
        const pb = getComputedStyle(el, "::before");
        if (pb.position === "absolute" && pb.content !== "none") {
          w = Math.max(w, parseFloat(pb.width) || 0);
          h = Math.max(h, parseFloat(pb.height) || 0);
        }
        const menor = Math.min(w, h);
        if (alvoMin === null || menor < alvoMin) {
          alvoMin = menor;
          alvoPior = (el.getAttribute("aria-label") ?? el.textContent ?? el.tagName).trim().slice(0, 40);
        }
        // Ações da linha: botões fora do alvo principal e fora da caixa; precisam estar visíveis sem hover.
        if (el.tagName === "BUTTON" && el.getAttribute("role") !== "checkbox") {
          total += 1;
          let op = 1;
          for (let p: Element | null = el; p && p !== li.parentElement; p = p.parentElement) {
            op *= parseFloat(getComputedStyle(p).opacity);
          }
          if (op >= 0.99) visiveis += 1;
        }
      }
    }

    // contraste de todo texto visível de <main>
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
    const walker = document.createTreeWalker(main, NodeFilter.SHOW_TEXT);
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

    // elementos visíveis de <main> cuja borda direita passa da janela
    const estouros: Array<{ seletor: string; direita: number }> = [];
    for (const el of Array.from(main.querySelectorAll("*"))) {
      const r = vis(el);
      if (!r || r.right <= window.innerWidth + 1) continue;
      if (el.closest("[aria-hidden='true'], .sr-only")) continue;
      const id = el.id ? `#${el.id}` : "";
      const cls = typeof el.className === "string" ? el.className.trim().split(/\s+/).slice(0, 3).join(".") : "";
      estouros.push({ seletor: `${el.tagName.toLowerCase()}${id}${cls ? "." + cls : ""}`.slice(0, 90), direita: Math.round(r.right * 100) / 100 });
    }
    // Casos: lista e painel não podem aparecer lado a lado
    let ladoALado: { lista: boolean; painel: boolean } | null = null;
    if (location.pathname.startsWith("/app/ai/cases")) {
      const lista = Array.from(main.querySelectorAll("ul")).some((u) => vis(u) && u.querySelector("li"));
      const painel = Array.from(main.querySelectorAll("aside, [data-testid*='painel'], [data-testid*='detalhe'], [role='complementary']")).some((e) => vis(e));
      ladoALado = { lista, painel };
    }
    // selo de prioridade "urgente": cor do texto sobre o fundo do selo (translúcido) composto sobre o fundo opaco
    const urgente: Array<{ texto: string; razao: number }> = [];
    for (const el of Array.from(main.querySelectorAll("span, div, a, button"))) {
      if (!/^urgente$/i.test((el.textContent ?? "").trim()) || !vis(el)) continue;
      if (Array.from(el.children).some((c) => /^urgente$/i.test((c.textContent ?? "").trim()))) continue;
      const fg = rgba(getComputedStyle(el).color);
      const base = fundoDe(el.parentElement ?? el);
      const sel = rgba(getComputedStyle(el).backgroundColor);
      const bg = [0, 1, 2].map((i) => sel[i]! * sel[3] + base[i]! * (1 - sel[3])) as [number, number, number];
      const m = [0, 1, 2].map((i) => fg[i]! * fg[3] + bg[i]! * (1 - fg[3])) as [number, number, number];
      const l1 = lum(...m);
      const l2 = lum(...bg);
      urgente.push({ texto: "urgente", razao: Math.round(((Math.max(l1, l2) + 0.05) / (Math.min(l1, l2) + 0.05)) * 100) / 100 });
    }

    return {
      estouros: estouros.slice(0, 8),
      ladoALado,
      urgente,
      rolagem: document.body.scrollWidth - document.documentElement.clientWidth,
      linhas: linhas.length,
      alturaMin: alturaMin === null ? null : Math.round(alturaMin * 100) / 100,
      alvoMin: alvoMin === null ? null : Math.round(alvoMin * 100) / 100,
      alvoPior,
      acoesSemHover: { total, visiveis },
      contraste: { checados, ruins: ruins.slice(0, 6) },
    };
  }, PISO_CONTRASTE);
}

async function abrirTela(page: Page, tela: Tela, tema: string) {
  const resp = await page.goto(tela.rota, { waitUntil: "load" });
  await expect(page.locator("main").first()).toBeVisible({ timeout: 60_000 });
  if (tela.aba) await page.getByRole("tab", { name: tela.aba, exact: true }).click();
  await page.waitForLoadState("networkidle", { timeout: 4000 }).catch(() => undefined);
  // dá tempo da lista (react-query) assentar
  const esperada = ["contacts", "tasks", "followups-fluxos"].includes(tela.nome);
  if (esperada) await page.locator("main ul > li").first().waitFor({ timeout: 30_000 }).catch(() => undefined);
  await page.waitForTimeout(2500);
  expect(await page.locator("html").getAttribute("data-theme")).toBe(tema);
  return resp;
}

test.use({ storageState: { cookies: [], origins: [] } });
test.describe.configure({ mode: "serial", timeout: 600_000 });

test.beforeAll(async ({ browser }) => {
  fs.mkdirSync(PASTA, { recursive: true });
  const { ctx } = await entrar(browser, false);
  try {
    await limpar(ctx.request); // resto de corrida anterior
    await criarDados(ctx.request);
  } finally {
    await ctx.close();
  }
});

test.afterAll(async ({ browser }) => {
  try {
    const { ctx } = await entrar(browser, false);
    try {
      await limpar(ctx.request);
      // Confere o que sobrou
      const c = await chamar(ctx.request, "get", `/api/v1/contacts?search=${encodeURIComponent("teste-009")}&limit=100`);
      const t = await chamar(ctx.request, "get", "/api/v1/tasks");
      const sc = listaDe(c.json, "contacts").filter((x) => String(x.name ?? x.display_name ?? "").startsWith(PREFIXO)).length;
      const st = listaDe(t.json, "tasks").filter((x) => String(x.title ?? "").startsWith(PREFIXO)).length;
      if (sc || st) removido.sobrou.push(`conferência final: ${sc} contato(s) e ${st} tarefa(s) com o prefixo`);
    } finally {
      await ctx.close();
    }
  } catch (e) {
    removido.sobrou.push(`limpeza final falhou: ${String((e as Error).message).slice(0, 120)}`);
  }
  const cab = [
    "# Medidas — leva 2 (listas como conversa) na homologação",
    "",
    `Base: ${BASE_URL}. Gerado por tests/journeys/visual-whatsapp-leva-2.spec.ts. Dados: só fictícios com o prefixo "${PREFIXO}".`,
    `Esperado: rolagem lateral <= 0; no celular altura de cada linha >= ${ALVO_MIN} px, menor alvo por linha >= ${ALVO_MIN} px,`,
    `ações da linha visíveis sem hover; contraste de todo texto de <main> >= ${PISO_CONTRASTE}:1.`,
    "",
  ];
  const rod = [
    "",
    "## Dados fictícios",
    `- Criados: ${criado.contatos} contatos, ${criado.tarefas} tarefas, ${criado.fluxos} fluxo(s) de follow-up.`,
    ...criado.observacoes.map((o) => `- Obs.: ${o}`),
    `- Removidos: ${removido.contatos} contatos apagados, ${removido.anonimizados} anonimizados, ${removido.tarefas} tarefas, ${removido.fluxos} fluxo(s).`,
    `- Sobrou: ${removido.sobrou.length ? removido.sobrou.join("; ") : "nada"}`,
    "",
  ];
  fs.writeFileSync(path.join(PASTA, "medidas.md"), [...cab, ...medidas, ...rod].join("\n"), "utf8");
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
          const resp = await abrirTela(page, tela, tema.chave);
          const falhas: string[] = [];
          if ((resp?.status() ?? 200) >= 400) falhas.push(`HTTP ${resp?.status()}`);
          if (erros.length) falhas.push(`erro de página: ${erros[0]}`);

          const m = await medir(page);
          if (m.rolagem > 0) falhas.push(`rolagem lateral ${m.rolagem}`);
          if (m.estouros.length) falhas.push(`elemento passa da janela: ${m.estouros.slice(0, 4).map((x) => `${x.seletor} right=${x.direita}`).join(", ")}`);
          if (mobile && m.ladoALado?.lista && m.ladoALado.painel) falhas.push("Casos: lista e painel lado a lado");
          if (m.urgente.length) linha(`- INFO ${rotulo}: selo 'urgente' contraste=${m.urgente.map((u) => u.razao).join("/")}`);
          if (tela.nome === "cases") linha(`- INFO ${rotulo}: Casos lista visível=${m.ladoALado?.lista}; painel visível=${m.ladoALado?.painel}`);
          if (m.contraste.ruins.length) {
            falhas.push(`contraste < ${PISO_CONTRASTE}: ${m.contraste.ruins.slice(0, 3).map((r) => `"${r.texto}" ${r.razao}`).join(", ")}`);
          }
          if (mobile && tela.lista && m.linhas > 0) {
            if ((m.alturaMin ?? 0) < ALVO_MIN) falhas.push(`linha mais baixa ${m.alturaMin} px`);
            if ((m.alvoMin ?? 0) < ALVO_MIN) falhas.push(`menor alvo ${m.alvoMin} px ("${m.alvoPior}")`);
            if (m.acoesSemHover.total > 0 && m.acoesSemHover.visiveis < m.acoesSemHover.total) {
              falhas.push(`ações escondidas sem hover: ${m.acoesSemHover.total - m.acoesSemHover.visiveis} de ${m.acoesSemHover.total}`);
            }
          }

          // No celular a lista começa abaixo da dobra: rola até a primeira linha, para a captura mostrar o que se mede.
          if (mobile && tela.lista && m.linhas > 0) {
            await page.locator("main ul > li").first().evaluate((el) => el.scrollIntoView({ block: "start" }));
            await page.evaluate(() => window.scrollBy(0, -70));
            await page.waitForTimeout(400);
          }
          await page.screenshot({
            path: path.join(PASTA, `${tela.nome}-${tema.rotulo}-${tamanho}.png`),
            mask: mascaras(page),
            maskColor: MAGENTA,
            animations: "disabled",
          });

          linha(
            `- ${marca(falhas.length === 0)} ${rotulo}: rolagem lateral=${m.rolagem}; linhas=${tela.lista ? m.linhas : "n/a"}` +
              `${tela.lista && m.linhas ? `; linha mais baixa=${m.alturaMin}px; menor alvo=${m.alvoMin}px ("${m.alvoPior}"); ações visíveis sem hover=${m.acoesSemHover.visiveis}/${m.acoesSemHover.total}` : tela.lista ? " (estado vazio)" : ""}` +
              `; textos medidos=${m.contraste.checados}; abaixo de ${PISO_CONTRASTE}:1=${m.contraste.ruins.length}` +
              `${falhas.length ? ` | ${falhas.join("; ")}` : ""}`,
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
    await page.evaluate((t) => {
      if (t === null) localStorage.removeItem("deskcomm-theme");
      else localStorage.setItem("deskcomm-theme", t);
    }, temaOriginal);
  }
}

test("AC-004/003.2/007.1: listas da leva 2 no computador (1440x900), claro e escuro", async ({ browser }) => {
  const { ctx, page } = await entrar(browser, false);
  try {
    await percorrer(page, false);
  } finally {
    await ctx.close();
  }
});

test("AC-004/003.2/007.1: listas da leva 2 no celular com toque (390x844), claro e escuro", async ({ browser }) => {
  const { ctx, page } = await entrar(browser, true);
  try {
    await percorrer(page, true);
  } finally {
    await ctx.close();
  }
});

test("comportamento básico segue: busca, ordenar, selecionar em lote, concluir tarefa, abrir linha", async ({ browser }) => {
  const { ctx, page } = await entrar(browser, false);
  const temaOriginal = await page.evaluate(() => localStorage.getItem("deskcomm-theme"));
  const passos: Array<[string, boolean, string]> = [];
  const registrar = (nome: string, ok: boolean, detalhe = "") => {
    passos.push([nome, ok, detalhe]);
    linha(`- ${marca(ok)} comportamento: ${nome}${detalhe ? ` (${detalhe})` : ""}`);
  };
  const titulos = async () =>
    (await page.locator("main ul > li a.min-w-0 .truncate, main ul > li .min-w-0 > div > span.truncate").allInnerTexts()).map((s) => s.trim());
  try {
    await page.evaluate(() => localStorage.setItem("deskcomm-theme", "light"));
    await page.goto("/app/contacts", { waitUntil: "load" });
    await expect(page.getByText(`${PREFIXO} Ana Exemplo`).first()).toBeVisible({ timeout: 60_000 });

    // 1) busca filtra
    const antes = (await titulos()).length;
    await page.getByPlaceholder(/Buscar por nome/i).fill("Carla Inventada");
    await expect(page.locator("main ul > li")).toHaveCount(1, { timeout: 30_000 });
    registrar("busca filtra a lista", antes > 1, `${antes} linhas -> 1 para "Carla Inventada"`);
    await page.getByPlaceholder(/Buscar por nome/i).fill("");
    await expect.poll(async () => (await titulos()).length, { timeout: 30_000 }).toBe(antes);

    // 2) ordenar por Nome muda a ordem (e o segundo clique inverte)
    const original = await titulos();
    const botaoNome = page.getByRole("button", { name: /^Nome/ }).first();
    // Espera a lista assentar (duas leituras iguais, 8 linhas) depois de cada clique.
    const assentada = async () => {
      let anterior = "";
      for (let i = 0; i < 40; i += 1) {
        const atual = (await titulos()).join("|");
        if (atual === anterior && atual.split("|").length === original.length) return atual.split("|");
        anterior = atual;
        await page.waitForTimeout(700);
      }
      return (await titulos());
    };
    await botaoNome.click();
    await page.waitForTimeout(1500);
    const a = await assentada();
    await botaoNome.click();
    await page.waitForTimeout(1500);
    const b = await assentada();
    const mudou = a.join("|") !== b.join("|");
    const inverteu = [...a].reverse().join("|") === b.join("|");
    registrar("ordenar por Nome muda a ordem e o 2º clique inverte", mudou && inverteu, `original!=1º clique: ${original.join("|") !== a.join("|")}`);

    // 3) caixa da linha seleciona e aparece a barra de lote; cancelar limpa
    const caixa = page.locator('main ul > li [role="checkbox"]').first();
    await caixa.click();
    const marcado = (await caixa.getAttribute("aria-checked")) === "true";
    const barra = page.getByTestId("barra-de-contatos-em-lote");
    const barraVisivel = await barra.isVisible().catch(() => false);
    await page.screenshot({ path: path.join(PASTA, "contacts-lote-claro-1440.png"), mask: mascaras(page), maskColor: MAGENTA, animations: "disabled" });
    registrar("caixa da linha seleciona e mostra a barra de lote", marcado && barraVisivel, `marcada=${marcado}, barra=${barraVisivel}`);
    await page.getByTestId("lote-limpar").click();
    await expect(barra).toBeHidden({ timeout: 15_000 });
    registrar("cancelar o lote limpa a seleção e some a barra", (await caixa.getAttribute("aria-checked")) !== "true");

    // 4) abrir uma linha leva ao detalhe
    await page.locator("main ul > li a").first().click();
    await page.waitForURL(/\/app\/contacts\/[0-9a-f-]{36}/, { timeout: 30_000 });
    registrar("abrir uma linha leva ao detalhe do contato", true, "URL /app/contacts/<id>");

    // 5) tarefa: concluir e reabrir pela caixa da linha
    await page.goto("/app/tasks", { waitUntil: "load" });
    const alvoTitulo = `${PREFIXO} Revisar cadastro`;
    const linhaTarefa = () => page.locator("main ul > li").filter({ hasText: alvoTitulo }).first();
    await expect(linhaTarefa()).toBeVisible({ timeout: 60_000 });
    await linhaTarefa().getByRole("checkbox", { name: /Marcar como conclu/i }).click();
    const sumiu = await expect(linhaTarefa()).toBeHidden({ timeout: 8000 }).then(() => true, () => false);
    const statusDe = async () => {
      const r = await chamar(ctx.request, "get", "/api/v1/tasks");
      const t = listaDe(r.json, "tasks").find((x) => x.title === alvoTitulo);
      return String(t?.status ?? "?");
    };
    await expect.poll(statusDe, { timeout: 20_000 }).toBe("done");
    registrar("marcar tarefa como concluída grava a situação", true, `situação=done; linha ${sumiu ? "saiu da lista 'Em aberto'" : "continuou visível (riscada)"}`);

    // reabre (restaura) pela UI
    if (sumiu) {
      await page.getByRole("combobox").first().click();
      await page.getByRole("option", { name: /Conclu/i }).first().click();
    }
    await expect(linhaTarefa()).toBeVisible({ timeout: 30_000 });
    await linhaTarefa().getByRole("checkbox", { name: /Reabrir/i }).click();
    await expect.poll(statusDe, { timeout: 20_000 }).toBe("pending");
    registrar("desmarcar a tarefa a reabre (restaurada)", true, "situação=pending");
  } catch (e) {
    registrar("erro no roteiro", false, String((e as Error).message).split("\n")[0]?.slice(0, 160));
    throw e;
  } finally {
    // Restaura o tema e garante a tarefa em aberto
    await page
      .evaluate((t) => {
        if (t === null) localStorage.removeItem("deskcomm-theme");
        else localStorage.setItem("deskcomm-theme", t);
      }, temaOriginal)
      .catch(() => undefined);
    await ctx.close();
  }
  expect(passos.filter(([, ok]) => !ok).map(([n]) => n)).toEqual([]);
});

test("a contagem final de falhas das medidas é zero", () => {
  expect(falhasGerais, "falhas de medida").toEqual([]);
});
