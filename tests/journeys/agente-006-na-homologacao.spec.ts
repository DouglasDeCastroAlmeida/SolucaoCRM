/**
 * T-040 (AC-009.3) — a mudança 006 provada PELA TELA, na homologação, com serviços reais.
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
const chaveOpenRouter = lerEnv("openrouter.env").API_KEY;

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
  const arquivo = path.join(PASTA, `${String(n).padStart(2, "0")}-${nome}.png`);
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
let agenteId = "";

test.beforeAll(async ({ browser }) => {
  fs.mkdirSync(PASTA, { recursive: true });
  for (const a of fs.readdirSync(PASTA)) if (a.endsWith(".png")) fs.unlinkSync(path.join(PASTA, a));
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
  fs.writeFileSync(path.join(PASTA, "medidas.md"), linhas.join("\n"), "utf8");
  await contexto?.close();
  if (resultados.some((r) => r.estado === "FALHOU")) process.exitCode = 1;
});

/** A área de conteúdo da página (o <main> do shell). */
function conteudo(p: Page): Locator {
  return p.locator("main").first();
}

async function abrir(rota: string) {
  await page.goto(rota, { waitUntil: "domcontentloaded" });
  await expect(conteudo(page)).toBeVisible({ timeout: 60_000 });
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

// ─── 2. chave do OpenRouter ─────────────────────────────────────────────────
test("2. Chaves de IA: colar a chave do OpenRouter", async () => {
  await passo("2 chave OpenRouter", async () => {
    expect(chaveOpenRouter.length).toBeGreaterThan(10);
    await abrir("/app/ai/credentials");
    const existente = page.getByText("[teste-006] OpenRouter");
    if ((await existente.count()) === 0) {
      await page.getByRole("button", { name: "Adicionar credencial" }).first().click();
      const dlg = page.getByRole("dialog");
      await dlg.locator("#cred-provider").click();
      await page.getByRole("option", { name: /OpenRouter/i }).click();
      await dlg.locator("#cred-label").fill("[teste-006] OpenRouter");
      const campo = dlg.locator("#cred-key");
      expect(await campo.getAttribute("type")).toBe("password");
      await campo.fill(chaveOpenRouter);
      await dlg.getByRole("button", { name: /Salvar e validar/ }).click();
      await expect(dlg).toBeHidden({ timeout: 60_000 });
      criado.push('credencial de IA "[teste-006] OpenRouter" (provedor OpenRouter)');
    }
    await expect(page.getByText("[teste-006] OpenRouter").first()).toBeVisible();
    // dá tempo à validação em segundo plano e relê a lista
    await page.waitForTimeout(6000);
    await page.reload({ waitUntil: "domcontentloaded" });
    const cartao = conteudo(page).getByText("[teste-006] OpenRouter").first();
    await expect(cartao).toBeVisible();
    const final4 = chaveOpenRouter.slice(-4);
    const principal = conteudo(page);
    const texto = await principal.innerText();
    expect(texto).not.toContain(chaveOpenRouter);
    const mostraFinal = texto.includes(final4);
    medir(`credencial: a tela nunca exibe a chave inteira; mostra os 4 ultimos caracteres: ${mostraFinal}`);
    await foto(page, "chave-openrouter-salva", principal);
    const linhas = await ler<{ validated_at: string | null; validation_error: string | null; provider: string }>(
      "ai_provider_credentials_safe?select=provider,validated_at,validation_error&label=like.*teste-006*",
    );
    medir(`credencial no banco (leitura): provider=${linhas[0]?.provider}; validada=${Boolean(linhas[0]?.validated_at)}; erro=${linhas[0]?.validation_error ?? "nenhum"}`);
    return `validada=${Boolean(linhas[0]?.validated_at)}; "Testar"/aviso de modelo fraco: ver achado (a tela so valida em segundo plano)`;
  });
});

test("2b. AC-001.6: aviso de modelo fraco aparece na tela?", async () => {
  await passo(
    "2b teste da chave + aviso de modelo fraco (AC-001.6)",
    async () => {
      await abrir("/app/ai/credentials");
      const texto = await conteudo(page).innerText();
      const temTestar = /\bTestar\b/.test(texto);
      const temRevalidar = (await page.getByRole("button", { name: "Revalidar credencial" }).count()) > 0;
      medir(`tela de credenciais: botao "Testar" presente=${temTestar}; botao "Revalidar" presente=${temRevalidar}`);
      if (temRevalidar) {
        await page.getByRole("button", { name: "Revalidar credencial" }).first().click();
        await page.waitForTimeout(5000);
      }
      const depois = await conteudo(page).innerText();
      const aviso = /pode errar|modelo fraco|n[aã]o chama ferramentas|ferramentas/i.test(depois);
      medir(`aviso de modelo fraco visivel na tela de credenciais apos revalidar: ${aviso}`);
      await foto(page, "credencial-revalidada", conteudo(page));
      return "o botao Testar so existe para o provedor personalizado; o aviso 'aviso_modelo_fraco' sai da API e nenhuma tela o mostra";
    },
    { naoExercitavel: true },
  );
});


// ─── 3. criar o agente ──────────────────────────────────────────────────────
const NOME_AGENTE = "[teste-006] Agente";
const FILTRO_AGENTE = "name=eq.%5Bteste-006%5D%20Agente";

test("3. criar o agente: nasce assistido e sem versao publicada", async () => {
  await passo("3 criar agente (AC-003.1/003.2)", async () => {
    const existentes = await ler<{ id: string }>(`ai_agents?select=id&${FILTRO_AGENTE}&limit=1`);
    if (existentes[0]) {
      agenteId = existentes[0].id;
    } else {
      await abrir("/app/ai/agents/new");
      await expect(page.locator("#name")).toBeVisible({ timeout: 60_000 });
      await page.waitForLoadState("networkidle").catch(() => undefined);
      await page.locator("#name").fill(NOME_AGENTE);
      await expect(page.locator("#name")).toHaveValue(NOME_AGENTE);
      await page.locator("#provider").click();
      await page.getByRole("option", { name: /OpenRouter/i }).click();
      const modelo = page.locator("#model");
      if ((await modelo.evaluate((e) => e.tagName)) === "INPUT") {
        await modelo.fill("openai/gpt-4o-mini");
      } else {
        await modelo.click();
        await page.getByRole("option").first().click();
      }
      await page.locator("#credential_id").click();
      await page.getByRole("option", { name: /teste-006\] OpenRouter/ }).click();
      await page.locator("textarea").first().fill("Voce e um agente de teste da homologacao. Nao responda clientes reais.");
      await foto(page, "agente-novo-formulario-preenchido", conteudo(page));
      await page.getByRole("button", { name: "Criar agente" }).first().click();
      await page.waitForURL(/\/app\/ai\/agents\/[0-9a-f-]{36}/, { timeout: 90_000 });
      agenteId = page.url().match(/agents\/([0-9a-f-]{36})/)![1]!;
      criado.push(`agente de IA "${NOME_AGENTE}" (rascunho, provedor OpenRouter)`);
    }
    await page.goto(`/app/ai/agents/${agenteId}`, { waitUntil: "load" });
    const seletor = page.getByLabel("Modo de operação");
    await expect(seletor).toBeVisible({ timeout: 60_000 });
    const valor = await seletor.inputValue();
    expect(valor).toBe("assisted");
    const linhas = await ler<{ operation_mode: string; published_version_id: string | null; paused_at: string | null }>(
      `ai_agents?select=operation_mode,published_version_id,paused_at&id=eq.${agenteId}`,
    );
    expect(linhas[0]!.operation_mode).toBe("assisted");
    expect(linhas[0]!.published_version_id).toBeNull();
    medir(
      `agente novo: tela mostra modo "${valor}" (Assistido: revisar antes de enviar); banco: operation_mode=${linhas[0]!.operation_mode}, published_version_id=${linhas[0]!.published_version_id}`,
    );
    await foto(page, "agente-nasce-assistido", page.getByLabel("Operação do agente").first());
    return "nasceu no modo assistido (revisar antes de enviar) e sem versao publicada, na tela e no banco";
  });
});

