/**
 * VISUAL DE MENSAGEIRO: A JORNADA QUE TIRA AS CAPTURAS (issue #82, ADR 0007; modo homologação: issue #103).
 *
 * Abre as telas de uma etapa no computador e no celular, nos temas claro e escuro, e guarda uma captura
 * de cada. É a prova que o dono olha na homologação antes de uma etapa ir para produção, e também o
 * "antes" (rodado antes de mexer em qualquer tela).
 *
 * MODO LOCAL (padrão; precisa do app e do Supabase locais, como as outras specs):
 *   VISUAL_ETAPA=1 VISUAL_FASE=antes  pnpm playwright test tests/e2e/visual-de-mensageiro-jornada.spec.ts
 *   VISUAL_ETAPA=1 VISUAL_FASE=depois pnpm playwright test tests/e2e/visual-de-mensageiro-jornada.spec.ts
 *   (`VISUAL_ETAPA=todas` percorre as cinco; o padrão é a etapa 1.)
 *
 * MODO HOMOLOGAÇÃO (sem Docker nem banco local; só leitura; NUNCA produção):
 *   VISUAL_ALVO=hml VISUAL_FASE=antes VISUAL_ETAPA=todas \
 *     pnpm playwright test -c playwright.visual-hml.config.ts
 *   Entra em https://hml.corretora.io pelo formulário de login com a conta de teste, lida de
 *   `HML_ADMIN_EMAIL` e `HML_ADMIN_PASSWORD` (ambiente) ou de `~/.secrets/hml-admin.env`. Recusa qualquer
 *   outro host antes de abrir página (ver `helpers/visual-de-mensageiro-alvo.ts`). Janela de 1440x900 no
 *   computador e 390x844 no celular. Pedidos que escrevem (POST, PUT, PATCH, DELETE) são barrados. Uma tela
 *   que não carrega ou estoura a largura no celular vira "falha" no índice, sem derrubar as demais; a conta
 *   que não é da plataforma deixa as telas de /admin como "puladas", com o motivo.
 *
 * As capturas vão para `evidence/visual-de-mensageiro/<fase>/etapa-<N>/<tela>-<viewport>-<tema>.png`; no
 * modo homologação sai também o índice `evidence/visual-de-mensageiro/<fase>/README.md`.
 *
 * O que ela afirma, além de capturar: a tela abriu (sem a página de erro), nada estoura a largura da janela
 * no celular, e não houve erro de console da própria página. Não compara imagem com imagem: a marca muda a
 * cor de destaque, e o visual é aprovado pelo dono olhando as capturas.
 *
 * FORA_DO_CI: gera imagens, não regressão. O modo local foi escrito sem poder rodar na máquina do autor
 * (sem Docker/Supabase local); o modo homologação depende de um servidor externo e de uma conta de teste.
 */
