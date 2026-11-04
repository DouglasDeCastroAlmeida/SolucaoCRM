#!/usr/bin/env node
// Mudança 005 (T-044, AC-009.3): jornada do canal de e-mail na HOMOLOGAÇÃO, provada PELA TELA,
// com servidor de e-mail REAL (o de teste da VPS). O navegador (Playwright) entra como o dono da
// organização de teste; o "cliente" externo (EMAIL2) manda e-mail de verdade por SMTP e confere o
// que recebe por IMAP. O banco da hml só é LIDO (filtro por organization_id) para conferir.
// Segredos ficam em ~/.secrets e nunca são impressos: e-mails saem mascarados, senhas nunca.
//
// Passos (um por chamada; o estado entre eles fica em ~/.secrets/jornada-005-estado.json):
//   base       confere versão da hml e prepara o e-mail ANTIGO (anterior à conexão)
//   conectar   assistente: Outro provedor, Testar, Conectar; nada antigo importado (AC-001.*)
//   receber    EMAIL2 escreve; conversa no Inbox; anexo baixa; HTML sob demanda (AC-002.*, 008.5, 004.*)
//   ignorar    automáticos: remetente novo ignorado; conhecido não; lista; promover; não é cliente (AC-003.*)
//   responder  resposta pelo Composer; EMAIL2 confere Re:, In-Reply-To, References, assinatura (AC-004.*)
//   pausar     pausar, e-mail durante a pausa não é lido, retomar não perde nem repete (AC-008.2)
//   senha      Configurar com senha errada recusa sem salvar (AC-001.4)
//   teto       teto 1, duas respostas, a 2ª na fila com aviso; restaura (AC-005.*)
//   limpar     remove a caixa de teste pelo caminho do produto e mede resíduos
// Uso: node scripts/sondas/jornada-email-hml.mjs <passo>
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

import { chromium } from "@playwright/test";
import { ImapFlow } from "imapflow";
import nodemailer from "nodemailer";

const SEGREDOS = join(homedir(), ".secrets");
const HOST = process.env.TESTE003_HOST ?? "marca-a.corretora.io";
const BASE = `https://${HOST}`;
const NOME_DA_ORG = "[teste-003] Empresa Exemplo";
const EVIDENCIA = join("evidence", "005-email", "jornada-hml");
const ESTADO = join(SEGREDOS, "jornada-005-estado.json");

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
const em = lerEnv(join(SEGREDOS, "email-teste-vps.env"));
const DOMINIO = em.EMAIL2.split("@")[1];
const cab = { apikey: sb.SUPABASE_SERVICE_ROLE_KEY, authorization: `Bearer ${sb.SUPABASE_SERVICE_ROLE_KEY}`, "content-type": "application/json" };

/** LEITURA no banco da hml, sempre com filtro de organização na chamada. */
async function ler(caminho) {
  const r = await fetch(`${sb.SUPABASE_URL}/rest/v1/${caminho}`, { headers: cab });
  if (!r.ok) throw new Error(`banco GET ${caminho.split("?")[0]} -> ${r.status}`);
  return r.json();
}

const mascara = (s) => String(s).replace(/[\w.+-]+@[\w-]+\.[\w.-]+/g, "***@***");
const resultados = [];
function item(id, descricao, passou, detalhe = "") {
  resultados.push({ id, descricao, resultado: passou === null ? "NAO_MEDIDO" : passou ? "PASSOU" : "FALHOU", detalhe: mascara(detalhe) });
  console.log(`${passou === null ? "NAO MEDIDO" : passou ? "PASSOU" : "FALHOU"}  ${id} ${descricao}${detalhe ? ` (${mascara(detalhe)})` : ""}`);
}
const achados = [];
function achado(texto) {
  achados.push(texto);
  console.log(`ACHADO  ${texto}`);
}
const dormir = (ms) => new Promise((r) => setTimeout(r, ms));
const lerEstado = () => (existsSync(ESTADO) ? JSON.parse(readFileSync(ESTADO, "utf8")) : {});
const gravarEstado = (parcial) => writeFileSync(ESTADO, JSON.stringify({ ...lerEstado(), ...parcial }));

const [passo] = process.argv.slice(2);
const SEQ = ["base", "conectar", "receber", "ignorar", "responder", "pausar", "senha", "teto", "limpar"];
if (!SEQ.includes(passo)) {
  console.error(`Uso: node scripts/sondas/jornada-email-hml.mjs <${SEQ.join("|")}>`);
  process.exit(2);
}
const n = String(SEQ.indexOf(passo) + 1).padStart(2, "0");
mkdirSync(EVIDENCIA, { recursive: true });

/* ---------------- servidor de e-mail de teste (cliente externo) ---------------- */
const transporte = () =>
  nodemailer.createTransport({ host: em.EMAIL_HOST, port: Number(em.EMAIL_SMTP_PORT), secure: Number(em.EMAIL_SMTP_PORT) === 465, auth: { user: em.EMAIL2, pass: em.SENHA2 } });

/** O "cliente" manda e-mail de verdade para a caixa do CRM. `de` troca o remetente visível (envelope segue EMAIL2). */
async function enviarDoCliente({ assunto, texto, html, de, headers, anexos }) {
  const info = await transporte().sendMail({
    from: de ?? em.EMAIL2,
    sender: em.EMAIL2,
    to: em.EMAIL1,
    subject: assunto,
    text: texto,
    html,
    headers,
    attachments: anexos,
  });
  return info.messageId;
}