// ─── 4. modo automatico ─────────────────────────────────────────────────────
async function modoNoBanco() {
  const l = await ler<{ operation_mode: string }>(`ai_agents?select=operation_mode&id=eq.${agenteId}`);
  return l[0]!.operation_mode;
}

test("4. modo automatico exige confirmacao e e auditado", async () => {
  await passo("4 automatico (AC-003.4/003.5)", async () => {
    expect(agenteId).not.toBe("");
    await page.goto(`/app/ai/agents/${agenteId}`, { waitUntil: "load" });
    const seletor = page.getByLabel("Modo de operação");
    await expect(seletor).toBeVisible({ timeout: 60_000 });
    const dialogo = page.getByRole("alertdialog");

    // abre o dialogo; Esc nao grava
    await seletor.selectOption("automatic");
    await expect(dialogo).toBeVisible();
    const textoDialogo = await dialogo.innerText();
    expect(textoDialogo).toMatch(/responder sozinho/i);
    expect(textoDialogo).toMatch(/chave de IA da sua empresa/i);
    await foto(page, "automatico-dialogo-aviso", dialogo);
    await page.keyboard.press("Escape");
    await expect(dialogo).toBeHidden();
    expect(await modoNoBanco()).toBe("assisted");
    medir("Esc no dialogo do automatico: dialogo fechou; banco continua assisted");

    // Cancelar nao grava
    await seletor.selectOption("automatic");
    await expect(dialogo).toBeVisible();
    await dialogo.getByRole("button", { name: "Cancelar" }).click();
    await expect(dialogo).toBeHidden();
    expect(await modoNoBanco()).toBe("assisted");
    medir("Cancelar no dialogo do automatico: banco continua assisted");

    // Confirmar grava
    await seletor.selectOption("automatic");
    await expect(dialogo).toBeVisible();
    await dialogo.getByRole("button", { name: "Confirmar e ligar o automático" }).click();
    await expect(dialogo).toBeHidden({ timeout: 60_000 });
    await expect.poll(modoNoBanco, { timeout: 30_000 }).toBe("automatic");
    medir("Confirmar: banco operation_mode=automatic");
    await page.waitForTimeout(2500); // a auditoria e fire-and-forget
    const auditoria = await ler<{ actor_user_id: string | null; resource_id: string; metadata: { previous_mode?: string } }>(
      `api_audit_log?select=actor_user_id,resource_id,metadata&action=eq.ai_agent.automatic_confirmed&resource_id=eq.${agenteId}&order=created_at.desc&limit=1`,
    );
    expect(auditoria.length).toBe(1);
    expect(auditoria[0]!.actor_user_id).toBeTruthy();
    medir(
      `auditoria ai_agent.automatic_confirmed: 1 linha para o agente; com ator (user id presente)=${Boolean(auditoria[0]!.actor_user_id)}; previous_mode=${auditoria[0]!.metadata.previous_mode}`,
    );
    await expect(seletor).toHaveValue("automatic");
    await foto(page, "automatico-ligado", page.getByLabel("Operação do agente").first());

    // volta para assistido
    await seletor.selectOption("assisted");
    await expect.poll(modoNoBanco, { timeout: 30_000 }).toBe("assisted");
    medir("voltou para assisted: banco operation_mode=assisted");
    return "dialogo com aviso; Esc e Cancelar nao gravam; Confirmar grava e audita com ator; voltou ao assistido";
  });
});

