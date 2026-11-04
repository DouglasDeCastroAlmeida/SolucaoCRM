#!/usr/bin/env node
// Mudança 003 (T-040, AC-010.3): jornada da cobrança na HOMOLOGAÇÃO, provada PELA TELA.
/* eslint-disable no-console */
// O navegador (Playwright) entra como o dono da organização de teste na marca de teste e fotografa
// o que ele vê em cada passo; o passo do TEMPO é simulado mexendo nas datas da linha de
// `cobranca_assinaturas` da organização de teste (banco da hml, filtro por organization_id), e a régua
// roda pelo caminho do produto: ou o cron real (`--cron`, espera o minuto 43), ou a mesma função que o
// cron chama (`aplicarRegua`, pelo helper jornada-cobranca-hml.regua.mts). O que o provedor faria
// (cobrar de verdade, virar OVERDUE) NÃO é simulado no Asaas: fica declarado como NÃO MEDIDO.
//
// Passos (um por chamada, na ordem; cada um confere o banco e a tela):
//   base          fotografa o estado de partida (teste com cartão, já pago antes pelo dono) e guarda o original
//   trial-aviso   fim do teste em 2 dias  -> aviso "cobrado em 2 dias" (com --cron espera a rodada real)
//   trial-amanha  fim do teste amanhã     -> aviso "cobrado amanhã"
//   cobrou        1ª cobrança paga        -> conta ativa, nenhum aviso
//   atraso        pagamento vencido ontem -> aviso "venceu"
//   aviso-final   dívida de 1,5 dia       -> aviso "suspende em breve"
//   suspende      dívida de 4 dias, aviso final há 49 h -> empresa suspensa, hub na tela
//   reativa       pagamento confirmado    -> empresa volta, aviso "liberada"
//   restaurar     devolve a linha ao original e apaga os avisos criados pela jornada
// Uso: node scripts/sondas/jornada-cobranca-hml.mjs <passo> [--cron]
// Nunca imprime senha, chave, e-mail ou id inteiro. Fotos com e-mail e campos mascarados.
import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

import { chromium } from "@playwright/test";

const SEGREDOS = join(homedir(), ".secrets");
const HOST = process.env.TESTE003_HOST ?? "marca-a.corretora.io";
const BASE = `https://${HOST}`;
const NOME_DA_ORG = "[teste-003] Empresa Exemplo";
const EVIDENCIA = join("evidence", "003-billing", "jornada-hml");
const ORIGINAL = join(SEGREDOS, "jornada-003-original.json");
const ONBOARD = join(SEGREDOS, "jornada-003-onboarded.json");
const BASE_IDS = join(SEGREDOS, "jornada-003-base-ids.json");
const CAMPOS = ["estado", "trial_ate", "vencida_desde", "proximo_vencimento", "ultimo_aviso", "ultimo_aviso_em", "relida_em", "periodo_pago_desde", "prazo_extra_ate"];