/** Abre uma caixa (IMAP) como a dona informada e roda `fn`. */
async function comImap(usuario, senha, fn) {
  const c = new ImapFlow({ host: em.EMAIL_HOST, port: Number(em.EMAIL_IMAP_PORT), secure: Number(em.EMAIL_IMAP_PORT) === 993, auth: { user: usuario, pass: senha }, logger: false });
  await c.connect();
  try {
    await c.mailboxOpen("INBOX");
    return await fn(c);
  } finally {
    await c.logout().catch(() => {});
  }
}

/** Espera chegar na caixa do CLIENTE um e-mail cujo assunto contém `trecho`; devolve cabeçalhos e corpo. */
async function esperarNoCliente(trecho, ms = 240_000) {
  const limite = Date.now() + ms;
  while (Date.now() < limite) {
    const achou = await comImap(em.EMAIL2, em.SENHA2, async (c) => {
      const uids = await c.search({ subject: trecho }, { uid: true });
      if (!uids.length) return null;
      const msg = await c.fetchOne(String(uids[uids.length - 1]), { source: true, envelope: true }, { uid: true });
      return { fonte: msg.source.toString("utf8"), assunto: msg.envelope.subject };
    });
    if (achou) return achou;
    await dormir(10_000);
  }
  return null;
}
const cabecalho = (fonte, nome) => {
  const topo = fonte.split(/\r?\n\r?\n/)[0].replace(/\r?\n[ \t]+/g, " ");
  const m = topo.match(new RegExp(`^${nome}:\\s*(.*)$`, "im"));
  return m ? m[1].trim() : null;
};

/* ---------------- navegador ---------------- */
async function entrar(p) {
  for (let t = 1; t <= 3; t++) {
    try {
      await p.goto(`${BASE}/login`, { timeout: 60_000 });
      await p.waitForLoadState("networkidle");
      await p.fill("input[type=email]", conta.TESTE003_EMAIL);
      await p.fill("input[type=password]", conta.TESTE003_PASSWORD);
      await p.click("button[type=submit]");
      await p.waitForURL((u) => !u.pathname.startsWith("/login"), { timeout: 45_000 });
      return;
    } catch (e) {
      if (t === 3) throw e;
    }
  }
}

async function irPara(p, caminho) {
  for (let t = 1; t <= 3; t++) {
    try {
      await p.goto(`${BASE}${caminho}`, { timeout: 60_000 });
      await p.waitForLoadState("networkidle", { timeout: 45_000 });
      return;
    } catch (e) {
      if (t === 3) throw e;
    }
  }
}

let seqFoto = 0;
/** Foto de página inteira (e-mails e campos mascarados) + medidas por ferramenta. Não navega: fotografa onde a página está. */
async function foto(p, nome, { medir = true } = {}) {
  seqFoto += 1;
  const arquivo = join(EVIDENCIA, `${n}-${passo}-${String(seqFoto).padStart(2, "0")}-${nome}.png`);
  await p.screenshot({ path: arquivo, fullPage: true, mask: [p.getByText(/[\w.+-]+@[\w-]+\.[\w.-]+/), p.locator("input, textarea")], maskColor: "#888888" });
  if (medir) {
    const m = await p.evaluate(() => {
      const w = window.innerWidth;
      const fora = [...document.querySelectorAll("button, a, [role=status]")].filter((e) => {
        const r = e.getBoundingClientRect();
        return r.width > 0 && r.height > 0 && (r.left < -1 || r.right > w + 1);
      }).length;
      return { larguraDaJanela: w, larguraDoConteudo: document.documentElement.scrollWidth, elementosForaDaJanela: fora };
    });
    item(`${n}.${nome}.medida`, `tela "${nome}" sem rolagem lateral e sem botão fora da janela`, m.larguraDoConteudo <= m.larguraDaJanela + 1 && m.elementosForaDaJanela === 0, JSON.stringify(m));
  }
  return arquivo;
}

async function comNavegador(fn) {
  const nav = await chromium.launch();
  try {
    const ctx = await nav.newContext({ viewport: { width: 1280, height: 900 }, acceptDownloads: true });
    const p = await ctx.newPage();
    p.setDefaultTimeout(30_000);
    await entrar(p);
    return await fn(p);
  } finally {
    await nav.close();
  }
}

/* ---------------- organização de teste ---------------- */
const orgs = await ler(`organizations?select=id,status&display_name=eq.${encodeURIComponent(NOME_DA_ORG)}`);
if (orgs.length !== 1) throw new Error("organização de teste não encontrada (ou ambígua)");
const orgId = orgs[0].id;
/** ESCRITA só na linha da organização de teste (onboarding), como a jornada da cobrança faz; desfeita em `limpar`. */
async function patchOrg(corpo) {
  const r = await fetch(`${sb.SUPABASE_URL}/rest/v1/organizations?id=eq.${orgId}`, { method: "PATCH", headers: { ...cab, prefer: "return=minimal" }, body: JSON.stringify(corpo) });
  if (!r.ok) throw new Error(`banco PATCH organizations -> ${r.status}`);
}
// O portão de /app manda quem não terminou o onboarding para ele; sem isto nenhuma tela de /app abre.
if (passo !== "base" && lerEstado().onboardedOriginal === undefined) {
  const [o] = await ler(`organizations?select=onboarded_at&id=eq.${orgId}`);
  gravarEstado({ onboardedOriginal: o.onboarded_at });
  if (o.onboarded_at === null) await patchOrg({ onboarded_at: new Date().toISOString() });
}
const caixasDoBanco = () => ler(`channel_sessions?select=id,status,display_name,provider,created_at,metadata&organization_id=eq.${orgId}&provider=eq.email`);
const mensagensDoBanco = (conversaId) =>
  ler(`messages?select=id,direction,status,body,metadata,created_at&organization_id=eq.${orgId}&conversation_id=eq.${conversaId}&order=created_at.asc`);