// ─── 5. uso e teto ──────────────────────────────────────────────────────────
test("5. uso de IA: teto e a palavra estimado", async () => {
  await passo("5 uso/teto (AC-004.4/004.6)", async () => {
    await abrir("/app/ai/usage");
    await expect(page.getByText("Orçamento mensal de IA")).toBeVisible({ timeout: 60_000 });
    const texto = await conteudo(page).innerText();
    const semTeto = /sem teto de gasto|Sem limite definido/i.test(texto);
    const tetoPadrao = texto.match(/Teto do m[eê]s:[^\n]*/)?.[0] ?? "(nao exibido)";
    const estimado = /estimado/i.test(texto);
    medir(`uso: frase "sem teto/sem limite" presente=${semTeto}; ${tetoPadrao}; palavra "estimado" presente=${estimado}`);
    const orc = texto.match(/US\$\s[\d.,]+\sgastos de US\$\s[\d.,]+/)?.[0];
    medir(`uso: cartao de orcamento mostra "${orc ?? "sem valor"}"`);
    await foto(page, "uso-banner-teto", conteudo(page));
    await page.getByRole("button", { name: "Editar limite" }).click();
    const dlg = page.getByRole("dialog");
    await expect(dlg).toBeVisible();
    await foto(page, "uso-editar-limite", dlg);
    await dlg.getByRole("button", { name: "Cancelar" }).click();
    await expect(dlg).toBeHidden();
    return `${tetoPadrao}; "estimado" so aparece quando ha gasto com preco desconhecido (sem gasto na hml); o aviso de teto exige gasto real: nao provado (dialogo aberto e cancelado, nada gravado)`;
  });
});