import { appendFileSync, existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import * as os from "node:os";
import * as path from "node:path";

import { expect, test, type BrowserContext, type Page } from "./helpers/test";

import { lerCreds, loginComoAdmin, loginComoDono } from "./helpers/login-admin";
import {
  NOME_DO_CONTATO_DE_EXEMPLO,
  acharConversaPeloNome,
  decidirTelaDaConversa,
  faseValida,
} from "./helpers/visual-de-mensageiro-conversa";
import {
  HOST_DA_HOMOLOGACAO,
  lerCredenciaisHml,
  montarIndice,
  navegacaoPermitida,
  redigir,
  resolverAlvo,
  type RegistroDeCaptura,
} from "./helpers/visual-de-mensageiro-alvo";
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

// Resolve o alvo ANTES de qualquer página: um alvo que não seja a homologação derruba a spec aqui.
const ALVO = resolverAlvo(process.env);
const HML = ALVO.modo === "hml";

const FASE = faseValida(process.env.VISUAL_FASE);
const PEDIDA = process.env.VISUAL_ETAPA ?? "1";
const ETAPAS_PEDIDAS: Etapa[] =
  PEDIDA === "todas" ? [...ETAPAS] : ETAPAS.filter((e) => String(e) === PEDIDA);

const RAIZ_DA_EVIDENCIA = path.join(process.cwd(), "evidence", "visual-de-mensageiro", FASE);

const JANELAS = HML
  ? [
      { nome: "computador", largura: 1440, altura: 900, celular: false },
      { nome: "celular", largura: 390, altura: 844, celular: true },
    ]
  : VIEWPORTS;

// Um login por papel: o seguinte esperaria a próxima janela do TOTP.
const SESSAO: Record<Exclude<Acesso, "publica">, string> = HML
  ? {
      app: path.join(os.tmpdir(), `visual-hml-sessao-${process.pid}.json`),
      plataforma: path.join(os.tmpdir(), `visual-hml-sessao-${process.pid}.json`),
    }
  : {
      app: `/tmp/e2e-sessao-visual-app-${process.pid}.json`,
      plataforma: `/tmp/e2e-sessao-visual-plataforma-${process.pid}.json`,
    };

// Segredos da homologação: só em memória, só para a redação de qualquer texto que saia daqui.
const CREDS_HML = HML
  ? lerCredenciaisHml(process.env, () => {
      try {
        return readFileSync(path.join(os.homedir(), ".secrets", "hml-admin.env"), "utf8");
      } catch {
        return undefined;
      }
    })
  : null;
const SEGREDOS = CREDS_HML ? [CREDS_HML.email, CREDS_HML.senha] : [];

const REGISTRO = process.env.VISUAL_REGISTRO ?? path.join(os.tmpdir(), `visual-hml-registro-${process.pid}.jsonl`);
let plataformaPula: string | null = null;

if (!HML) test.describe.configure({ mode: "serial", timeout: 120_000 });
else test.describe.configure({ timeout: 120_000 });

function registrar(r: RegistroDeCaptura): void {
  if (!HML) return;
  appendFileSync(REGISTRO, `${redigir(JSON.stringify(r), SEGREDOS)}\n`);
}

async function loginNaHomologacao(page: Page): Promise<void> {
  const { email, senha } = CREDS_HML!;
  try {
    // Espera a página hidratar antes de preencher: com "domcontentloaded" o clique em "Entrar" podia chegar antes do React
    // e o formulário não saía de /login (visto em 08/11/2026, depois do deploy com dependências novas).
    await page.goto("/login", { waitUntil: "networkidle" });
    await page.locator("#email").fill(email);
    await page.locator("#password").fill(senha);
    await page.getByRole("button", { name: "Entrar", exact: true }).click();
    await page.waitForURL((u) => !/^\/login\/?$/.test(u.pathname), { timeout: 30_000 });
    if (/\/login\/mfa/.test(new URL(page.url()).pathname)) {
      throw new Error("A homologação pediu segundo fator (MFA). Parei sem tentar contornar.");
    }
    if (!navegacaoPermitida(page.url())) throw new Error("O login terminou fora do host da homologação.");
  } catch (e) {
    // Os erros do Playwright citam o valor preenchido: nada disso sai sem passar pela redação.
    throw new Error(redigir(e instanceof Error ? e.message : String(e), SEGREDOS));
  }
}

test.beforeAll(async ({ browser }, testInfo) => {
  test.setTimeout(180_000);
  if (HML) {
    writeFileSync(REGISTRO, "");
    const contexto = await browser.newContext({ baseURL: ALVO.modo === "hml" ? ALVO.baseURL : undefined, storageState: undefined });
    const page = await contexto.newPage();
    await loginNaHomologacao(page);
    // A conta é da plataforma? Só uma leitura de /admin/dashboard diz.
    await page.goto("/admin/dashboard", { waitUntil: "domcontentloaded" }).catch(() => undefined);
    await page.waitForLoadState("networkidle", { timeout: 15_000 }).catch(() => undefined);
    const caminho = new URL(page.url()).pathname;
    plataformaPula = caminho.startsWith("/admin/") && !/login/.test(caminho) ? null : "a conta de teste da homologação não é administradora da plataforma";
    await contexto.storageState({ path: SESSAO.app });
    await contexto.close();
    return;
  }
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

test.afterAll(() => {
  if (!HML) return;
  rmSync(SESSAO.app, { force: true });
  if (!existsSync(REGISTRO)) return;
  const registros = readFileSync(REGISTRO, "utf8")
    .split("\n")
    .filter(Boolean)
    .map((l) => JSON.parse(l) as RegistroDeCaptura);
  mkdirSync(RAIZ_DA_EVIDENCIA, { recursive: true });
  writeFileSync(
    path.join(RAIZ_DA_EVIDENCIA, "README.md"),
    montarIndice({
      fase: FASE,
      host: HOST_DA_HOMOLOGACAO,
      data: new Date().toISOString().slice(0, 10),
      segredos: SEGREDOS,
      registros,
    }),
  );
});

test("a etapa pedida existe", () => {
  expect(ETAPAS_PEDIDAS, `VISUAL_ETAPA=${PEDIDA}: use 1 a 5 ou "todas"`).not.toHaveLength(0);
});

async function estouroHorizontal(page: Page): Promise<number> {
  return page.evaluate(() => document.body.scrollWidth - document.documentElement.clientWidth);
}

/** Só leitura e só o host da homologação: barra navegação para fora e pedidos que escrevem. */
async function cercarContextoDaHomologacao(contexto: BrowserContext): Promise<void> {
  await contexto.route("**/*", (rota) => {
    const pedido = rota.request();
    const url = pedido.url();
    if (!/^https?:/.test(url)) return rota.continue();
    if (pedido.isNavigationRequest() && !navegacaoPermitida(url)) return rota.abort();
    const escreve = !["GET", "HEAD", "OPTIONS"].includes(pedido.method());
    const renovaSessao = /\/auth\/v1\/token/.test(new URL(url).pathname);
    if (escreve && !renovaSessao) return rota.abort();
    return rota.continue();
  });
}

/** Esqueletos de verdade na janela: dentro da área visível, com tamanho, visíveis e não transparentes. */
function esqueletosNaJanela(): string[] {
  const seletor = '[aria-busy="true"], .ds-esqueleto, .animate-pulse, [data-slot="skeleton"], [data-loading="true"]';
  return Array.from(document.querySelectorAll(seletor))
    .filter((el) => {
      const r = (el as HTMLElement).getBoundingClientRect();
      const estilo = getComputedStyle(el as HTMLElement);
      return (
        // Pontos de status que pulsam para sempre (ex.: o aviso na faixa de ícones) não são esqueleto.
        (r.width >= 16 || r.height >= 16) &&
        r.bottom > 0 &&
        r.right > 0 &&
        r.top < window.innerHeight &&
        r.left < window.innerWidth &&
        estilo.visibility !== 'hidden' &&
        Number(estilo.opacity) > 0.05
      );
    })
    .map((el) => el.tagName.toLowerCase() + '.' + String((el as HTMLElement).className).split(' ').slice(0, 3).join('.'));
}

/** Espera o conteúdo de verdade: rede ociosa e nenhum esqueleto visível na janela. Devolve o que sobrou. */
async function esperarOConteudo(page: Page): Promise<string[]> {
  await page.waitForLoadState('networkidle', { timeout: 20_000 }).catch(() => undefined);
  const limite = Date.now() + 20_000;
  let sobra = await page.evaluate(esqueletosNaJanela);
  while (sobra.length > 0 && Date.now() < limite) {
    await page.waitForTimeout(500);
    sobra = await page.evaluate(esqueletosNaJanela);
  }
  await page.waitForTimeout(800);
  return page.evaluate(esqueletosNaJanela);
}

for (const etapa of ETAPAS_PEDIDAS) {
  for (const tela of TELAS_POR_ETAPA[etapa]) {
    for (const vp of JANELAS) {
      for (const tema of TEMAS) {
        test(`etapa ${etapa} · ${tela.slug} · ${vp.nome} · ${tema}`, async ({ browser, baseURL }) => {
          const base = { etapa, slug: tela.slug, viewport: vp.nome, tema };
          if (!HML && tela.conversa) test.skip(true, "a conversa de exemplo so existe na homologacao");
          if (HML && tela.acesso === "plataforma" && plataformaPula) {
            registrar({ ...base, status: "pulada", observacao: plataformaPula });
            test.skip(true, plataformaPula);
          }

          const pasta = path.join(RAIZ_DA_EVIDENCIA, `etapa-${etapa}`);
          mkdirSync(pasta, { recursive: true });

          const contexto = await browser.newContext({
            baseURL: (HML && ALVO.modo === "hml" ? ALVO.baseURL : baseURL) ?? undefined,
            viewport: { width: vp.largura, height: vp.altura },
            isMobile: vp.celular,
            hasTouch: vp.celular,
            locale: "pt-BR",
            storageState: semSessao(tela) ? undefined : SESSAO[tela.acesso as Exclude<Acesso, "publica">],
          });
          if (HML) await cercarContextoDaHomologacao(contexto);
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
          const arquivo = path.join(pasta, `${tela.slug}-${vp.nome}-${tema}.png`);

          try {
            if (HML) {
              const falhas: string[] = [];
              let capturada = false;
              try {
                const resposta = await page.goto(tela.rota, { waitUntil: "domcontentloaded" });
                const status = resposta?.status() ?? 0;
                if (status === 0 || status >= 400) falhas.push(`${tela.rota} respondeu ${status}`);
                const esqueletos = await esperarOConteudo(page);
                if (esqueletos.length > 0) falhas.push(`continuou em carregamento após 20 s (${esqueletos.length} esqueleto(s): ${esqueletos[0]})`);
                const caminho = new URL(page.url()).pathname;
                if (tela.acesso !== "publica" && /^\/login/.test(caminho)) {
                  falhas.push("voltou para o login (sessão não valeu)");
                }
                await page.waitForFunction((v) => document.documentElement.getAttribute("data-theme") === v, valor, { timeout: 5_000 }).catch(() => undefined);
                if ((await page.locator("html").getAttribute("data-theme")) !== valor) {
                  falhas.push(`tema ${valor} não aplicado`);
                }
                if (tela.conversa && !/^\/login/.test(caminho)) {
                  const prep = await prepararConversaDeExemplo(page, tela.conversa, vp.celular);
                  if (prep.pulada) {
                    registrar({ ...base, status: "pulada", capturada: false, observacao: prep.pulada });
                    return;
                  }
                  falhas.push(...prep.falhas);
                }
                if (vp.celular) {
                  const estouro = await estouroHorizontal(page);
                  if (estouro > 0) falhas.push(`estouro horizontal de ${estouro}px no celular`);
                }
                if (falhas.length === 0 || !/^\/login/.test(caminho) || tela.acesso === "publica") {
                  await page.screenshot({ path: arquivo, fullPage: false });
                  capturada = true;
                }
              } catch (e) {
                falhas.push(`não carregou: ${e instanceof Error ? e.message.split("\n")[0] : String(e)}`);
              }
              if (errosDeConsole.length > 0) falhas.push(`erro de script da página: ${errosDeConsole[0]}`);
              registrar({
                ...base,
                status: falhas.length === 0 ? "ok" : "falha",
                capturada,
                observacao: falhas.join("; "),
              });
              return;
            }

            const resposta = await page.goto(tela.rota, { waitUntil: "domcontentloaded" });
            expect(resposta?.status() ?? 0, `${tela.rota} respondeu`).toBeLessThan(400);
            await page.waitForLoadState("networkidle", { timeout: 20_000 }).catch(() => undefined);
            await expect(page.locator("html")).toHaveAttribute("data-theme", valor);

            if (vp.celular) expect(await estouroHorizontal(page), "estouro horizontal no celular").toBeLessThanOrEqual(0);
            expect(errosDeConsole, "erro de script da própria página").toEqual([]);

            await page.screenshot({ path: arquivo, fullPage: false });
          } finally {
            await contexto.close();
          }
        });
      }
    }
  }
}

/**
 * Telas do Inbox com a conversa de exemplo (issue #113). Só leitura: acha a conversa na lista pelo nome
 * do contato (se preciso, digitando o nome na busca, que filtra no cliente/GET), abre com um clique e,
 * para o painel do contato no celular, abre a ficha. Devolve o motivo de pular, ou as falhas.
 */
async function prepararConversaDeExemplo(
  page: Page,
  quer: NonNullable<TelaDoVisual["conversa"]>,
  celular: boolean,
): Promise<{ pulada?: string; falhas: string[] }> {
  const lerItens = () =>
    page
      .locator("button[data-conversation-id]")
      .evaluateAll((els) =>
        els.map((el) => ({ id: el.getAttribute("data-conversation-id") ?? "", texto: (el as HTMLElement).innerText })),
      );
  let id = acharConversaPeloNome(await lerItens(), NOME_DO_CONTATO_DE_EXEMPLO);
  if (!id) {
    // A aba padrão ("Fila") só lista conversa SEM dono; a de exemplo está atribuída ao atendente, então fica em
    // "Minhas". Abrir a aba por `?filter=mine` é só uma leitura (GET) e não mexe em nada.
    await page.goto("/app/inbox?filter=mine", { waitUntil: "networkidle" });
    await esperarOConteudo(page);
    id = acharConversaPeloNome(await lerItens(), NOME_DO_CONTATO_DE_EXEMPLO);
  }
  if (!id) {
    const busca = page.getByPlaceholder(/Buscar por nome/).first();
    if ((await busca.count()) > 0) {
      await busca.fill(NOME_DO_CONTATO_DE_EXEMPLO);
      await page.waitForTimeout(1_500);
      await esperarOConteudo(page);
      id = acharConversaPeloNome(await lerItens(), NOME_DO_CONTATO_DE_EXEMPLO);
    }
  }
  // A lista, sozinha, se captura mesmo sem a conversa de exemplo.
  if (quer === "lista") return { falhas: [] };
  const decisao = decidirTelaDaConversa(id);
  if (!decisao.abrir) return { pulada: decisao.registro.observacao, falhas: [] };

  await page.locator(`button[data-conversation-id="${decisao.id}"]`).first().click();
  await page.waitForURL((u) => u.searchParams.get("id") === decisao.id, { timeout: 15_000 }).catch(() => undefined);
  const sobra = await esperarOConteudo(page);
  const falhas: string[] = [];
  if (sobra.length > 0) falhas.push(`a conversa continuou em carregamento (${sobra[0]})`);
  if (quer === "contato" && celular) {
    const ficha = page.getByRole("button", { name: /^(Ficha|Ver contato|Dados do contato)$/ }).first();
    if ((await ficha.count()) === 0) falhas.push("nao achei o botao que abre a ficha do contato no celular");
    else {
      await ficha.click();
      await page.waitForTimeout(800);
      await esperarOConteudo(page);
    }
  }
  return { falhas };
}

function semSessao(tela: TelaDoVisual): boolean {
  return tela.acesso === "publica";
}