/** Abre /app/connections?aba=email e devolve o cartão da caixa (ou null). */
async function abaEmail(p) {
  await irPara(p, "/app/connections?aba=email");
  await p.waitForSelector('[data-testid="canal-email"]', { timeout: 30_000 });
  await dormir(1500);
  return p.locator('[data-testid="caixa-email"]').first();
}

/** Procura a conversa pelo assunto, recarregando o Inbox até aparecer. */
async function acharConversa(p, trecho, ms = 240_000) {
  const limite = Date.now() + ms;
  while (Date.now() < limite) {
    await irPara(p, "/app/inbox");
    const alvo = p.getByText(trecho).first();
    if (await alvo.count()) {
      await alvo.click();
      await p.waitForSelector('textarea[aria-label="Mensagem"], [data-testid="email-assunto"]', { timeout: 30_000 });
      return true;
    }
    await dormir(15_000);
  }
  return false;
}
const textoDoInbox = async (p) => {
  await irPara(p, "/app/inbox");
  await dormir(1500);
  return p.innerText("body");
};

/* ================================ passos ================================ */
if (passo === "base") {
  const h = await (await fetch(`${BASE}/api/v1/health`)).json();
  item("01.versao", "a hml roda o commit c9144c8 (o desta branch)", h.data.version === "c9144c8", `version ${h.data.version}`);
  const raiz = await fetch(`${BASE}/`, { redirect: "manual" });
  const app = await fetch(`${BASE}/app`, { redirect: "manual" });
  item("01.rotas", "/ responde 200 e /app responde 307", raiz.status === 200 && app.status === 307, `${raiz.status}/${app.status}`);
  const caixas = await caixasDoBanco();
  item("01.sem-caixa", "a organização de teste parte sem caixa de e-mail", caixas.length === 0, `${caixas.length} caixa(s)`);
  const tag = `T044-${Date.now().toString(36)}`;
  // O e-mail ANTIGO: chega à caixa ANTES de o CRM conectar. Nada dele pode virar conversa.
  const antigo = `[005] ANTIGO ${tag}`;
  await enviarDoCliente({ assunto: antigo, texto: "Mensagem anterior à conexão. Não pode ser importada." });
  gravarEstado({ tag, antigo, criadaEm: new Date().toISOString() });
  const chegou = await comImap(em.EMAIL1, em.SENHA1, async (c) => {
    for (let i = 0; i < 12; i++) {
      if ((await c.search({ subject: tag }, { uid: true })).length) return true;
      await dormir(5000);
    }
    return false;
  });
  item("01.antigo", "o e-mail ANTIGO está na caixa do servidor antes da conexão", chegou, `assunto marcado ${tag}`);
} else if (passo === "conectar") {
  const est = lerEstado();
  await comNavegador(async (p) => {
    await p.goto(`${BASE}/app/connections`, { timeout: 60_000 });
    await p.waitForLoadState("networkidle");
    await p.getByRole("tab", { name: "E-mail" }).click();
    await p.waitForSelector('[data-testid="assistente-email"]');
    item("02.tab", "Conexões tem a aba E-mail e, sem caixa, o assistente já abre", await p.locator('[data-testid="assistente-email"]').isVisible());
    await foto(p, "aba-vazia");
    // Gmail: servidores preenchidos e passos da senha de app (AC-001.1)
    await p.getByRole("button", { name: "Gmail", exact: true }).click();
    const passosGmail = await p.locator('ol[aria-label="Como criar a senha de app"] li').count();
    item("02.gmail", "escolher Gmail mostra os 3 passos da senha de app e os servidores do Gmail", passosGmail === 3 && (await p.innerText("body")).includes("imap.gmail.com"), `${passosGmail} passos`);
    await foto(p, "gmail");
    // Outro provedor (AC-001.2)
    await p.getByRole("button", { name: "Outro provedor", exact: true }).click();
    await p.fill("#email-endereco", em.EMAIL1);
    await p.fill("#email-senha", em.SENHA1);
    await p.fill("#email-imap-host", em.EMAIL_HOST);
    await p.fill("#email-imap-porta", em.EMAIL_IMAP_PORT);
    await p.fill("#email-smtp-host", em.EMAIL_HOST);
    await p.fill("#email-smtp-porta", em.EMAIL_SMTP_PORT);
    await p.fill("#email-assinatura", "-- Equipe de teste 005");
    const conectarAntes = await p.getByRole("button", { name: "Conectar", exact: true }).isDisabled();
    item("02.conectar-travado", "Conectar fica desabilitado até o Testar (AC-001.3)", conectarAntes);
    await foto(p, "preenchido");
    const t0 = Date.now();
    await p.getByRole("button", { name: "Testar", exact: true }).click();
    const resp = await Promise.race([
      p.locator('[data-testid="assistente-email"] [role=status]', { hasText: "Deu certo" }).waitFor({ timeout: 70_000 }).then(() => "ok"),
      p.locator('[data-testid="assistente-email"] [role=alert]').waitFor({ timeout: 70_000 }).then(() => "erro"),
    ]).catch(() => "tempo");
    const msTeste = Date.now() - t0;
    const textoErro = resp === "erro" ? await p.locator('[data-testid="assistente-email"] [role=alert]').first().innerText() : "";
    item("02.testar", "Testar entra na caixa, envia o e-mail de teste e mostra 'Deu certo'", resp === "ok", `${resp} em ${msTeste} ms ${textoErro}`);
    await foto(p, "testado");
    if (resp !== "ok") return;
    item("02.conectar-liberado", "depois do Testar o botão Conectar é liberado", await p.getByRole("button", { name: "Conectar", exact: true }).isEnabled());
    await p.getByRole("button", { name: "Conectar", exact: true }).click();
    const r2 = await Promise.race([p.waitForSelector('[data-testid="caixa-email"]', { timeout: 60_000 }).then(() => "ok"), p.locator('[data-testid="assistente-email"] [role=alert]').waitFor({ timeout: 60_000 }).then(() => "erro")]).catch(() => "tempo");
    if (r2 !== "ok") {
      const msg = r2 === "erro" ? await p.locator('[data-testid="assistente-email"] [role=alert]').first().innerText() : "";
      await foto(p, "conectar-falhou");
      item("02.conectar", "Conectar grava a caixa e ela aparece em Conexões", false, `${r2} ${msg}`);
      return;
    }
    gravarEstado({ conectadaEm: new Date().toISOString() });
    await dormir(1500);
    const cartao = p.locator('[data-testid="caixa-email"]').first();
    const txt = await cartao.innerText();
    item("02.cartao", "a caixa aparece com endereço, estado Conectada, limites e botão Pausar (AC-001.5)", /Conectada/.test(txt) && /Pausar/.test(txt) && /Limite por dia/.test(txt), txt.replace(/\n/g, " | "));
    item("02.senha-nao-volta", "a senha não aparece no cartão (só ••••últimos4)", !txt.includes(em.SENHA1) && /••••/.test(txt));
    await foto(p, "cartao");
    const caixas = await caixasDoBanco();
    gravarEstado({ caixaId: caixas[0]?.id ?? null });
    item("02.banco", "existe 1 linha de caixa de e-mail na organização", caixas.length === 1, `status ${caixas[0]?.status}`);
    // Nada do passado: espera 2 rodadas do cron (1/min) e confere o Inbox.
    console.log("(esperando 2,5 min por rodadas do cron da hml para provar que o antigo não é importado)");
    await dormir(150_000);
    const inbox = await textoDoInbox(p);
    item("02.sem-antigo", "o e-mail ANTIGO não virou conversa depois das rodadas do cron (AC-001.5)", !inbox.includes(est.antigo), "assunto antigo ausente do Inbox");
    await foto(p, "inbox-sem-antigo");
  });
} else if (passo === "receber") {
  const est = lerEstado();
  const assunto = `[005] Pergunta de preço ${est.tag}`;
  const msgId = await enviarDoCliente({
    assunto,
    texto: "Olá, quanto custa o plano mensal? Tenho interesse em contratar.",
    html: '<div><h2 style="color:red">Olá!</h2><p>Quanto custa o <b>plano mensal</b>?</p><script>alert(1)</script><img src="https://exemplo.invalid/rastreio.gif"></div>',
    anexos: [{ filename: "tabela-de-precos.txt", content: "Plano Basico: 100\nPlano Pro: 200\n" }],
  });
  gravarEstado({ assuntoPergunta: assunto, msgIdPergunta: msgId, enviadaPerguntaEm: new Date().toISOString() });
  const t0 = Date.now();
  await comNavegador(async (p) => {
    const achou = await acharConversa(p, assunto);
    const demora = Math.round((Date.now() - t0) / 1000);
    item("03.conversa", "o e-mail virou conversa no Inbox (pelo cron real da hml)", achou, `apareceu em ${demora} s`);
    if (!achou) return;
    gravarEstado({ conversaUrl: new URL(p.url()).pathname });
    await dormir(2000);
    const corpo = await p.innerText("body");
    item("03.assunto-texto", "a conversa mostra o assunto e o texto do e-mail", corpo.includes(assunto) && corpo.includes("quanto custa o plano mensal"));
    const canal = await p.evaluate(() => [...document.querySelectorAll("[aria-label],[title]")].map((e) => (e.getAttribute("aria-label") ?? "") + (e.getAttribute("title") ?? "")).filter((s) => /e-?mail/i.test(s)).slice(0, 4));
    item("03.canal-email", "o cabeçalho/lista identifica o canal E-mail", canal.length > 0 || /e-?mail/i.test(corpo), JSON.stringify(canal));
    const semAudio = (await p.getByRole("button", { name: /gravar áudio|áudio|audio/i }).count()) === 0;
    item("03.sem-audio", "o Composer não oferece áudio nem recibo de leitura (AC-008.5)", semAudio && !/lida|visto|✓✓/.test(await p.locator("[data-testid=email-assunto]").first().evaluate((e) => e.closest("div")?.parentElement?.innerText ?? "")));
    const f1 = await foto(p, "conversa-de-email");
    gravarEstado({ fotoConversa: f1 });
    // HTML limpo sob demanda
    const verHtml = p.getByRole("button", { name: "Ver com formatação" }).first();
    item("03.btn-html", "o botão 'Ver com formatação' existe e o HTML não é carregado antes do clique", (await verHtml.count()) === 1 && (await p.locator('[data-testid="email-html"]').count()) === 0);
    if (await verHtml.count()) {
      await verHtml.click();
      const iframe = p.locator('[data-testid="email-html"]');
      await iframe.waitFor({ timeout: 15_000 });
      const sandbox = await iframe.getAttribute("sandbox");
      const srcdoc = (await iframe.getAttribute("srcdoc")) ?? "";
      item("03.html-limpo", "o HTML aparece num iframe sandbox='' sem script nem imagem remota", sandbox === "" && !/<script/i.test(srcdoc) && !/exemplo\.invalid/.test(srcdoc), `sandbox="${sandbox}", script ${/<script/i.test(srcdoc)}, img remota ${/exemplo\.invalid/.test(srcdoc)}`);
      await foto(p, "html-sob-demanda");
    }
    // Anexo
    const link = p.getByRole("link", { name: /Baixar tabela-de-precos\.txt/ });
    item("03.anexo-link", "o anexo aparece como link de download", (await link.count()) === 1);
    if (await link.count()) {
      const [dl] = await Promise.all([p.waitForEvent("download", { timeout: 30_000 }), link.click()]);
      const caminho = join(EVIDENCIA, `${n}-${passo}-anexo-baixado.txt`);
      await dl.saveAs(caminho);
      const conteudo = readFileSync(caminho, "utf8");
      item("03.anexo-baixa", "o download do anexo traz o conteúdo enviado", conteudo.includes("Plano Pro: 200"), `${dl.suggestedFilename()} ${conteudo.length} bytes`);
    }
    // contato criado
    const conv = est.conversaUrl ?? new URL(p.url()).pathname;
    const id = conv.split("/").pop();
    const c = await ler(`conversations?select=id,contact_id,channel_session_id&organization_id=eq.${orgId}&id=eq.${id}`);
    const contato = c[0] ? await ler(`contacts?select=id,name&organization_id=eq.${orgId}&id=eq.${c[0].contact_id}`) : [];
    item("03.contato", "um contato foi criado/ligado à conversa", contato.length === 1, `contato "${mascara(contato[0]?.name ?? "")}"`);
    if (c[0]) gravarEstado({ conversaId: c[0].id, contatoId: c[0].contact_id });
  });
} else if (passo === "ignorar") {
  const est = lerEstado();
  const alias = `no-reply-t044@${DOMINIO}`;
  const aliasCliente = `maria.t044@${DOMINIO}`;
  const assuntoLista = `[005] Newsletter de promoção ${est.tag}`;
  const assuntoConhecido = `[005] Aviso do conhecido ${est.tag}`;
  const assuntoNaoCliente = `[005] Proposta de parceria ${est.tag}`;
  const assuntoDepois = `[005] Segundo e-mail do mesmo ${est.tag}`;
  // 1) remetente NOVO, e-mail de lista de inscrição / em massa
  await enviarDoCliente({
    assunto: assuntoLista,
    texto: "Cancelar inscrição: https://exemplo.invalid/sair",
    de: `Promo T044 <${alias}>`,
    headers: { "List-Unsubscribe": "<mailto:sair@exemplo.invalid>", Precedence: "bulk" },
  });
  // 2) remetente NOVO com resposta automática
  await enviarDoCliente({ assunto: `[005] Resposta automática ${est.tag}`, texto: "Estou fora do escritório.", de: `Fora T044 <fora.t044@${DOMINIO}>`, headers: { "Auto-Submitted": "auto-generated" } });
  // 3) CONHECIDO (EMAIL2 já é contato) mandando algo que parece automático: AC-003.5
  await enviarDoCliente({ assunto: assuntoConhecido, texto: "Sou eu de novo, o cliente da conversa.", headers: { "Auto-Submitted": "auto-generated", Precedence: "bulk" } });
  gravarEstado({ assuntoConhecido, assuntoLista, aliasCliente, alias });
  await comNavegador(async (p) => {
    console.log("(esperando o cron da hml ler os 3 e-mails)");
    const conhecido = await acharConversa(p, assuntoConhecido);
    item("04.conhecido", "contato conhecido nunca é ignorado: o automático dele vira conversa (AC-003.5)", conhecido);
    await dormir(70_000); // uma rodada a mais para dar tempo dos outros dois, que NÃO devem aparecer
    const inbox = await textoDoInbox(p);
    item("04.lista-ignorada", "e-mail de lista/em massa de remetente novo NÃO virou conversa (AC-003.1)", !inbox.includes(assuntoLista));
    item("04.auto-ignorada", "resposta automática de remetente novo NÃO virou conversa (AC-003.1)", !inbox.includes(`Resposta automática ${est.tag}`));
    await foto(p, "inbox-sem-os-ignorados");
    // Lista de ignorados: pela TELA (AC-003.3). Procura qualquer porta na navegação.
    const rotas = ["/app/connections?aba=email", "/app/inbox", "/app/settings", "/app/settings/channels"];
    let telaEncontrada = false;
    for (const r of rotas) {
      await irPara(p, r);
      if (/ignorad/i.test(await p.innerText("body"))) telaEncontrada = true;
    }
    item("04.tela-ignorados", "existe tela com a lista de ignorados (remetente, assunto, data, motivo) (AC-003.3)", telaEncontrada, telaEncontrada ? "texto 'ignorad' encontrado" : "nenhuma tela das rotas de Conexões/Inbox/Configurações menciona 'ignorados'");
    // O backend: lido a partir da sessão do navegador (diagnóstico, não prova de UX)
    const api = await p.evaluate(async () => {
      const r = await fetch("/api/v1/channels/email/ignorados", { credentials: "include" });
      return { status: r.status, json: await r.json() };
    });
    const lista = api.json?.data?.ignorados ?? [];
    const doLista = lista.find((x) => (x.assunto ?? x.subject ?? "").includes(assuntoLista));
    item("04.api-ignorados", "(API, diagnóstico) a lista de ignorados do servidor traz o e-mail de lista com motivo", Boolean(doLista), `status ${api.status}, ${lista.length} ignorado(s), campos ${doLista ? Object.keys(doLista).join(",") : "-"}, motivo ${doLista ? JSON.stringify(doLista.motivo ?? doLista.reason ?? null) : "-"}`);
    writeFileSync(join(EVIDENCIA, `${n}-ignorados-api.json`), JSON.stringify({ status: api.status, quantidade: lista.length, campos: doLista ? Object.keys(doLista) : [], motivo: doLista?.motivo ?? doLista?.reason ?? null }, null, 2));
    // Promover (API)
    if (doLista) {
      const prom = await p.evaluate(async (id) => {
        const r = await fetch(`/api/v1/channels/email/ignorados/${id}/promover`, { method: "POST", credentials: "include", headers: { "content-type": "application/json" }, body: "{}" });
        return { status: r.status, corpo: (await r.text()).slice(0, 200) };
      }, doLista.id);
      item("04.api-promover", "(API, diagnóstico) promover o ignorado o transforma em conversa", prom.status < 300, `status ${prom.status} ${prom.corpo}`);
      if (prom.status < 300) {
        const viu = await acharConversa(p, assuntoLista, 150_000);
        item("04.promovido-na-tela", "o promovido aparece no Inbox", viu);
        await foto(p, "promovido");
        // "Não é cliente" sobre o remetente promovido
        const nc = await p.evaluate(async (endereco) => {
          const r = await fetch("/api/v1/channels/email/remetentes", { method: "POST", credentials: "include", headers: { "content-type": "application/json" }, body: JSON.stringify({ endereco }) });
          return { status: r.status, corpo: (await r.text()).slice(0, 200) };
        }, alias);
        item("04.api-nao-cliente", "(API, diagnóstico) 'não é cliente' aceita o remetente", nc.status < 300, `status ${nc.status} ${nc.corpo}`);
        await enviarDoCliente({ assunto: assuntoDepois, texto: "Mais uma mensagem do mesmo remetente.", de: `Promo T044 <${alias}>` });
        await dormir(150_000);
        const depois = await textoDoInbox(p);
        item("04.nao-cliente-vale", "o próximo e-mail do remetente marcado 'não é cliente' NÃO vira conversa (AC-003.4)", !depois.includes(assuntoDepois));
        await foto(p, "apos-nao-cliente");
      }
    }
    // Sem botão na tela?
    await acharConversa(p, assuntoConhecido, 60_000);
    const botoes = await p.getByRole("button", { name: /não é cliente|nao e cliente|promover/i }).count();
    item("04.btn-nao-cliente", "a conversa de e-mail oferece 'Não é cliente' na tela (AC-003.4)", botoes > 0, `${botoes} botão(ões) encontrados`);
  });
} else if (passo === "responder") {
  const est = lerEstado();
  const resposta = `Resposta T044 ${est.tag}: o plano mensal custa 200 reais.`;
  await comNavegador(async (p) => {
    const abriu = await acharConversa(p, est.assuntoPergunta, 60_000);
    item("05.abrir", "a conversa da pergunta abre", abriu);
    if (!abriu) return;
    const caixa = p.locator('textarea[aria-label="Mensagem"]');
    await caixa.fill(resposta);
    await foto(p, "composer-preenchido");
    await p.getByRole("button", { name: "Enviar" }).click();
    gravarEstado({ respostaEnviadaEm: new Date().toISOString(), resposta });
    await dormir(3000);
    const bolha = await p.innerText("body");
    item("05.bolha", "a resposta aparece na conversa depois do Enviar", bolha.includes(`Resposta T044 ${est.tag}`));
    await foto(p, "apos-enviar");
    console.log("(esperando a resposta chegar à caixa do cliente)");
    const t0 = Date.now();
    const rec = await esperarNoCliente(est.tag + "");
    // a caixa do cliente também tem os "Re:"; procura o assunto com Re:
    const re = rec && /^re:/i.test(rec.assunto) ? rec : await esperarNoCliente(`Re: ${est.assuntoPergunta}`, 120_000);
    item("05.chegou", "o cliente RECEBEU a resposta pelo servidor real", Boolean(re), `em ${Math.round((Date.now() - t0) / 1000)} s`);
    if (!re) return;
    const f = re.fonte;
    const assuntoRe = cabecalho(f, "Subject");
    const inReplyTo = cabecalho(f, "In-Reply-To");
    const refs = cabecalho(f, "References");
    item("05.assunto-re", "o assunto começa com Re: e mantém o original", /^re:/i.test(re.assunto) && re.assunto.includes(est.assuntoPergunta), `assunto ${re.assunto?.slice(0, 80)}`);
    item("05.in-reply-to", "In-Reply-To aponta para o Message-ID do e-mail do cliente", Boolean(inReplyTo) && inReplyTo.replace(/[<>]/g, "") === String(est.msgIdPergunta).replace(/[<>]/g, ""), `In-Reply-To ${inReplyTo ? "presente" : "ausente"}`);
    item("05.references", "References contém o Message-ID do e-mail do cliente", Boolean(refs) && refs.includes(String(est.msgIdPergunta).replace(/[<>]/g, "")), `References ${refs ? "presente" : "ausente"}`);
    const corpo = f.split(/\r?\n\r?\n/).slice(1).join("\n\n");
    const decodificado = /quoted-printable/i.test(f) ? corpo.replace(/=\r?\n/g, "").replace(/=([0-9A-F]{2})/g, (_, h) => String.fromCharCode(parseInt(h, 16))) : corpo;
    item("05.texto", "o corpo traz o texto digitado", decodificado.includes(`Resposta T044 ${est.tag}`) || corpo.includes(`Resposta T044 ${est.tag}`));
    item("05.assinatura", "o corpo traz a assinatura da caixa", decodificado.includes("Equipe de teste 005") || corpo.includes("Equipe de teste 005"));
    const recibo = ["Disposition-Notification-To", "Return-Receipt-To", "X-Confirm-Reading-To"].filter((h) => cabecalho(f, h));
    item("05.sem-recibo", "o e-mail enviado não pede recibo de leitura", recibo.length === 0, recibo.join(",") || "nenhum cabeçalho de recibo");
    const dMsg = cabecalho(f, "Message-ID");
    item("05.message-id", "o e-mail enviado tem Message-ID próprio", Boolean(dMsg));
    gravarEstado({ msgIdResposta: dMsg });
    writeFileSync(join(EVIDENCIA, `${n}-cabecalhos-da-resposta.json`), JSON.stringify({ assunto: assuntoRe ? "presente" : null, inReplyTo: inReplyTo ? "presente e conferido" : null, references: refs ? "presente e conferido" : null, recibo }, null, 2));
  });
} else if (passo === "pausar") {
  const est = lerEstado();
  const durante = `[005] Durante a pausa ${est.tag}`;
  await comNavegador(async (p) => {
    let cartao = await abaEmail(p);
    await foto(p, "antes");
    await cartao.getByRole("button", { name: "Pausar", exact: true }).click();
    await p.waitForSelector("text=Pausada", { timeout: 20_000 });
    cartao = p.locator('[data-testid="caixa-email"]').first();
    const txt = await cartao.innerText();
    item("06.pausada", "o cartão mostra 'Pausada' e a explicação (leitura e envio parados, conversas intactas)", /Pausada/.test(txt) && /continua de onde parou/.test(txt) && (await cartao.getByRole("button", { name: "Retomar" }).count()) === 1);
    await foto(p, "pausada");
    const caixas = await caixasDoBanco();
    gravarEstado({ pausadaEm: new Date().toISOString() });
    await enviarDoCliente({ assunto: durante, texto: "Mandei isto enquanto a caixa estava pausada." });
    console.log("(esperando 2,5 min: nenhuma rodada pode ler o e-mail)");
    await dormir(150_000);
    const inbox = await textoDoInbox(p);
    item("06.nao-leu", "durante a pausa o e-mail novo NÃO foi lido (AC-008.2)", !inbox.includes(durante));
    await foto(p, "inbox-durante-pausa");
    cartao = await abaEmail(p);
    await cartao.getByRole("button", { name: "Retomar", exact: true }).click();
    await p.waitForSelector("text=Conectada", { timeout: 20_000 });
    item("06.retomada", "Retomar volta o estado para Conectada", true);
    await foto(p, "retomada");
    const t0 = Date.now();
    const achou = await acharConversa(p, durante, 240_000);
    item("06.sem-perder", "depois de retomar o e-mail da pausa aparece (nada perdido)", achou, `em ${Math.round((Date.now() - t0) / 1000)} s`);
    await foto(p, "apareceu-apos-retomar");
    await dormir(70_000);
    const inbox2 = await textoDoInbox(p);
    const ocorrencias = (inbox2.match(new RegExp(durante.replace(/[[\]]/g, "\\$&"), "g")) ?? []).length;
    const antigoVoltou = inbox2.includes(est.antigo);
    item("06.sem-repetir", "nada antigo foi reimportado nem duplicado depois de retomar", !antigoVoltou && ocorrencias <= 1, `ocorrências do novo na lista: ${ocorrencias}; antigo na lista: ${antigoVoltou}`);
    void caixas;
  });
} else if (passo === "senha") {
  await comNavegador(async (p) => {
    const cartao = await abaEmail(p);
    const antes = await cartao.innerText();
    const ultimos = (antes.match(/••••(\S*)/) ?? [])[0];
    await cartao.getByRole("button", { name: "Configurar", exact: true }).click();
    await p.locator('input[type=password]').first().fill("senha-errada-t044");
    await foto(p, "configurar-senha-errada");
    await p.getByRole("button", { name: "Salvar", exact: true }).click();
    await dormir(8000);
    const toast = await p.locator("[data-sonner-toast]").allInnerTexts();
    const texto = toast.join(" | ");
    item("07.recusa", "Configurar com senha errada é recusado com mensagem clara", /senha|recus|erro|n[aã]o foi poss/i.test(texto) && !/atualizada/i.test(texto), texto || "nenhuma mensagem visível");
    await foto(p, "senha-recusada");
    const cartao2 = await abaEmail(p);
    const depois = await cartao2.innerText();
    item("07.nao-salvou", "a caixa segue Conectada e com os mesmos últimos 4 da senha (nada salvo)", /Conectada/.test(depois) && depois.includes(ultimos ?? "§"), `antes ${ultimos}`);
    item("07.central", "aviso na Central por senha recusada pelo servidor (rodada)", null, "NÃO MEDIDO: exigiria mudar a senha no servidor de teste, o que a tarefa proíbe");
  });
} else if (passo === "teto") {
  const est = lerEstado();
  await comNavegador(async (p) => {
    let cartao = await abaEmail(p);
    await cartao.getByRole("button", { name: "Configurar", exact: true }).click();
    const original = { teto: await p.locator('input[type=number]').nth(0).inputValue(), intervalo: await p.locator('input[type=number]').nth(1).inputValue() };
    gravarEstado({ original });
    await p.locator('input[type=number]').nth(0).fill("1");
    await p.locator('input[type=number]').nth(1).fill("0");
    await p.getByRole("button", { name: "Salvar", exact: true }).click();
    await p.waitForSelector("text=Limite por dia: 1", { timeout: 20_000 }).catch(() => {});
    cartao = await abaEmail(p);
    item("08.teto-1", "o teto diário foi reduzido a 1 pela tela", /Limite por dia: 1/.test(await cartao.innerText()), `original ${original.teto}/${original.intervalo}s`);
    await foto(p, "teto-1");
    const abriu = await acharConversa(p, est.assuntoPergunta, 60_000);
    if (!abriu) return item("08.abrir", "abrir a conversa", false);
    const ids = [];
    for (const k of [1, 2]) {
      const texto = `Resposta ${k} sob teto ${est.tag}`;
      await p.locator('textarea[aria-label="Mensagem"]').fill(texto);
      await p.getByRole("button", { name: "Enviar" }).click();
      await dormir(6000);
      ids.push(texto);
    }
    await dormir(5000);
    await irPara(p, est.conversaUrl);
    await dormir(2500);
    const corpo = await p.innerText("body");
    const sinal = /adiad|fila|amanh|retom|limite/i.test(corpo);
    await foto(p, "duas-respostas-sob-teto");
    const msgs = await mensagensDoBanco(est.conversaId);
    const saida = msgs.filter((m) => m.direction === "outbound").map((m) => ({ status: m.status, retomada: m.metadata?.email_queue_until ?? m.metadata?.adiado_ate ?? null, chaves: Object.keys(m.metadata ?? {}).slice(0, 8) }));
    writeFileSync(join(EVIDENCIA, `${n}-saidas-no-banco.json`), JSON.stringify(saida, null, 2));
    const fila = msgs.filter((m) => m.direction === "outbound" && m.status === "queued");
    item("08.fila", "a resposta acima do teto ficou na fila (status queued) em vez de ser enviada", fila.length >= 1, `${fila.length} na fila; saídas: ${saida.map((s) => s.status).join(",")}`);
    item("08.aviso", "a conversa mostra o aviso de adiamento com a hora (AC-005.1)", sinal && fila.length >= 1, `texto de aviso visível: ${sinal}`);
    // restaura
    cartao = await abaEmail(p);
    await cartao.getByRole("button", { name: "Configurar", exact: true }).click();
    await p.locator('input[type=number]').nth(0).fill(original.teto);
    await p.locator('input[type=number]').nth(1).fill(original.intervalo);
    await p.getByRole("button", { name: "Salvar", exact: true }).click();
    await dormir(4000);
    cartao = await abaEmail(p);
    item("08.restaurado", "o teto e o intervalo voltaram ao original", new RegExp(`Limite por dia: ${original.teto}`).test(await cartao.innerText()));
    await foto(p, "teto-restaurado");
  });
} else if (passo === "limpar") {
  const est = lerEstado();
  await comNavegador(async (p) => {
    const cartao = await abaEmail(p);
    const botoes = await cartao.getByRole("button").allInnerTexts();
    item("09.ui-remover", "o cartão da caixa oferece remover/desconectar pela tela", botoes.some((b) => /remover|desconectar|excluir|arquivar/i.test(b)), `botões: ${botoes.join(", ")}`);
    const caixas = await caixasDoBanco();
    for (const c of caixas) {
      const r = await p.evaluate(async (id) => {
        const x = await fetch(`/api/v1/channel-sessions/${id}`, { method: "DELETE", credentials: "include" });
        return { status: x.status, corpo: (await x.text()).slice(0, 300) };
      }, c.id);
      item("09.excluir", "(API do produto, sem tela) DELETE /channel-sessions da caixa de teste", r.status < 300, `status ${r.status} ${r.corpo}`);
    }
    const depois = await caixasDoBanco();
    item("09.sem-caixa", "a organização ficou sem caixa de e-mail ativa", depois.every((c) => ["STOPPED", "ARCHIVED", "archived"].includes(String(c.status))) || depois.length === 0, depois.map((c) => c.status).join(",") || "nenhuma linha");
    const aba = await abaEmail(p);
    void aba;
    await foto(p, "aba-apos-limpar");
  });
  const convs = await ler(`conversations?select=id&organization_id=eq.${orgId}&channel_session_id=in.(${(await caixasDoBanco()).map((c) => c.id).join(",") || "00000000-0000-0000-0000-000000000000"})`);
  item("09.residuos", "resíduos (conversas/mensagens/contatos/auditoria) ficam: o produto não os apaga sem LGPD", null, `${convs.length} conversa(s) de e-mail permanecem na organização de teste`);
  void est;
  if (est.onboardedOriginal !== undefined) await patchOrg({ onboarded_at: est.onboardedOriginal });
}

const falhas = resultados.filter((r) => r.resultado === "FALHOU").length;
writeFileSync(join(EVIDENCIA, `${n}-${passo}.json`), JSON.stringify({ passo, quando: new Date().toISOString(), resultados, achados }, null, 2));
console.log(falhas === 0 ? `\nPASSO ${passo}: nenhum item FALHOU` : `\nPASSO ${passo}: ${falhas} item(ns) FALHOU`);
process.exit(falhas === 0 ? 0 : 1);