function lerEnv(arquivo) {
  return Object.fromEntries(
    readFileSync(arquivo, "utf8")
      .split(/\r?\n/)
      .filter((l) => l.includes("="))
      .map((l) => [l.slice(0, l.indexOf("=")), l.slice(l.indexOf("=") + 1).trim().replace(/^["']|["']$/g, "")]),
  );
}
const sb = lerEnv(join(SEGREDOS, "supabase-hml.env"));
const conta = lerEnv(join(SEGREDOS, "teste-003-hml.env"));
const cab = { apikey: sb.SUPABASE_SERVICE_ROLE_KEY, authorization: `Bearer ${sb.SUPABASE_SERVICE_ROLE_KEY}`, "content-type": "application/json" };

async function rest(metodo, caminho, corpo) {
  const r = await fetch(`${sb.SUPABASE_URL}/rest/v1/${caminho}`, {
    method: metodo,
    headers: { ...cab, prefer: "return=representation" },
    body: corpo ? JSON.stringify(corpo) : undefined,
  });
  if (!r.ok) throw new Error(`banco ${metodo} ${caminho.split("?")[0]} -> ${r.status}`);
  return r.json();
}

const resultados = [];
function item(id, descricao, passou, detalhe = "") {
  resultados.push({ id, descricao, passou, detalhe });
  console.log(`${passou ? "PASSOU" : "FALHOU"}  ${id} ${descricao}${detalhe ? ` (${detalhe})` : ""}`);
}

const agoraMais = (ms) => new Date(Date.now() + ms).toISOString();
const H = 3_600_000;
const D = 24 * H;
/** Fim do dia civil de São Paulo de hoje + n dias (a régua conta por dia civil). */
function fimDoDia(n) {
  const dia = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date(Date.now() + n * D));
  return new Date(`${dia}T23:59:59-03:00`).toISOString();
}
const ddmm = (iso) => new Intl.DateTimeFormat("pt-BR", { timeZone: "America/Sao_Paulo", day: "2-digit", month: "2-digit" }).format(new Date(iso));

const [passo, ...flags] = process.argv.slice(2);
const comCron = flags.includes("--cron");
if (!passo) {
  console.error("Uso: node scripts/sondas/jornada-cobranca-hml.mjs <base|trial-aviso|trial-amanha|cobrou|atraso|aviso-final|suspende|reativa|restaurar> [--cron]");
  process.exit(2);
}

const orgs = await rest("GET", `organizations?select=id,status,suspended_kind,brand_id&display_name=eq.${encodeURIComponent(NOME_DA_ORG)}`);
if (orgs.length !== 1) throw new Error("organização de teste não encontrada (ou ambígua)");
const orgId = orgs[0].id;
const linha = async () =>
  (await rest("GET", `cobranca_assinaturas?select=${CAMPOS.join(",")},trial_com_cartao,pagamento_inicial_pendente&organization_id=eq.${orgId}`))[0];
const orgAgora = async () => (await rest("GET", `organizations?select=status,suspended_kind&id=eq.${orgId}`))[0];
const patch = (corpo) => rest("PATCH", `cobranca_assinaturas?organization_id=eq.${orgId}`, corpo);
const avisosDaOrg = async () =>
  rest("GET", `agent_inbox_items?select=id,title,created_at&organization_id=eq.${orgId}&kind=eq.cobranca&ref_kind=is.null&order=created_at.desc&limit=10`);

mkdirSync(EVIDENCIA, { recursive: true });
const SEQ = ["base", "trial-aviso", "trial-amanha", "cobrou", "atraso", "aviso-final", "suspende", "reativa", "restaurar"];
const n = String(SEQ.indexOf(passo) + 1).padStart(2, "0");

/** Dispara a régua: cron real (espera a rodada do minuto 43) ou a função do cron, localmente. */
async function dispararRegua(esperado) {
  if (comCron) {
    const limite = Date.now() + 80 * 60_000;
    console.log("(esperando a rodada real do cron da hml, minuto 43 de cada hora)");
    while (Date.now() < limite) {
      const l = await linha();
      if (l.ultimo_aviso === esperado) return "cron";
      await new Promise((r) => setTimeout(r, 30_000));
    }
    return "cron_nao_rodou";
  }
  const cli = join("node_modules", "tsx", "dist", "cli.mjs");
  const saida = execFileSync(process.execPath, [cli, join("scripts", "sondas", "jornada-cobranca-hml.regua.mts"), orgId], { encoding: "utf8", env: { ...process.env, NODE_NO_WARNINGS: "1" } });
  return JSON.parse(saida.trim().split("\n").pop()).acao;
}

/** Entra pela tela de login como o dono da empresa de teste. */
async function entrar(p) {
  await p.goto(`${BASE}/login`);
  await p.waitForLoadState("networkidle");
  await p.fill("input[type=email]", conta.TESTE003_EMAIL);
  await p.fill("input[type=password]", conta.TESTE003_PASSWORD);
  await p.click("button[type=submit]");
  await p.waitForURL((u) => !u.pathname.startsWith("/login"), { timeout: 45_000 });
}

/** Foto de página inteira com e-mails e campos mascarados + medidas por ferramenta (sem rolagem lateral, nada fora da janela). */
async function telaDe(p, caminho, nome) {
  await p.goto(`${BASE}${caminho}`);
  await p.waitForLoadState("networkidle");
  const url = new URL(p.url());
  const arquivo = join(EVIDENCIA, `${n}-${passo}-${nome}.png`);
  await p.screenshot({ path: arquivo, fullPage: true, mask: [p.getByText(/[\w.+-]+@[\w-]+\.[\w.-]+/), p.locator("input")], maskColor: "#888888" });
  const medidas = await p.evaluate(() => {
    const w = window.innerWidth;
    const fora = [...document.querySelectorAll("button, a, [role=status]")].filter((e) => {
      const r = e.getBoundingClientRect();
      return r.width > 0 && r.height > 0 && (r.left < -1 || r.right > w + 1);
    }).length;
    return { larguraDaJanela: w, larguraDoConteudo: document.documentElement.scrollWidth, elementosForaDaJanela: fora };
  });
  const semRolagemLateral = medidas.larguraDoConteudo <= medidas.larguraDaJanela + 1 && medidas.elementosForaDaJanela === 0;
  item(`${n}.${nome}.medida`, `tela ${url.pathname} sem rolagem lateral e sem botão fora da janela`, semRolagemLateral, JSON.stringify(medidas));
  return { url: url.pathname, texto: await p.innerText("body") };
}

async function comNavegador(fn) {
  const nav = await chromium.launch();
  try {
    const ctx = await nav.newContext({ viewport: { width: 1100, height: 800 } });
    const p = await ctx.newPage();
    await entrar(p);
    return await fn(p);
  } finally {
    await nav.close();
  }
}

if (passo === "base") {
  if (!existsSync(ORIGINAL)) {
    const l = await linha();
    writeFileSync(ORIGINAL, JSON.stringify(Object.fromEntries(CAMPOS.map((c) => [c, l[c]]))));
    writeFileSync(BASE_IDS, JSON.stringify((await avisosDaOrg()).map((a) => a.id))); // os que já existiam NÃO são nossos
  }
  // O portão de /app manda quem não terminou o onboarding para ele; sem isto a faixa e o hub não aparecem.
  // É da empresa de teste e é desfeito em `restaurar`.
  if (!existsSync(ONBOARD)) {
    const [o] = await rest("GET", `organizations?select=onboarded_at&id=eq.${orgId}`);
    writeFileSync(ONBOARD, JSON.stringify({ onboarded_at: o.onboarded_at }));
    if (o.onboarded_at === null) await rest("PATCH", `organizations?id=eq.${orgId}`, { onboarded_at: new Date().toISOString() });
  }
  const l = await linha();
  item("base.estado", "partida: teste com cartão, assinatura criada, empresa ativa", l.estado === "trial" && l.trial_com_cartao === true && l.pagamento_inicial_pendente === false && (await orgAgora()).status === "active", `estado ${l.estado}`);
  await comNavegador(async (p) => {
    await telaDe(p, "/app", "app");
    await telaDe(p, "/app/settings/billing", "plano");
  });
} else if (passo === "trial-aviso" || passo === "trial-amanha") {
  const dias = passo === "trial-aviso" ? 2 : 1;
  const esperado = passo === "trial-aviso" ? "trial_cobra_em_2_dias" : "trial_cobra_amanha";
  const fim = fimDoDia(dias);
  await patch({ estado: "trial", trial_ate: fim, vencida_desde: null, ultimo_aviso: passo === "trial-aviso" ? null : "trial_cobra_em_2_dias", ultimo_aviso_em: agoraMais(-D), relida_em: agoraMais(0) });
  const como = await dispararRegua(esperado);
  const l = await linha();
  item(`${n}.regua`, `a régua (${como}) gravou o aviso ${esperado}`, l.ultimo_aviso === esperado, `ultimo_aviso ${l.ultimo_aviso}`);
  const avisos = await avisosDaOrg();
  const noCentral = avisos.find((a) => a.title.includes(ddmm(fim)));
  item(`${n}.central`, `a Central tem o aviso com a data da cobrança ${ddmm(fim)}`, Boolean(noCentral), noCentral ? noCentral.title : "sem item");
  await comNavegador(async (p) => {
    const app = await telaDe(p, "/app", "app");
    item(`${n}.faixa`, "a faixa do teste grátis aparece em /app", /Ver o plano/.test(app.texto));
    const faixa = await p.locator("[role=status]").filter({ hasText: "Ver o plano" }).first().boundingBox();
    item(`${n}.faixa.medida`, "a faixa ocupa a largura da janela (>= 95%)", Boolean(faixa) && faixa.width >= 1100 * 0.95, faixa ? `largura ${Math.round(faixa.width)}px de 1100` : "sem faixa");
    const plano = await telaDe(p, "/app/settings/billing", "plano");
    item(`${n}.plano`, "o painel do plano diz que a empresa está em teste", /teste/i.test(plano.texto));
    const central = await telaDe(p, "/app/ai/inbox", "central");
    item(`${n}.central.tela`, "o aviso aparece na Central, pela tela", central.texto.includes(ddmm(fim)), central.url);
  });
} else if (passo === "cobrou") {
  await patch({ estado: "ativa", trial_ate: agoraMais(-5 * 60_000), vencida_desde: null, proximo_vencimento: agoraMais(30 * D), ultimo_aviso: null, ultimo_aviso_em: null, relida_em: agoraMais(0), periodo_pago_desde: agoraMais(0) });
  const acao = await dispararRegua("-");
  const l = await linha();
  item(`${n}.regua`, "com a 1ª cobrança paga a régua não avisa nem suspende", acao === "nada" && l.ultimo_aviso === null && (await orgAgora()).status === "active", `acao ${acao}`);
  await comNavegador(async (p) => {
    const app = await telaDe(p, "/app", "app");
    item(`${n}.faixa`, "a faixa do teste grátis sumiu", !/Ver o plano/.test(app.texto));
    const plano = await telaDe(p, "/app/settings/billing", "plano");
    item(`${n}.plano`, "o painel do plano mostra assinatura ativa, sem aviso de dívida", /Em dia/.test(plano.texto) && !/vencid|atraso/i.test(plano.texto));
  });
} else if (passo === "atraso") {
  await patch({ estado: "em_atraso", vencida_desde: agoraMais(-12 * H), proximo_vencimento: agoraMais(-12 * H), ultimo_aviso: null, ultimo_aviso_em: null, relida_em: agoraMais(0) });
  const acao = await dispararRegua("-");
  const l = await linha();
  item(`${n}.regua`, "a régua avisa que o pagamento venceu", acao === "avisar" && l.ultimo_aviso === "venceu", `acao ${acao}, aviso ${l.ultimo_aviso}`);
  item(`${n}.acesso`, "a empresa segue ativa (tolerância de 3 dias)", (await orgAgora()).status === "active");
  await comNavegador(async (p) => {
    const app = await telaDe(p, "/app", "app");
    item(`${n}.faixa`, "a faixa de cobrança aparece em /app", /pagamento|cartão|vencid/i.test(app.texto));
    await telaDe(p, "/app/settings/billing", "plano");
    const central = await telaDe(p, "/app/ai/inbox", "central");
    item(`${n}.central.tela`, "o aviso aparece na Central", /venc|atras|cart/i.test(central.texto));
  });
} else if (passo === "aviso-final") {
  await patch({ vencida_desde: agoraMais(-1.5 * D), proximo_vencimento: agoraMais(-1.5 * D), relida_em: agoraMais(0) });
  const acao = await dispararRegua("-");
  const l = await linha();
  item(`${n}.regua`, "a régua dá o aviso final antes de suspender", acao === "avisar" && l.ultimo_aviso === "suspende_em_breve", `acao ${acao}, aviso ${l.ultimo_aviso}`);
  item(`${n}.acesso`, "a empresa segue ativa depois do aviso final", (await orgAgora()).status === "active");
  await comNavegador(async (p) => {
    await telaDe(p, "/app", "app");
    await telaDe(p, "/app/ai/inbox", "central");
  });
} else if (passo === "suspende") {
  await patch({ vencida_desde: agoraMais(-4 * D), proximo_vencimento: agoraMais(-4 * D), ultimo_aviso_em: agoraMais(-49 * H), relida_em: agoraMais(0) });
  const acao = await dispararRegua("-");
  const o = await orgAgora();
  item(`${n}.regua`, "passada a tolerância e as 48 h do aviso final, a régua suspende", acao === "suspender" && o.status === "suspended" && o.suspended_kind === "cobranca", `acao ${acao}, org ${o.status}/${o.suspended_kind}`);
  await comNavegador(async (p) => {
    await p.goto(`${BASE}/app`);
    await p.waitForURL(/account-suspended/, { timeout: 30_000 });
    item(`${n}.redireciona`, "/app de empresa suspensa por cobrança cai no hub", /account-suspended/.test(p.url()));
    const hub = await telaDe(p, "/account-suspended", "hub");
    item(`${n}.hub`, "o hub explica a suspensão por pagamento e dá o caminho para pagar", /pagamento|cobran|suspens/i.test(hub.texto));
  });
} else if (passo === "reativa") {
  await patch({ estado: "ativa", vencida_desde: null, proximo_vencimento: agoraMais(30 * D), ultimo_aviso: null, ultimo_aviso_em: null, relida_em: agoraMais(0), periodo_pago_desde: agoraMais(0) });
  const acao = await dispararRegua("-");
  const o = await orgAgora();
  item(`${n}.regua`, "pago o valor, a régua reativa a empresa", acao === "reativar" && o.status === "active" && o.suspended_kind === null, `acao ${acao}, org ${o.status}/${o.suspended_kind}`);
  await comNavegador(async (p) => {
    await p.goto(`${BASE}/app`);
    await p.waitForLoadState("networkidle");
    item(`${n}.volta`, "/app abre de novo (sem cair no hub)", !/account-suspended/.test(p.url()), new URL(p.url()).pathname);
    await telaDe(p, "/app", "app");
    await telaDe(p, "/app/settings/billing", "plano");
    await telaDe(p, "/app/ai/inbox", "central");
  });
} else if (passo === "restaurar") {
  const orig = JSON.parse(readFileSync(ORIGINAL, "utf8"));
  await patch(orig);
  const atuais = await avisosDaOrg();
  if (existsSync(ONBOARD)) await rest("PATCH", `organizations?id=eq.${orgId}`, JSON.parse(readFileSync(ONBOARD, "utf8")));
  const doBase = new Set(JSON.parse(readFileSync(BASE_IDS, "utf8")));
  const meus = atuais.filter((a) => !doBase.has(a.id)).map((a) => a.id);
  for (const id of meus) await rest("DELETE", `agent_inbox_items?id=eq.${id}&organization_id=eq.${orgId}`);
  const l = await linha();
  item(`${n}.linha`, "a linha de cobrança voltou ao original", CAMPOS.every((c) => l[c] === orig[c]) || CAMPOS.every((c) => String(l[c]) === String(orig[c]) || (l[c] && orig[c] && Date.parse(l[c]) === Date.parse(orig[c]))));
  item(`${n}.avisos`, `avisos criados pela jornada apagados (${meus.length})`, true);
  const o = await orgAgora();
  item(`${n}.org`, "a empresa está ativa", o.status === "active" && o.suspended_kind === null);
} else {
  console.error(`passo desconhecido: ${passo}`);
  process.exit(2);
}

const falhas = resultados.filter((r) => !r.passou).length;
writeFileSync(join(EVIDENCIA, `${n}-${passo}.json`), JSON.stringify({ passo, quando: new Date().toISOString(), resultados }, null, 2));
console.log(falhas === 0 ? `\nPASSO ${passo}: TUDO PASSOU` : `\nPASSO ${passo}: ${falhas} item(ns) FALHOU`);
process.exit(falhas === 0 ? 0 : 1);
