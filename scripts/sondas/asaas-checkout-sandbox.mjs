#!/usr/bin/env node
// Sonda da mudança 003 (T-001): prova no SANDBOX do Asaas o que o Checkout hospedado aceita.
// Uso: node scripts/sondas/asaas-checkout-sandbox.mjs [--navegador] [--campos-extras] [--saida=<arquivo.json>]
// A chave é lida de ASAAS_SANDBOX_ENV (padrão: ~/.secrets/asaas-sandbox.env) em tempo de execução.
// Nada de chave, token ou link completo é impresso ou gravado: tudo passa por mascarar().
import { readFileSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { randomBytes } from "node:crypto";

const BASE = "https://api-sandbox.asaas.com/v3";
const arquivoChave = process.env.ASAAS_SANDBOX_ENV ?? join(homedir(), ".secrets", "asaas-sandbox.env");
const comNavegador = process.argv.includes("--navegador");
const saida = (process.argv.find((a) => a.startsWith("--saida=")) ?? "").slice(8);

const linha = readFileSync(arquivoChave, "utf8")
  .split(/\r?\n/)
  .find((l) => l.startsWith("ASAAS_API_KEY="));
const CHAVE = (linha ?? "").slice("ASAAS_API_KEY=".length).trim().replace(/^["']|["']$/g, "");
if (!CHAVE.startsWith("$aact_hmlg_")) {
  console.error("Abortado: a chave não é de sandbox ($aact_hmlg_).");
  process.exit(2);
}

function mascarar(v) {
  let s = typeof v === "string" ? v : JSON.stringify(v);
  s = s.split(CHAVE).join("[CHAVE]");
  s = s.replace(/\$aact_[A-Za-z0-9_=+/.-]+/g, "[CHAVE]");
  s = s.replace(/(checkoutSession\/show\?id=)[^"&\s]+/g, "$1[ID]");
  s = s.replace(/\b(cus|sub|pay|chk|whk|inv)_[A-Za-z0-9]{6,}/g, (_m, p) => `${p}_***`);
  s = s.replace(/("(?:authToken|accessToken)"\s*:\s*)"[^"]*"/g, '$1"[TOKEN]"');
  // ids soltos (uuid) de checkout/webhook
  s = s.replace(/\b[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\b/g, "[UUID]");
  return s;
}
const relato = [];
const log = (passo, dado) => {
  const txt = mascarar(dado);
  relato.push({ passo, dado: txt });
  // eslint-disable-next-line no-console
  console.log(`[${passo}] ${txt.slice(0, 900)}`);
};

async function api(metodo, caminho, corpo) {
  const url = new URL(BASE + caminho);
  if (url.host !== "api-sandbox.asaas.com") throw new Error("host recusado");
  const r = await fetch(url, {
    method: metodo,
    headers: { access_token: CHAVE, "content-type": "application/json", "User-Agent": "sonda-003-sandbox" },
    body: corpo ? JSON.stringify(corpo) : undefined,
  });
  let j = null;
  try {
    j = await r.json();
  } catch {
    /* sem corpo */
  }
  return { status: r.status, corpo: j };
}

const hoje = new Date();
const somaDias = (n) => {
  const d = new Date(hoje);
  d.setUTCDate(d.getUTCDate() + n);
  return d;
};
const ymd = (d) => d.toISOString().slice(0, 10);
const criados = { checkouts: [], webhooks: [] };

async function checkout(ciclo, nextDue, extra = {}) {
  const corpo = {
    billingTypes: ["CREDIT_CARD"],
    chargeTypes: ["RECURRENT"],
    minutesToExpire: 60,
    callback: {
      successUrl: "https://example.invalid/cobranca/volta?ok=1",
      cancelUrl: "https://example.invalid/cobranca/volta?cancelado=1",
      expiredUrl: "https://example.invalid/cobranca/volta?expirado=1",
    },
    items: [{ name: "Plano sonda 003", description: "Sonda de sandbox", quantity: 1, value: 49.9 }],
    subscription: { cycle: ciclo, nextDueDate: `${ymd(nextDue)} 00:00:00` },
    ...extra,
  };
  const r = await api("POST", "/checkouts", corpo);
  if (r.corpo?.id) criados.checkouts.push(r.corpo.id);
  return { corpo, r };
}

/** CPF fictício VÁLIDO (dígitos verificadores calculados), aleatório. */
function cpfFicticio() {
  const n = Array.from({ length: 9 }, () => Math.floor(Math.random() * 10));
  if (n.every((d) => d === n[0])) n[8] = (n[8] + 1) % 10;
  const dv = (base) => {
    const soma = base.reduce((t, d, i) => t + d * (base.length + 1 - i), 0);
    const r = (soma * 10) % 11;
    return r === 10 ? 0 : r;
  };
  const d1 = dv(n);
  const d2 = dv([...n, d1]);
  return [...n, d1, d2].join("");
}

/** Prova `customer` e `externalReference` no POST /checkouts (sem pagamento) e limpa tudo. */
async function camposExtras() {
  const cli = await api("POST", "/customers", {
    name: "Cliente Sonda Ficticio",
    cpfCnpj: cpfFicticio(),
    email: "sonda-003@example.invalid",
    notificationDisabled: true,
  });
  log("cliente-criar", { status: cli.status, tem_id: Boolean(cli.corpo?.id), erro: cli.corpo?.errors });
  const clienteId = cli.corpo?.id;
  const orgFicticia = crypto.randomUUID();
  const prazo = somaDias(7);
  try {
    if (clienteId) {
      const com = await checkout("MONTHLY", prazo, { customer: clienteId, externalReference: orgFicticia });
      log("checkout-com-customer-e-externalReference", {
        status: com.r.status,
        devolveu_customer: com.r.corpo?.customer === clienteId ? "igual ao enviado" : com.r.corpo?.customer ?? null,
        devolveu_externalReference: com.r.corpo?.externalReference === orgFicticia ? "igual ao enviado" : com.r.corpo?.externalReference ?? null,
        chaves_da_resposta: Object.keys(com.r.corpo ?? {}),
        erro: com.r.corpo?.errors,
      });
      const so = await checkout("MONTHLY", prazo, { customer: clienteId });
      log("checkout-so-customer", { status: so.r.status, devolveu_customer: so.r.corpo?.customer === clienteId ? "igual ao enviado" : so.r.corpo?.customer ?? null, erro: so.r.corpo?.errors });
      const ref = await checkout("MONTHLY", prazo, { externalReference: orgFicticia });
      log("checkout-so-externalReference", { status: ref.r.status, devolveu_externalReference: ref.r.corpo?.externalReference === orgFicticia ? "igual ao enviado" : ref.r.corpo?.externalReference ?? null, erro: ref.r.corpo?.errors });
    }
    const sem = await checkout("MONTHLY", prazo);
    log("checkout-sem-customer-sem-externalReference", {
      status: sem.r.status,
      devolveu_customer: sem.r.corpo?.customer ?? null,
      devolveu_externalReference: sem.r.corpo?.externalReference ?? null,
      chaves_da_resposta: Object.keys(sem.r.corpo ?? {}),
      erro: sem.r.corpo?.errors,
    });
  } finally {
    for (const id of criados.checkouts.splice(0)) log("camp-cancelar-checkout", { status: (await api("POST", `/checkouts/${id}/cancel`)).status });
    if (clienteId) log("camp-apagar-cliente", { status: (await api("DELETE", `/customers/${clienteId}`)).status });
    const c = await api("GET", "/customers?limit=100");
    log("camp-sobra-clientes", { total: c.corpo?.totalCount, nomes_sonda: (c.corpo?.data ?? []).filter((x) => x.name === "Cliente Sonda Ficticio").length });
  }
}

async function main() {
  if (process.argv.includes("--campos-extras")) {
    await camposExtras();
    return;
  }
  const conta = await api("GET", "/myAccount/commercialInfo");
  log("conta", { status: conta.status });

  const prazo = somaDias(7);
  for (const ciclo of ["MONTHLY", "YEARLY"]) {
    const { corpo, r } = await checkout(ciclo, prazo);
    log(`checkout-${ciclo}`, { enviado: { ...corpo, callback: "(https example.invalid)" }, status: r.status, resposta: r.corpo });
    if (r.corpo?.id) {
      const g = await api("GET", `/checkouts/${r.corpo.id}`);
      log(`checkout-${ciclo}-leitura`, { status: g.status, resposta: g.corpo });
    }
  }
  const passado = await checkout("MONTHLY", somaDias(-1));
  log("checkout-passado", { status: passado.r.status, resposta: passado.r.corpo });
  const tri = await checkout("QUARTERLY", prazo);
  log("checkout-trimestral", { status: tri.r.status, resposta: tri.r.corpo });
  const semCb = await checkout("MONTHLY", prazo, { callback: undefined });
  log("checkout-sem-callback", { status: semCb.r.status, resposta: semCb.r.corpo });
  const cb2 = await checkout("MONTHLY", prazo, {
    callback: { successUrl: "http://example.invalid/x", cancelUrl: "http://example.invalid/y" },
  });
  log("checkout-callback-http", { status: cb2.r.status, resposta: cb2.r.corpo });

  for (const c of ["/fiscalInfo", "/fiscalInfo/municipalOptions", "/subscriptions/sub_inexistente0000/invoiceSettings", "/customerFiscalInfo", "/invoices?limit=1", "/customerAccounts?limit=1", "/subscriptions?limit=1", "/payments?limit=1"]) {
    const r = await api("GET", c);
    log(`nfse-${c}`, { status: r.status, resposta: r.corpo && JSON.stringify(r.corpo).slice(0, 400) });
  }

  const lista = await api("GET", "/webhooks");
  log("webhooks-lista", {
    status: lista.status,
    total: lista.corpo?.totalCount,
    itens: (lista.corpo?.data ?? []).map((w) => ({ name: w.name, events: w.events, sendType: w.sendType, enabled: w.enabled, apiVersion: w.apiVersion })),
  });
  const w = await api("POST", "/webhooks", {
    name: "sonda-003-apagar",
    url: "https://example.com/sonda-003-webhook",
    email: "sonda@example.invalid",
    enabled: false,
    interrupted: false,
    apiVersion: 3,
    authToken: randomBytes(24).toString("hex"),
    sendType: "SEQUENTIALLY",
    events: ["PAYMENT_CONFIRMED", "PAYMENT_OVERDUE", "SUBSCRIPTION_CREATED", "CHECKOUT_PAID"],
  });
  if (w.corpo?.id) criados.webhooks.push(w.corpo.id);
  log("webhook-criar", { status: w.status, resposta: w.corpo });
  const wCurto = await api("POST", "/webhooks", {
    name: "sonda-003-token-curto",
    url: "https://example.com/sonda-003-webhook",
    enabled: false,
    apiVersion: 3,
    authToken: "curto",
    sendType: "SEQUENTIALLY",
    events: ["PAYMENT_CONFIRMED"],
  });
  if (wCurto.corpo?.id) criados.webhooks.push(wCurto.corpo.id);
  log("webhook-token-curto", { status: wCurto.status, resposta: wCurto.corpo });

  if (comNavegador) await navegador();
}

async function navegador() {
  const { chromium } = await import("@playwright/test");
  const { r } = await checkout("MONTHLY", somaDias(7));
  const link = r.corpo?.link;
  if (!link) {
    log("navegador", "sem link");
    return;
  }
  const b = await chromium.launch();
  const p = await b.newPage();
  try {
    await p.goto(link, { waitUntil: "networkidle" });
    // A página tem o nome do titular da conta: a imagem só vai para onde SONDA_PRINT mandar (nunca para o repo).
    if (process.env.SONDA_PRINT) await p.screenshot({ path: process.env.SONDA_PRINT, fullPage: true });
    log("navegador-pagina", { abriu: p.url().startsWith("https://sandbox.asaas.com/"), campos: "e-mail, nome, CPF/CNPJ, celular, endereço (CEP, número), cartão (número, nome, validade, CVV); reCAPTCHA Enterprise barra o envio automatizado" });
  } catch (e) {
    log("navegador-erro", String(e).slice(0, 300));
  }
  await b.close();
}

async function limpar() {
  for (const id of criados.checkouts) log("remover-checkout", { status: (await api("POST", `/checkouts/${id}/cancel`)).status });
  for (const id of criados.webhooks) log("remover-webhook", { status: (await api("DELETE", `/webhooks/${id}`)).status });
  const w = await api("GET", "/webhooks");
  log("sobra-webhooks", { total: w.corpo?.totalCount, nomes: (w.corpo?.data ?? []).map((x) => x.name) });
}

if (process.argv.includes("--link-manual")) {
  // Passo humano: o reCAPTCHA da página hospedada barra automação. Imprime o link (sandbox, vale 60 min) só no terminal.
  const { r } = await checkout("MONTHLY", somaDias(7));
  // eslint-disable-next-line no-console
  console.log(r.corpo?.link ?? `falhou: ${mascarar(r.corpo)}`);
  process.exit(0);
}

try {
  await main();
} catch (e) {
  log("erro", String(e).slice(0, 300));
} finally {
  await limpar();
  if (saida) writeFileSync(saida, mascarar(JSON.stringify(relato, null, 2)));
}