// ─── 6. servidor MCP externo ────────────────────────────────────────────────
async function toasts() {
  const inline = (await page.locator("p[role=alert], p[role=status]").allInnerTexts()).join(" | ");
  if (inline) return inline;
  return (await page.locator("[data-sonner-toast]").allInnerTexts()).join(" | ");
}

test("6. servidor MCP externo", async () => {
  await passo("6 servidor MCP externo", async () => {
    await page.goto("/app/settings/servidor-mcp-externo", { waitUntil: "load" });
    await page.waitForLoadState("networkidle").catch(() => undefined);
    if (/\/403/.test(page.url())) {
      const corpo = await page.locator("body").innerText();
      medir(
        `ACHADO: a conta da hml foi redirecionada para ${new URL(page.url()).pathname}; texto: ${corpo.slice(0, 200).replace(/\s+/g, " ")}`,
      );
      await foto(page, "mcp-403", page.locator("body"));
      throw new Error("pagina do servidor MCP externo redirecionou para /403");
    }
    await expect(page.getByText("Cadastrar servidor").first()).toBeVisible({ timeout: 60_000 });
    const ja = await ler<{ id: string }>("mcp_servidores_externos?select=id&nome=like.*teste-006*");
    await foto(page, "mcp-pagina", conteudo(page));

    const obrigatoria = await page.locator("#mcp-chave-nova").evaluate((e) => (e as HTMLInputElement).required);
    medir(`campo "Chave de acesso" obrigatorio na tela: ${obrigatoria} (o servidor publico do DeepWiki nao tem credencial)`);

    if (ja.length === 0) {
      await page.locator("#mcp-slug").fill("teste006-wiki");
      await page.locator("#mcp-nome").fill("[teste-006] DeepWiki");
      await page.locator("#mcp-chave-nova").fill("sem-chave-servidor-publico");

      await page.locator("#mcp-endereco").fill("http://mcp.deepwiki.com/mcp");
      const botao = page.getByRole("button", { name: /Cadastrar e testar|Testando/ });
      const t0 = Date.now();
      await page.getByRole("button", { name: "Cadastrar e testar" }).click();
      await expect(botao).toHaveText("Cadastrar e testar", { timeout: 150_000 });
      const demoraHttp = Math.round((Date.now() - t0) / 100) / 10;
      await expect(page.locator("p[role=alert]").first()).toBeVisible({ timeout: 15_000 });
      const recusa = (await page.locator("p[role=alert]").allInnerTexts()).join(" | ");
      medir(`endereco http:// -> resposta em ${demoraHttp}s; mensagem na tela: "${recusa}"`);
      expect(recusa.length).toBeGreaterThan(5);
      expect(recusa).not.toMatch(/ZodError|undefined|\[object/);
      await foto(page, "mcp-http-recusado", conteudo(page));

      await page.locator("#mcp-endereco").fill("https://mcp.deepwiki.com/mcp");
      await page.locator("#mcp-chave-nova").fill("sem-chave-servidor-publico");
      const t1 = Date.now();
      await page.getByRole("button", { name: "Cadastrar e testar" }).click();
      await expect(botao).toHaveText("Cadastrar e testar", { timeout: 150_000 });
      const demoraHttps = Math.round((Date.now() - t1) / 100) / 10;
      const resultadoHttps = (await page.locator("p[role=status], p[role=alert]").allInnerTexts()).join(" | ");
      medir(`cadastro https -> resposta em ${demoraHttps}s; mensagem: "${resultadoHttps}"`);
      await foto(page, "mcp-cadastro-https", conteudo(page));
      await expect(page.getByText("[teste-006] DeepWiki").first()).toBeVisible({ timeout: 30_000 });
      criado.push('servidor MCP "[teste-006] DeepWiki" (slug teste006-wiki, https://mcp.deepwiki.com/mcp)');
    }
    await page.reload({ waitUntil: "load" });
    for (let tentativa = 1; tentativa <= 3; tentativa++) {
      if ((await page.getByText("[teste-006] DeepWiki").count()) > 0) break;
      const msg = (await page.locator("p[role=alert]").allInnerTexts()).join(" | ");
      if (msg) medir(`ACHADO: lista de servidores respondeu erro na tentativa ${tentativa}: "${msg}"`);
      await page.waitForTimeout(4000);
      await page.reload({ waitUntil: "load" });
      await page.waitForTimeout(3000);
    }
    await expect(page.getByText("[teste-006] DeepWiki").first()).toBeVisible({ timeout: 60_000 });
    await page.getByRole("button", { name: /Ferramentas de \[teste-006\] DeepWiki/ }).click();
    const seletorAgente = page.locator('select[id^="agente-"]');
    await expect(seletorAgente).toBeVisible({ timeout: 60_000 });
    await seletorAgente.selectOption({ label: NOME_AGENTE });
    const interruptores = page.getByRole("switch");
    await expect(interruptores.first()).toBeVisible({ timeout: 60_000 });
    const total = await interruptores.count();
    let ligados = await page.locator('[role="switch"][aria-checked="true"]').count();
    if (ligados > 0) {
      // Reexecução: uma corrida anterior deixou ferramenta ligada no rascunho. Desliga para repetir a prova.
      medir(`reexecucao: ${ligados} interruptor(es) ja ligado(s) por corrida anterior; desligando antes de medir`);
      while ((await page.locator('[role="switch"][aria-checked="true"]').count()) > 0) {
        await page.locator('[role="switch"][aria-checked="true"]').first().click();
        await page.waitForTimeout(2500);
      }
      ligados = 0;
    }
    medir(`ferramentas listadas: ${total} interruptores; ligados no inicio: ${ligados} (esperado: nascem desligadas)`);
    await foto(page, "mcp-ferramentas-desligadas", conteudo(page));
    expect(ligados).toBe(0);

    const haLeitura = (await page.locator("tr", { hasText: "Leitura" }).count()) > 0;
    medir(`classificacao das ferramentas do DeepWiki na tela: com tipo Leitura=${haLeitura}; todas como Escrita=${!haLeitura}`);
    const linhaLeitura = haLeitura ? page.locator("tr", { hasText: "Leitura" }).first() : page.locator("tr", { has: page.getByRole("switch") }).first();
    await expect(linhaLeitura).toBeVisible();
    await linhaLeitura.getByRole("switch").first().click();
    await page.waitForTimeout(3000);
    const aposLigar = await toasts();
    await expect(page.getByRole("switch").first()).toHaveAttribute("aria-checked", "true", { timeout: 20_000 }).catch(() => undefined);
    const marcado = await page.getByRole("switch").first().getAttribute("aria-checked");
    medir(`apos ligar: interruptor da ferramenta aria-checked=${marcado}`);
    const aviso = await conteudo(page).innerText();
    medir(
      `ligar uma ferramenta de leitura -> toast "${aposLigar}"; aviso "so vale quando voce publicar" visivel=${/s[oó] vale quando voc[eê] publicar/i.test(aviso)}`,
    );
    await foto(page, "mcp-ligar-leitura", conteudo(page));

    const ligadosAntes = await page.locator('[role="switch"][aria-checked="true"]').count();
    await page.getByRole("button", { name: "Atualizar ferramentas" }).click();
    await page.waitForTimeout(6000);
    const mudou = await page.getByTestId("mudancas").innerText().catch(() => "(sem quadro de mudancas)");
    const ligadosDepois = await page.locator('[role="switch"][aria-checked="true"]').count();
    medir(`Atualizar ferramentas: interruptores ligados antes=${ligadosAntes}, depois=${ligadosDepois}; quadro: "${mudou.split(/\s+/).join(" ")}"`);
    medir("OBS: o servidor publico nao mudou entre as chamadas; se o quadro lista ferramentas como Alteradas, e falso positivo");
    await foto(page, "mcp-atualizar-ferramentas", conteudo(page));
    return "pagina abriu (conta e dona da instalacao); http recusado; ferramentas nascem desligadas; ligar e atualizar exercitados (ver medidas)";
  });
});

// ─── 7. Central ─────────────────────────────────────────────────────────────
test("7. Central de avisos carrega sem erro", async () => {
  await passo(
    "7 Central",
    async () => {
      await abrir("/app/ai/inbox");
      await expect(page.getByText("Central de avisos").first()).toBeVisible({ timeout: 60_000 });
      await page.waitForTimeout(2500);
      const t = await conteudo(page).innerText();
      expect(t).not.toMatch(/algo deu errado|n[aã]o consegui carregar|erro ao carregar/i);
      const aprovar = await page.getByRole("button", { name: /Aprovar/ }).count();
      medir(`Central: carregou; botoes Aprovar visiveis=${aprovar} (so existem com acao MCP pendente real)`);
      await foto(page, "central-carrega", conteudo(page));
      return "carregou sem erro; o cartao Aprovar/Recusar nao foi exercitado (exige acao pendente real, logo WhatsApp)";
    },
  );
});

// ─── 8. tema e idioma ───────────────────────────────────────────────────────
interface Contraste {
  checados: number;
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
      const tam = parseFloat(cs.fontSize);
      const grande = tam >= 24 || (tam >= 18.66 && parseInt(cs.fontWeight, 10) >= 700);
      if (razao < (grande ? 3 : 4.5)) {
        abaixo.push({ texto: no.textContent!.trim().slice(0, 40), razao: Math.round(razao * 100) / 100, tam });
      }
    }
    return { checados, abaixo: abaixo.slice(0, 8), min: Math.round(min * 100) / 100 };
  });
}

