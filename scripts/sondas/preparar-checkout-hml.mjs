#!/usr/bin/env node
// Mudança 003 - prova do `externalReference` na HOMOLOGAÇÃO: refaz o passo "abrir o checkout".
/* eslint-disable no-console */
// Entra como o dono da organização de teste na marca de teste, abre o hub de conta suspensa e a
// nossa rota /cobranca/iniciar, confere o aviso "Você só será cobrado em DD/MM" (hoje + dias do
// plano), preenche um CPF fictício válido, envia, captura o redirecionamento para o checkout do
// Asaas SANDBOX e NÃO paga. A URL (segredo de sessão curto, vale ~60 min) vai para um arquivo
// fora do repositório; nada de senha, e-mail ou URL é impresso ou gravado no repositório.
//
// Uso: node scripts/sondas/preparar-checkout-hml.mjs
// Variáveis opcionais: TESTE003_ENV (padrão ~/.secrets/teste-003-hml.env),
//   TESTE003_URL_SAIDA (padrão ~/.secrets/teste-003-checkout-url.txt), TESTE003_HOST (padrão marca-a.corretora.io).
import { appendFileSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

import { chromium } from "@playwright/test";

const SEGREDOS = join(homedir(), ".secrets");
const arquivoEnv = process.env.TESTE003_ENV ?? join(SEGREDOS, "teste-003-hml.env");
const arquivoUrl = process.env.TESTE003_URL_SAIDA ?? join(SEGREDOS, "teste-003-checkout-url.txt");
const HOST = process.env.TESTE003_HOST ?? "marca-a.corretora.io";
const DIAS_DO_PLANO = 7;
const EVIDENCIA = join("evidence", "003-billing", "pagamento-hml");

function lerEnv(arquivo) {
  return Object.fromEntries(
    readFileSync(arquivo, "utf8")
      .split(/\r?\n/)
      .filter((l) => l.includes("="))
      .map((l) => [l.slice(0, l.indexOf("=")), l.slice(l.indexOf("=") + 1).trim().replace(/^["']|["']$/g, "")]),
  );
}

/** CPF fictício VÁLIDO (dígitos verificadores), sorteado uma vez e guardado no arquivo de segredos. */
function gerarCpf() {
  const d = Array.from({ length: 9 }, () => Math.floor(Math.random() * 10));
  if (new Set(d).size === 1) d[0] = (d[0] + 1) % 10;
  const dv = (base) => {
    const soma = base.reduce((s, n, i) => s + n * (base.length + 1 - i), 0);
    const r = (soma * 10) % 11;
    return r === 10 ? 0 : r;
  };
  const d1 = dv(d);
  const d2 = dv([...d, d1]);
  return [...d, d1, d2].join("");
}

/** DD/MM de hoje + n dias, no fuso de São Paulo (o mesmo da tela). */
function diaMes(n) {
  const alvo = new Date(Date.now() + n * 86_400_000);
  const p = new Intl.DateTimeFormat("pt-BR", { timeZone: "America/Sao_Paulo", day: "2-digit", month: "2-digit" }).format(alvo);
  return p;
}

const cfg = lerEnv(arquivoEnv);
if (!cfg.TESTE003_EMAIL || !cfg.TESTE003_PASSWORD) throw new Error("Faltam TESTE003_EMAIL/TESTE003_PASSWORD no arquivo de segredos.");
if (!cfg.TESTE003_CPF) {
  cfg.TESTE003_CPF = gerarCpf();
  appendFileSync(arquivoEnv, `\nTESTE003_CPF=${cfg.TESTE003_CPF}\n`);
}
mkdirSync(EVIDENCIA, { recursive: true });

const navegador = await chromium.launch();
try {
  const ctx = await navegador.newContext({ viewport: { width: 1100, height: 800 } });
  const p = await ctx.newPage();
  const base = `https://${HOST}`;
  const foto = async (nome, mascaras = []) =>
    p.screenshot({ path: join(EVIDENCIA, nome), fullPage: true, mask: mascaras, maskColor: "#888888" });

  await p.goto(`${base}/login`);
  await p.fill("input[type=email]", cfg.TESTE003_EMAIL);
  await p.fill("input[type=password]", cfg.TESTE003_PASSWORD);
  await p.click("button[type=submit]");
  await p.waitForURL((u) => !u.pathname.startsWith("/login"), { timeout: 30_000 });

  // 1. /app de organização suspensa por cobrança cai no hub.
  await p.goto(`${base}/app`);
  await p.waitForURL(/account-suspended/, { timeout: 30_000 });
  await p.waitForLoadState("networkidle");
  const mascaraEmail = p.getByText(/@exemplo-003\.invalid/);
  await foto("01-hub-conta-suspensa.png", [mascaraEmail, p.locator("input")]);

  // 2. A rota nossa: aviso com a data da primeira cobrança e pedido de CPF/CNPJ.
  await p.goto(`${base}/cobranca/iniciar`);
  await p.waitForLoadState("networkidle");
  const texto = await p.innerText("body");
  const esperado = diaMes(DIAS_DO_PLANO);
  if (!texto.includes(`Você só será cobrado em ${esperado}`)) {
    throw new Error(`A tela não diz "Você só será cobrado em ${esperado}".`);
  }
  const campo = p.locator('input[name="documento"]');
  // Só a PRIMEIRA vez pede o documento; depois dele registrado a tela segue direto para o cartão.
  const pediuDocumento = (await campo.count()) > 0;
  await foto("02-iniciar-aviso-e-documento.png", [mascaraEmail]);
  if (pediuDocumento) {
    await campo.fill(cfg.TESTE003_CPF);
    await foto("03-iniciar-documento-preenchido.png", [campo, mascaraEmail]);
  }

  // 3. Envia o formulário. ACHADO DA HOMOLOGAÇÃO: o navegador (Chrome) BLOQUEIA o 303 para o Asaas porque a
  // página de aviso declara `form-action 'self'` (lib/billing-trial/pagina.ts) e a CSP vale também
  // para o redirecionamento do formulário. O script registra o bloqueio e captura o destino pelo mesmo POST
  // enviado sem seguir o redirecionamento (cookie da sessão, mesma origem).
  let bloqueadoPelaCsp = false;
  p.on("console", (m) => {
    if (/form-action/.test(m.text())) bloqueadoPelaCsp = true;
  });
  await p.click("button[type=submit]");
  await p.waitForTimeout(2500);
  await foto("04-iniciar-apos-clicar.png", [mascaraEmail]);
  if (bloqueadoPelaCsp) console.error("AVISO: o navegador bloqueou o redirecionamento ao Asaas (CSP form-action 'self').");
  const resposta = await ctx.request.post(`${base}/cobranca/iniciar`, {
    form: pediuDocumento ? { documento: cfg.TESTE003_CPF } : {},
    maxRedirects: 0,
    headers: { origin: base },
  });
  const destino = resposta.headers().location ?? null;
  if (resposta.status() !== 303 || !destino || !/^https:\/\/[^/]*asaas\.com\//.test(destino)) {
    throw new Error(`Não houve redirecionamento ao checkout do Asaas (status ${resposta.status()}).`);
  }
  writeFileSync(arquivoUrl, `${destino}\n`);
  console.log(`URL salva em ${arquivoUrl}`);
} finally {
  await navegador.close();
}