const TELAS_NOVAS = [
  { rota: () => "/app/ai/usage", nome: "uso" },
  { rota: () => "/app/settings/servidor-mcp-externo", nome: "mcp" },
  { rota: () => `/app/ai/agents/${agenteId}`, nome: "agente" },
  { rota: () => "/app/ai/inbox", nome: "central" },
];

test("8a. tema claro e escuro: contraste dos textos nas telas novas", async () => {
  await passo("8a tema claro/escuro (contraste)", async () => {
    const problemas: string[] = [];
    for (const esquema of ["light", "dark"] as const) {
      await page.emulateMedia({ colorScheme: esquema });
      for (const tela of TELAS_NOVAS) {
        await page.goto(tela.rota(), { waitUntil: "load" });
        await expect(conteudo(page)).toBeVisible({ timeout: 60_000 });
        await page.waitForTimeout(3000);
        const escuro = await page.evaluate(
          () => document.documentElement.classList.contains("dark") || document.documentElement.dataset.theme === "dark",
        );
        const c = await medirContraste();
        medir(
          `contraste [${esquema}] ${tela.nome}: tema escuro aplicado=${escuro}; textos medidos=${c.checados}; menor razao=${c.min}; abaixo do minimo AA=${c.abaixo.length}`,
        );
        if (c.abaixo.length) {
          problemas.push(`${esquema}/${tela.nome}: ${c.abaixo.map((x) => `"${x.texto}" ${x.razao}`).join("; ")}`);
        }
        await foto(page, `tema-${esquema}-${tela.nome}`, conteudo(page));
      }
    }
    await page.emulateMedia({ colorScheme: "light" });
    if (problemas.length) {
      medir(`textos abaixo do contraste minimo: ${problemas.join(" || ")}`);
      throw new Error(`contraste abaixo de AA: ${problemas.join(" || ").slice(0, 350)}`);
    }
    return "todos os textos medidos >= 4,5:1 (3:1 para texto grande) nos dois temas";
  });
});

test("8b. idioma espanhol nas telas novas", async () => {
  await passo("8b espanhol", async () => {
    await page.goto("/app/ai/usage", { waitUntil: "load" });
    await page.getByRole("button", { name: /Idioma/ }).click();
    await page.getByRole("menuitem", { name: /Espa/ }).click();
    await page.waitForTimeout(2500);
    const esperado: Array<[string, string[]]> = [
      ["/app/ai/usage", ["Presupuesto mensual de IA"]],
      ["/app/settings/servidor-mcp-externo", ["Registrar servidor", "Registrar y probar", "Clave de acceso"]],
      [`/app/ai/agents/${agenteId}`, ["Operación del agente", "Asistido: revisar antes de enviar"]],
    ];
    const faltou: string[] = [];
    try {
      for (const [rota, frases] of esperado) {
        await page.goto(rota, { waitUntil: "load" });
        await expect(conteudo(page)).toBeVisible({ timeout: 60_000 });
        await page.waitForTimeout(3000);
        const txt = await page.locator("body").evaluate((b) => (b as HTMLElement).innerText);
        const html = await page.locator("body").innerHTML();
        for (const f of frases) {
          const achou = txt.includes(f) || html.includes(f);
          medir(`espanhol ${rota.replace(agenteId, "<agente>")}: "${f}" presente=${achou}`);
          if (!achou) faltou.push(`${rota}: ${f}`);
        }
        await foto(page, `espanhol-${rota.includes("agents") ? "agente" : rota.split("/").filter(Boolean).slice(-1)[0]?.slice(0, 12) ?? "pagina"}`, conteudo(page));
      }
      await page.goto(`/app/ai/agents/${agenteId}`, { waitUntil: "load" });
      await page.getByLabel(/Modo de operación|Modo de operação/).selectOption("automatic");
      const dlg = page.getByRole("alertdialog");
      await expect(dlg).toBeVisible();
      const ok = (await dlg.innerText()).includes("Activar el modo automático");
      medir(`espanhol: dialogo do automatico em espanhol=${ok}`);
      await foto(page, "espanhol-dialogo-automatico", dlg);
      await page.keyboard.press("Escape");
      if (!ok) faltou.push("dialogo automatico");
    } finally {
      await page.goto("/app/ai/usage", { waitUntil: "load" });
      await page.getByRole("button", { name: /Idioma|Idiom/ }).click();
      await page.getByRole("menuitem", { name: /Portugu/ }).click();
      await page.waitForTimeout(2000);
    }
    if (faltou.length) throw new Error(`sem traducao: ${faltou.join("; ")}`);
    return "textos novos aparecem em espanhol (usage, MCP, operacao do agente, dialogo); idioma devolvido ao portugues";
  });
});

// ─── 9. papel menor ─────────────────────────────────────────────────────────
test("9. papel menor", async () => {
  await passo(
    "9 papel menor",
    async () => {
      const membros = await ler<{ role: string }>("user_organizations?select=role");
      const papeis = membros.map((m) => m.role).join(",");
      medir(`membros da organizacao (so papeis): ${papeis}`);
      return `existe(m) ${membros.length} usuario(s) com papel(is) ${papeis}; nao criei usuarios; telas como papel menor nao exercitadas`;
    },
    { naoExercitavel: true },
  );
});
