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
//   celular    layout em 375x812 da aba E-mail, da lista de ignorados e do cartão da caixa (rodada 2)
//   erros      (por último) erro claro no Testar/Conectar: senha errada e servidor inválido; sem "Deu certo" (rodada 2)
//   limpar     "Remover caixa" PELA TELA, mede resíduos, RECONECTA o mesmo endereço e remove de novo (rodada 2)
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
// Rodada 1 (antes da Fatia 7): evidence/005-email/jornada-hml (JORNADA_RODADA=1). Rodada 2 (após a Fatia 7): jornada-hml-2.
const EVIDENCIA = join("evidence", "005-email", process.env.JORNADA_RODADA === "1" ? "jornada-hml" : "jornada-hml-2");
const VERSAO_ESPERADA = process.env.VERSAO_ESPERADA ?? "9bbf7a4";
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
const SEQ = ["base", "conectar", "receber", "ignorar", "responder", "pausar", "senha", "teto", "celular", "limpar", "erros"];
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

async function comNavegador(fn, { viewport = { width: 1280, height: 900 }, celular = false } = {}) {
  const nav = await chromium.launch();
  try {
    const ctx = await nav.newContext({ viewport, acceptDownloads: true, ...(celular ? { hasTouch: true, isMobile: true, deviceScaleFactor: 2 } : {}) });
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
const caixasDoBanco = () => ler(`channel_sessions?select=id,status,display_name,provider,created_at,archived_at,metadata&organization_id=eq.${orgId}&provider=eq.email`);
const caixasAtivas = async () => (await caixasDoBanco()).filter((c) => !c.archived_at);
/** Quantas linhas de senha guardada existem para a caixa (só a CONTAGEM; o valor nunca é lido). */
const senhasGuardadas = async (caixaId) => (await ler(`email_credenciais?select=channel_session_id&organization_id=eq.${orgId}&channel_session_id=eq.${caixaId}`)).length;
const conversasDaCaixa = (caixaId) => ler(`conversations?select=id,status&organization_id=eq.${orgId}&channel_session_id=eq.${caixaId}`);
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
    // O cliente (EMAIL2) é UM contato e UMA conversa: a prévia da lista mostra o assunto do ÚLTIMO e-mail dele.
    // Rodada 2: a org já tem conversas da rodada 1 (mesmo cliente); casar sempre pela etiqueta DESTA rodada.
    const tag = lerEstado().tag;
    const alvo = trecho === lerEstado().assuntoPergunta ? p.getByText(new RegExp(`\\[005\\] (Pergunta de pre|Aviso do conhec|Durante a pausa|Segundo).*${tag}|Resposta .*T044.*${tag}|^Re:.*${tag}`)).first() : p.getByText(trecho).first();
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
  item("01.versao", `a hml roda o commit ${VERSAO_ESPERADA} (Fatia 7 implantada)`, h.data.version === VERSAO_ESPERADA, `version ${h.data.version}`);
  const raiz = await fetch(`${BASE}/`, { redirect: "manual" });
  const app = await fetch(`${BASE}/app`, { redirect: "manual" });
  item("01.rotas", "/ responde 200 e /app responde 307", raiz.status === 200 && app.status === 307, `${raiz.status}/${app.status}`);
  const caixas = await caixasDoBanco();
  const ativas = caixas.filter((c) => !c.archived_at);
  // Rodada 2: sobra a caixa ARQUIVADA da rodada 1 (e as 2 conversas dela); o que importa é não haver caixa ativa.
  item("01.sem-caixa", "a organização de teste parte sem caixa de e-mail ATIVA", ativas.length === 0, `${ativas.length} ativa(s), ${caixas.length - ativas.length} arquivada(s)`);
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
    const caixas = await caixasAtivas();
    const todas = await caixasDoBanco();
    gravarEstado({ caixaId: caixas[0]?.id ?? null });
    // Rodada 2: conectar o MESMO endereço da rodada 1 deve ressuscitar a linha arquivada (sem criar outra).
    item("02.banco", "existe 1 caixa de e-mail ATIVA na organização (a arquivada da rodada 1 é reaproveitada)", caixas.length === 1, `status ${caixas[0]?.status}; ${todas.length} linha(s) no total`);
    item("02.senha-guardada", "a senha ficou guardada cifrada (1 linha em email_credenciais; valor não lido)", (await senhasGuardadas(caixas[0].id)) === 1);
    // Nada do passado: espera 2 rodadas do cron (1/min) e confere o Inbox.
    console.log("(esperando 2,5 min por rodadas do cron da hml para provar que o antigo não é importado)");
    await dormir(150_000);
    const inbox = await textoDoInbox(p);
    item("02.sem-antigo", "o e-mail ANTIGO não virou conversa depois das rodadas do cron (AC-001.5)", !inbox.includes(est.antigo), "assunto antigo ausente do Inbox");
    await foto(p, "inbox-sem-antigo");
  });
} else if (passo === "receber") {
  const est = lerEstado();
  const assunto = est.assuntoPergunta ?? `[005] Pergunta de preço ${est.tag}`;
  const msgId = est.msgIdPergunta ?? await enviarDoCliente({
    assunto: est.assuntoPergunta ?? assunto,
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
    await p.waitForSelector('[data-testid="email-assunto"]', { timeout: 60_000 }).catch(() => {});
    await dormir(2000);
    const corpo = await p.innerText("body");
    item("03.assunto-texto", "a conversa mostra o assunto e o texto do e-mail", corpo.includes(assunto) && corpo.includes("quanto custa o plano mensal"));
    const canal = await p.evaluate(() => [...document.querySelectorAll("[aria-label],[title]")].map((e) => (e.getAttribute("aria-label") ?? "") + (e.getAttribute("title") ?? "")).filter((s) => /e-?mail/i.test(s)).slice(0, 4));
    item("03.canal-email", "o cabeçalho/lista identifica o canal E-mail", canal.length > 0 || /e-?mail/i.test(corpo), JSON.stringify(canal));
    const semAudio = (await p.getByRole("button", { name: /gravar áudio|áudio|audio/i }).count()) === 0;
    item("03.sem-audio", "o Composer não oferece áudio nem recibo de leitura (AC-008.5)", semAudio && !/Lida às|Visto|Entregue/.test(corpo), "sem botão de áudio; sem texto de recibo");
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
    // Rodada 2: a conversa do cliente já existe desde a rodada 1; a que acabou de receber é a de atividade mais recente.
    const c = await ler(`conversations?select=id,contact_id&organization_id=eq.${orgId}&order=updated_at.desc&limit=1`);
    const contato = c[0] ? await ler(`contacts?select=id,name&organization_id=eq.${orgId}&id=eq.${c[0].contact_id}`) : [];
    item("03.contato", "um contato foi criado/ligado à conversa", contato.length === 1, `contato "${mascara(contato[0]?.name ?? "")}"`);
    if (c[0]) gravarEstado({ conversaId: c[0].id, contatoId: c[0].contact_id });
  });
} else if (passo === "ignorar") {
  const est = lerEstado();
  // Rodada 2: endereços NOVOS por rodada (a rodada 1 deixou "promo" como conhecido e "não é cliente").
  const slug = est.tag.toLowerCase();
  const alias = `promo-${slug}@${DOMINIO}`;
  const aliasCliente = `maria.t044@${DOMINIO}`;
  const assuntoLista = `[005] Newsletter de promoção ${est.tag}`;
  const assuntoLista2 = `[005] Newsletter de promoção 2 ${est.tag}`;
  const assuntoAuto = `[005] Resposta automática ${est.tag}`;
  const assuntoConhecido = `[005] Aviso do conhecido ${est.tag}`;
  const assuntoDepois = `[005] Segundo e-mail do mesmo ${est.tag}`;
  const cabecalhosDeLista = { "List-Unsubscribe": "<mailto:sair@exemplo.invalid>", Precedence: "bulk" };
  // 1) remetente NOVO, DOIS e-mails de lista de inscrição / em massa (um será promovido, no outro se marca "Não é cliente")
  await enviarDoCliente({ assunto: assuntoLista, texto: "Cancelar inscrição: https://exemplo.invalid/sair", de: `Promo T044 <${alias}>`, headers: cabecalhosDeLista });
  await enviarDoCliente({ assunto: assuntoLista2, texto: "Outra oferta. Cancelar inscrição: https://exemplo.invalid/sair", de: `Promo T044 <${alias}>`, headers: cabecalhosDeLista });
  // 2) remetente NOVO com resposta automática
  await enviarDoCliente({ assunto: assuntoAuto, texto: "Estou fora do escritório.", de: `Fora T044 <fora-${slug}@${DOMINIO}>`, headers: { "Auto-Submitted": "auto-generated" } });
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
    // ===== Rodada 2 (Fatia 7): lista de ignorados PELA TELA (AC-003.3), promover e "Não é cliente" pela tela =====
    const cartaoDe = (assunto) => p.locator('[data-testid="ignorado"]', { hasText: assunto });
    /** Abre a aba E-mail e espera (recarregando) o item aparecer na lista de ignorados. */
    const esperarNaLista = async (assunto, ms = 180_000) => {
      const fim = Date.now() + ms;
      while (Date.now() < fim) {
        await abaEmail(p);
        if ((await cartaoDe(assunto).count()) > 0) return true;
        await dormir(15_000);
      }
      return false;
    };
    const naLista = await esperarNaLista(assuntoLista);
    item("04.tela-ignorados", "a aba E-mail tem a seção 'E-mails que não viraram conversa' com o e-mail de lista (AC-003.3)", naLista && (await p.locator('[data-testid="ignorados-email"]').count()) === 1, naLista ? "item encontrado na tela" : "item não apareceu na lista em 3 min");
    if (naLista) {
      const c = cartaoDe(assuntoLista).first();
      const txt = await c.innerText();
      const dt = await c.locator("time").getAttribute("datetime");
      const idade = dt ? (Date.now() - new Date(dt).getTime()) / 60_000 : NaN;
      item("04.lista-remetente", "o item mostra o remetente", txt.toLowerCase().includes(alias.toLowerCase()), "remetente da rodada presente (mascarado)");
      item("04.lista-assunto", "o item mostra o assunto", txt.includes(assuntoLista));
      item("04.lista-data", "o item mostra a data do e-mail (recente)", Number.isFinite(idade) && idade >= 0 && idade < 60 && (await c.locator("time").innerText()).length > 5, `há ${Math.round(idade)} min`);
      const motivoTxt = (await c.locator("p.text-xs").last().innerText()).trim();
      item("04.lista-motivo", "o motivo vem em português simples (lista de inscrição / envio em massa)", /lista de inscri|envio em massa/i.test(motivoTxt), `motivo: ${motivoTxt}`);
      item("04.lista-botoes", "o item oferece 'Abrir como conversa' e 'Não é cliente'", (await c.getByRole("button", { name: "Abrir como conversa" }).count()) === 1 && (await c.getByRole("button", { name: "Não é cliente" }).count()) === 1);
      const cAuto = cartaoDe(assuntoAuto).first();
      const motivoAuto = (await cAuto.count()) ? (await cAuto.locator("p.text-xs").last().innerText()).trim() : "";
      item("04.lista-motivo-auto", "a resposta automática de remetente novo aparece com motivo em português simples", /resposta autom/i.test(motivoAuto), `motivo: ${motivoAuto || "item ausente"}`);
      await foto(p, "lista-de-ignorados");
      writeFileSync(join(EVIDENCIA, `${n}-lista-na-tela.json`), JSON.stringify({ motivoDaLista: motivoTxt, motivoDaAutomatica: motivoAuto, itensVisiveis: await p.locator('[data-testid="ignorado"]').count() }, null, 2));

      // --- Abrir como conversa, pela TELA ---
      await c.getByRole("button", { name: "Abrir como conversa" }).click();
      const toastOk = await p.locator("[data-sonner-toast]", { hasText: "E-mail aberto como conversa" }).waitFor({ timeout: 40_000 }).then(() => true).catch(() => false);
      item("04.promover-tela", "'Abrir como conversa' pela tela mostra o aviso de sucesso", toastOk);
      await dormir(2500);
      await foto(p, "apos-abrir-como-conversa", { medir: false });
      item("04.promover-sai-da-lista", "o item promovido sai da lista", (await cartaoDe(assuntoLista).count()) === 0);
      const viu = await acharConversa(p, assuntoLista, 150_000);
      item("04.promovido-na-tela", "o e-mail promovido aparece como conversa no Inbox", viu);
      await foto(p, "promovido");
      const [convPromovida] = await ler(`conversations?select=id,status,contact_id,channel_session_id&organization_id=eq.${orgId}&order=created_at.desc&limit=1`);
      item("04.promovido-banco", "(banco) a conversa nova nasceu aberta, ligada à caixa", convPromovida?.status === "open", `status ${convPromovida?.status}`);

      // --- Não é cliente, pela TELA, sobre o 2º e-mail do mesmo remetente (ainda na lista) ---
      const restou = await esperarNaLista(assuntoLista2, 30_000);
      item("04.segundo-na-lista", "o 2º e-mail do mesmo remetente segue na lista depois do promover", restou);
      if (restou) {
        const c2 = cartaoDe(assuntoLista2).first();
        await c2.getByRole("button", { name: "Não é cliente" }).click();
        const dlg = p.getByRole("alertdialog");
        await dlg.waitFor({ timeout: 10_000 });
        const dlgTxt = await dlg.innerText();
        item("04.nc-confirma", "'Não é cliente' pede confirmação, diz que arquiva as conversas de e-mail e que nada é apagado", /Marcar esta pessoa como não é cliente/i.test(dlgTxt) && /arquivadas/i.test(dlgTxt) && /Nada é apagado/i.test(dlgTxt), "texto do diálogo conferido");
        await foto(p, "dialogo-nao-e-cliente", { medir: false });
        await dlg.getByRole("button", { name: "Cancelar" }).click();
        await dormir(800);
        const [aindaAberta] = await ler(`conversations?select=status&organization_id=eq.${orgId}&id=eq.${convPromovida.id}`);
        item("04.nc-cancelar", "Cancelar no diálogo não muda nada (a conversa segue aberta)", aindaAberta?.status === "open" && (await cartaoDe(assuntoLista2).count()) === 1, `status ${aindaAberta?.status}`);
        await cartaoDe(assuntoLista2).first().getByRole("button", { name: "Não é cliente" }).click();
        await p.getByRole("alertdialog").getByRole("button", { name: "Marcar como não é cliente" }).click();
        const toastNc = await p.locator("[data-sonner-toast]", { hasText: "Os próximos e-mails dessa pessoa serão deixados de fora" }).waitFor({ timeout: 40_000 }).then(() => true).catch(() => false);
        item("04.nc-tela", "'Não é cliente' pela tela mostra o aviso de sucesso", toastNc);
        await dormir(2500);
        const [depoisNc] = await ler(`conversations?select=id,status&organization_id=eq.${orgId}&id=eq.${convPromovida.id}`);
        item("04.nc-arquiva", "'Não é cliente' ARQUIVA a conversa do remetente (AC-003.4)", Boolean(depoisNc) && depoisNc.status !== "open", `status da conversa: ${depoisNc?.status}`);
        const itemMarcado = cartaoDe(assuntoLista2).first();
        const motivoNc = (await itemMarcado.count()) ? (await itemMarcado.locator("p.text-xs").last().innerText()).trim() : "";
        item("04.nc-lista", "o item marcado continua na lista com o motivo 'Você marcou como não é cliente' e sem o botão 'Não é cliente'", /marcou como não é cliente/i.test(motivoNc) && (await itemMarcado.getByRole("button", { name: "Não é cliente" }).count()) === 0, `motivo: ${motivoNc || "item ausente"}`);
        await foto(p, "apos-nao-e-cliente-lista");
        await irPara(p, "/app/inbox");
        await dormir(2000);
        const inboxNc = await p.innerText("body");
        item("04.nc-fora-da-fila", "a conversa do remetente saiu da fila do Inbox", !inboxNc.includes(assuntoLista), "assunto promovido ausente da fila padrão do Inbox");
        await foto(p, "inbox-apos-nao-e-cliente");
        await enviarDoCliente({ assunto: assuntoDepois, texto: "Mais uma mensagem do mesmo remetente.", de: `Promo T044 <${alias}>` });
        gravarEstado({ ncConversaId: convPromovida.id, assuntoDepois, ncEm: new Date().toISOString() });
        console.log("(esperando 2,5 min: o próximo e-mail do remetente 'não é cliente' NÃO pode virar conversa)");
        await dormir(150_000);
        const depois = await textoDoInbox(p);
        item("04.nao-cliente-vale", "o próximo e-mail do remetente marcado 'não é cliente' NÃO vira conversa (AC-003.4)", !depois.includes(assuntoDepois));
        const convsDepois = await ler(`conversations?select=id,status,created_at&organization_id=eq.${orgId}&created_at=gt.${encodeURIComponent(lerEstado().ncEm)}`);
        item("04.nc-sem-conversa-nova", "(banco) nenhuma conversa nasceu depois do 'Não é cliente'", convsDepois.length === 0, `${convsDepois.length} conversa(s) nova(s)`);
        await abaEmail(p);
        item("04.depois-na-lista", "o próximo e-mail do remetente aparece na lista de ignorados com o motivo 'não é cliente'", await esperarNaLista(assuntoDepois, 90_000));
        await foto(p, "apos-nao-cliente");
      }
    }
    // O backend: lido a partir da sessão do navegador (diagnóstico, não prova de UX)
    const api = await p.evaluate(async () => {
      const r = await fetch("/api/v1/channels/email/ignorados", { credentials: "include" });
      return { status: r.status, json: await r.json() };
    });
    const lista = api.json?.data?.ignorados ?? [];
    const doLista = lista.find((x) => (x.assunto ?? x.subject ?? "").includes(assuntoLista2));
    item("04.api-ignorados", "(API, diagnóstico) a lista de ignorados do servidor traz o e-mail de lista com motivo", Boolean(doLista), `status ${api.status}, ${lista.length} ignorado(s), campos ${doLista ? Object.keys(doLista).join(",") : "-"}, motivo ${doLista ? JSON.stringify(doLista.motivo ?? doLista.reason ?? null) : "-"}`);
    // (os campos de status/promover/marcar agora são provados PELA TELA acima; a API ficou só de diagnóstico dos campos)
    writeFileSync(join(EVIDENCIA, `${n}-ignorados-api.json`), JSON.stringify({ status: api.status, quantidade: lista.length, campos: doLista ? Object.keys(doLista) : [], motivo: doLista?.motivo ?? doLista?.reason ?? null }, null, 2));
  });
} else if (passo === "responder") {
  const est = lerEstado();
  const resposta = `Resposta T044 ${est.tag}: o plano mensal custa 200 reais.`;
  // A resposta do CRM fala com o ÚLTIMO e-mail do cliente (a conversa é uma só): confere contra o Message-ID dele.
  const ultimo = await comImap(em.EMAIL1, em.SENHA1, async (c) => {
    const uids = await c.search({ from: em.EMAIL2, subject: est.tag }, { uid: true });
    const m = await c.fetchOne(String(Math.max(...uids)), { envelope: true }, { uid: true });
    return { id: m.envelope.messageId, assunto: m.envelope.subject };
  });
  await comNavegador(async (p) => {
    const abriu = await acharConversa(p, est.assuntoPergunta, 60_000);
    item("05.abrir", "a conversa da pergunta abre", abriu);
    if (!abriu) return;
    const caixa = p.locator('textarea[aria-label="Mensagem"]');
    await caixa.fill(resposta);
    await foto(p, "composer-preenchido");
    await p.getByRole("button", { name: "Enviar" }).click();
    gravarEstado({ respostaEnviadaEm: new Date().toISOString(), resposta });
    await dormir(8000);
    const bolha = await p.innerText("body");
    item("05.bolha", "a resposta aparece na conversa depois do Enviar", bolha.includes(`Resposta T044 ${est.tag}`));
    await foto(p, "apos-enviar");
    console.log("(esperando a resposta chegar à caixa do cliente)");
    const t0 = Date.now();
    const rec = await esperarNoCliente(est.tag + "");
    // a caixa do cliente também tem os "Re:"; procura o assunto com Re:
    const re = rec && /^re:/i.test(rec.assunto) ? rec : await esperarNoCliente(`Re: ${ultimo.assunto}`, 120_000);
    item("05.chegou", "o cliente RECEBEU a resposta pelo servidor real", Boolean(re), `em ${Math.round((Date.now() - t0) / 1000)} s`);
    if (!re) return;
    const f = re.fonte;
    const assuntoRe = cabecalho(f, "Subject");
    const inReplyTo = cabecalho(f, "In-Reply-To");
    const refs = cabecalho(f, "References");
    item("05.assunto-re", "o assunto começa com Re: e mantém o original", /^re:/i.test(re.assunto) && re.assunto.includes(ultimo.assunto), `assunto ${re.assunto?.slice(0, 80)}`);
    item("05.in-reply-to", "In-Reply-To aponta para o Message-ID do e-mail do cliente", Boolean(inReplyTo) && inReplyTo.replace(/[<>]/g, "") === String(ultimo.id).replace(/[<>]/g, ""), `In-Reply-To ${inReplyTo ? "presente" : "ausente"}`);
    item("05.references", "References contém o Message-ID do e-mail do cliente", Boolean(refs) && refs.includes(String(ultimo.id).replace(/[<>]/g, "")), `References ${refs ? "presente" : "ausente"}`);
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
  const durante = `[005] Durante a pausa ${est.tag}-${Date.now().toString(36)}`;
  await comNavegador(async (p) => {
    let cartao = await abaEmail(p);
    await foto(p, "antes");
    await cartao.getByRole("button", { name: "Pausar", exact: true }).click();
    await dormir(5000);
    const imediato = await p.locator('[data-testid="caixa-email"]').first().innerText();
    await foto(p, "logo-apos-pausar", { medir: false });
    item("06.pausada-na-hora", "logo depois do clique (5 s) o cartão já mostra Pausada, sem recarregar a página", /Pausada/.test(imediato), imediato.replace(/\s+/g, " ").slice(0, 160));
    cartao = await abaEmail(p); // recarrega a página
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
    let toast = [];
    for (let k = 0; k < 40 && !toast.length; k++) { await dormir(500); toast = await p.locator("[data-sonner-toast]").allInnerTexts(); if (k === 4 && toast.length) await foto(p, "toast-da-recusa", { medir: false }); }
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
    await p.waitForSelector('[data-testid="email-assunto"]', { timeout: 60_000 }).catch(() => {});
    await dormir(2500);
    // Rodada 2: a conversa já tem avisos de adiamento da rodada 1; conta quantos há ANTES para medir só os novos.
    const avisosAntes = ((await p.innerText("body")).match(/Limite do dia da caixa atingido/g) ?? []).length;
    for (const k of [1, 2]) {
      const texto = `Resposta ${k} sob teto ${est.tag}`;
      await p.locator('textarea[aria-label="Mensagem"]').fill(texto);
      await p.getByRole("button", { name: "Enviar" }).click();
      await dormir(6000);
      ids.push(texto);
    }
    await dormir(5000);
    await acharConversa(p, est.assuntoPergunta, 60_000);
    await p.waitForSelector('[data-testid="email-assunto"]', { timeout: 60_000 }).catch(() => {});
    await dormir(2500);
    const corpo = await p.innerText("body");
    const sinal = (corpo.match(/Limite do dia da caixa atingido/g) ?? []).length > avisosAntes;
    await foto(p, "duas-respostas-sob-teto");
    const msgs = await mensagensDoBanco(est.conversaId);
    const saida = msgs.filter((m) => m.direction === "outbound").map((m) => ({ status: m.status, retomada: m.metadata?.email_queue_until ?? m.metadata?.adiado_ate ?? null, chaves: Object.keys(m.metadata ?? {}).slice(0, 8) }));
    writeFileSync(join(EVIDENCIA, `${n}-saidas-no-banco.json`), JSON.stringify(saida, null, 2));
    // Rodada 2: a conversa traz 2 respostas `queued` da rodada 1; só contam as desta rodada (etiqueta no texto).
    const fila = msgs.filter((m) => m.direction === "outbound" && m.status === "queued" && String(m.body ?? "").includes(est.tag));
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
  /** Remove a caixa PELA TELA (botão + confirmação) e devolve o que o banco diz depois. */
  const removerPelaTela = async (p, rotulo, { cancelarAntes = false } = {}) => {
    const [ativa] = await caixasAtivas();
    if (!ativa) throw new Error("nenhuma caixa ativa para remover");
    const conversasAntes = (await conversasDaCaixa(ativa.id)).length;
    const cartao = await abaEmail(p);
    await cartao.getByRole("button", { name: "Remover caixa", exact: true }).click();
    const dlg = p.getByRole("alertdialog");
    await dlg.waitFor({ timeout: 10_000 });
    const t = await dlg.innerText();
    item(`${n}.${rotulo}-confirma`, "'Remover caixa' pede confirmação e diz o que acontece (para de ler/enviar, conversas ficam, senha apagada, como voltar)", /Remover esta caixa de e-mail/i.test(t) && /para de ler e de enviar/i.test(t) && /conversas e as mensagens continuam/i.test(t) && /senha guardada é apagada/i.test(t) && /conecte a caixa de novo/i.test(t), "texto do diálogo conferido");
    await foto(p, `${rotulo}-dialogo`, { medir: false });
    if (cancelarAntes) {
      await dlg.getByRole("button", { name: "Cancelar" }).click();
      await dormir(800);
      item(`${n}.${rotulo}-cancelar`, "Cancelar no diálogo não remove nada (caixa continua ativa e com senha)", (await caixasAtivas()).length === 1 && (await senhasGuardadas(ativa.id)) === 1 && (await p.locator('[data-testid="caixa-email"]').count()) === 1);
      await p.locator('[data-testid="caixa-email"]').first().getByRole("button", { name: "Remover caixa", exact: true }).click();
      await p.getByRole("alertdialog").waitFor({ timeout: 10_000 });
    }
    await p.getByRole("alertdialog").getByRole("button", { name: "Remover a caixa", exact: true }).click();
    const toastOk = await p.locator("[data-sonner-toast]", { hasText: "Caixa removida" }).waitFor({ timeout: 40_000 }).then(() => true).catch(() => false);
    item(`${n}.${rotulo}-aviso`, "'Remover a caixa' mostra o aviso 'Caixa removida.'", toastOk);
    const saiu = await p.locator('[data-testid="caixa-email"]').waitFor({ state: "detached", timeout: 20_000 }).then(() => true).catch(() => false);
    item(`${n}.${rotulo}-sai-da-tela`, "a caixa sai da tela e o assistente de conexão volta", saiu && (await p.locator('[data-testid="assistente-email"]').waitFor({ timeout: 15_000 }).then(() => true).catch(() => false)));
    await foto(p, `${rotulo}-aba-sem-caixa`);
    const linha = (await caixasDoBanco()).find((c) => c.id === ativa.id);
    item(`${n}.${rotulo}-arquivada`, "(banco) a caixa ficou arquivada (STOPPED, archived_at preenchido) e a linha não foi apagada", Boolean(linha?.archived_at) && linha?.status === "STOPPED", `status ${linha?.status}`);
    item(`${n}.${rotulo}-senha-some`, "(banco) a senha guardada sumiu (0 linhas em email_credenciais)", (await senhasGuardadas(ativa.id)) === 0);
    const conversasDepois = (await conversasDaCaixa(ativa.id)).length;
    item(`${n}.${rotulo}-conversas-ficam`, "(banco) as conversas da caixa continuam", conversasDepois === conversasAntes && conversasAntes > 0, `${conversasAntes} antes, ${conversasDepois} depois`);
    return { id: ativa.id, conversas: conversasAntes };
  };
  try {
    await comNavegador(async (p) => {
      // ---- 1) remover pela tela (com cancelar antes) ----
      const cartao0 = await abaEmail(p);
      const botoes = await cartao0.getByRole("button").allInnerTexts();
      item(`${n}.ui-remover`, "o cartão da caixa oferece 'Remover caixa' pela tela", botoes.includes("Remover caixa"), `botões: ${botoes.join(", ")}`);
      const removida = await removerPelaTela(p, "remover", { cancelarAntes: true });
      const viuConversa = await acharConversa(p, est.assuntoPergunta, 90_000);
      item(`${n}.conversas-na-tela`, "as conversas da caixa removida continuam visíveis no Inbox", viuConversa);
      await foto(p, "inbox-com-caixa-removida", { medir: false });

      // ---- 2) reconectar o MESMO endereço ----
      await abaEmail(p);
      await p.getByRole("button", { name: "Outro provedor", exact: true }).click();
      await p.fill("#email-endereco", em.EMAIL1);
      await p.fill("#email-senha", em.SENHA1);
      await p.fill("#email-imap-host", em.EMAIL_HOST);
      await p.fill("#email-imap-porta", em.EMAIL_IMAP_PORT);
      await p.fill("#email-smtp-host", em.EMAIL_HOST);
      await p.fill("#email-smtp-porta", em.EMAIL_SMTP_PORT);
      await p.fill("#email-assinatura", "-- Equipe de teste 005");
      await p.getByRole("button", { name: "Testar", exact: true }).click();
      const testou = await p.locator('[data-testid="assistente-email"] [role=status]', { hasText: "Deu certo" }).waitFor({ timeout: 75_000 }).then(() => true).catch(() => false);
      item(`${n}.reconectar-testar`, "reconectar: o Testar do mesmo endereço dá certo", testou);
      await p.getByRole("button", { name: "Conectar", exact: true }).click();
      const voltou = await p.locator('[data-testid="caixa-email"]').first().waitFor({ timeout: 60_000 }).then(() => true).catch(() => false);
      item(`${n}.reconectar-volta`, "reconectar: a caixa volta à tela", voltou);
      if (voltou) {
        await dormir(2000);
        const cartaoNovo = p.locator('[data-testid="caixa-email"]').first();
        const txt = await cartaoNovo.innerText();
        item(`${n}.reconectar-estado`, "reconectar: o cartão mostra Conectada, limites e a senha só como ••••últimos4", /Conectada/.test(txt) && /Limite por dia/.test(txt) && /••••/.test(txt) && !txt.includes(em.SENHA1));
        await foto(p, "reconectada");
        const [nova] = await caixasAtivas();
        item(`${n}.reconectar-mesma-linha`, "(banco) a mesma linha de caixa foi ressuscitada (sem criar outra)", nova?.id === removida.id, nova?.id === removida.id ? "mesmo id" : "id diferente");
        item(`${n}.reconectar-senha`, "(banco) a senha foi guardada de novo (1 linha)", (await senhasGuardadas(nova.id)) === 1);
        const convs = await conversasDaCaixa(nova.id);
        item(`${n}.reconectar-conversas`, "(banco) as conversas voltam ligadas à caixa reconectada", convs.length >= removida.conversas, `${convs.length} conversa(s), eram ${removida.conversas}`);
        const viu2 = await acharConversa(p, est.assuntoPergunta, 90_000);
        item(`${n}.reconectar-conversas-na-tela`, "as conversas aparecem no Inbox com a caixa reconectada", viu2);
        await foto(p, "inbox-apos-reconectar", { medir: false });
        gravarEstado({ caixaId: nova.id });
      }

      // ---- 3) deixa a organização como encontrou: remove de novo, pela tela ----
      if ((await caixasAtivas()).length === 1) {
        await removerPelaTela(p, "remover-final");
      }
      const finais = await caixasAtivas();
      item(`${n}.sem-caixa`, "(banco) a organização ficou SEM caixa de e-mail ativa", finais.length === 0, `${finais.length} ativa(s)`);
    });
  } finally {
    if (est.onboardedOriginal !== undefined) {
      await patchOrg({ onboarded_at: est.onboardedOriginal });
      const [o] = await ler(`organizations?select=onboarded_at&id=eq.${orgId}`);
      item(`${n}.onboarding`, "onboarded_at da organização voltou ao valor original", JSON.stringify(o.onboarded_at) === JSON.stringify(est.onboardedOriginal), `original ${JSON.stringify(est.onboardedOriginal)}`);
    }
  }
  const todas = await caixasDoBanco();
  const convs = await ler(`conversations?select=id&organization_id=eq.${orgId}&channel_session_id=in.(${todas.map((c) => c.id).join(",") || "00000000-0000-0000-0000-000000000000"})`);
  item(`${n}.residuos`, "resíduos (conversas/mensagens/contatos/auditoria) ficam: o produto não os apaga sem LGPD", null, `${convs.length} conversa(s) de e-mail permanecem na organização de teste`);
} else if (passo === "celular") {
  // Layout em celular (375x812): sem rolagem lateral da página, botões >= 44 px de altura, texto >= 12 px.
  const medirRegiao = (p, seletor) =>
    p.evaluate((sel) => {
      const raiz = document.querySelector(sel);
      if (!raiz) return null;
      const larguraDaJanela = window.innerWidth;
      const visiveis = (e) => {
        const r = e.getBoundingClientRect();
        const cs = getComputedStyle(e);
        return r.width > 0 && r.height > 0 && cs.visibility !== "hidden" && cs.display !== "none";
      };
      const botoes = [...raiz.querySelectorAll("button, a[href], select, input:not([type=hidden])")].filter(visiveis).map((e) => {
        const r = e.getBoundingClientRect();
        return { nome: (e.getAttribute("aria-label") ?? e.innerText ?? e.id ?? e.tagName).toString().trim().slice(0, 40), altura: Math.round(r.height), largura: Math.round(r.width), foraDaJanela: r.left < -1 || r.right > larguraDaJanela + 1 };
      });
      const textos = [...raiz.querySelectorAll("*")].filter((e) => visiveis(e) && [...e.childNodes].some((c) => c.nodeType === 3 && c.textContent.trim().length > 2));
      const menorFonte = Math.min(...textos.map((e) => parseFloat(getComputedStyle(e).fontSize)));
      const pequenos = textos.filter((e) => parseFloat(getComputedStyle(e).fontSize) < 12).map((e) => e.textContent.trim().slice(0, 30));
      return {
        larguraDaJanela,
        larguraDaPagina: document.documentElement.scrollWidth,
        larguraDaRegiao: raiz.scrollWidth,
        botoes,
        botoesBaixos: botoes.filter((b) => b.altura < 44).map((b) => `${b.nome} (${b.altura}px)`),
        elementosForaDaJanela: botoes.filter((b) => b.foraDaJanela).length,
        menorFonte,
        textosPequenos: pequenos.slice(0, 5),
      };
    }, seletor);
  const relatorio = {};
  await comNavegador(
    async (p) => {
      await abaEmail(p);
      const temCartao = (await p.locator('[data-testid="caixa-email"]').count()) > 0;
      const temLista = (await p.locator('[data-testid="ignorado"]').count()) > 0;
      item(`${n}.pre`, "há caixa e itens na lista de ignorados para medir", temCartao && temLista, `cartão ${temCartao}, itens ${await p.locator('[data-testid="ignorado"]').count()}`);
      const regioes = [
        ["aba-email", '[data-testid="canal-email"]'],
        ["cartao-da-caixa", '[data-testid="caixa-email"]'],
        ["lista-de-ignorados", '[data-testid="ignorados-email"]'],
      ];
      await foto(p, "aba-email-celular");
      for (const [nome, sel] of regioes) {
        const m = await medirRegiao(p, sel);
        relatorio[nome] = m;
        if (!m) { item(`${n}.${nome}`, `região ${nome} existe`, false); continue; }
        item(`${n}.${nome}.sem-rolagem`, `${nome}: a página não rola para o lado e nenhum controle sai da janela`, m.larguraDaPagina <= m.larguraDaJanela + 1 && m.larguraDaRegiao <= m.larguraDaJanela + 1 && m.elementosForaDaJanela === 0, `janela ${m.larguraDaJanela}, página ${m.larguraDaPagina}, região ${m.larguraDaRegiao}, fora ${m.elementosForaDaJanela}`);
        item(`${n}.${nome}.toque`, `${nome}: botões e campos tocáveis (altura >= 44 px)`, m.botoesBaixos.length === 0, m.botoesBaixos.length ? `abaixo de 44 px: ${m.botoesBaixos.join("; ")}` : `${m.botoes.length} controles, todos >= 44 px`);
        item(`${n}.${nome}.texto`, `${nome}: texto legível (fonte >= 12 px)`, m.menorFonte >= 12, `menor fonte ${m.menorFonte}px${m.textosPequenos.length ? `; menores: ${m.textosPequenos.join(" | ")}` : ""}`);
      }
      // diálogos de confirmação em celular
      await p.locator('[data-testid="caixa-email"]').first().getByRole("button", { name: "Remover caixa", exact: true }).click();
      await p.getByRole("alertdialog").waitFor({ timeout: 10_000 });
      const dlg = await medirRegiao(p, '[role="alertdialog"]');
      relatorio["dialogo-remover"] = dlg;
      item(`${n}.dialogo-remover`, "diálogo 'Remover caixa': cabe na janela e os botões têm >= 44 px", Boolean(dlg) && dlg.larguraDaPagina <= dlg.larguraDaJanela + 1 && dlg.elementosForaDaJanela === 0 && dlg.botoesBaixos.length === 0, dlg ? `fora ${dlg.elementosForaDaJanela}; baixos: ${dlg.botoesBaixos.join("; ") || "nenhum"}` : "sem diálogo");
      await foto(p, "dialogo-remover-celular", { medir: false });
      await p.getByRole("alertdialog").getByRole("button", { name: "Cancelar" }).click();
      await p.locator('[data-testid="ignorado"]').first().getByRole("button", { name: "Não é cliente" }).first().click().catch(() => {});
      if ((await p.getByRole("alertdialog").count()) > 0) {
        const d2 = await medirRegiao(p, '[role="alertdialog"]');
        relatorio["dialogo-nao-e-cliente"] = d2;
        item(`${n}.dialogo-nao-e-cliente`, "diálogo 'Não é cliente': cabe na janela e os botões têm >= 44 px", Boolean(d2) && d2.larguraDaPagina <= d2.larguraDaJanela + 1 && d2.elementosForaDaJanela === 0 && d2.botoesBaixos.length === 0, d2 ? `fora ${d2.elementosForaDaJanela}; baixos: ${d2.botoesBaixos.join("; ") || "nenhum"}` : "");
        await foto(p, "dialogo-nao-e-cliente-celular", { medir: false });
        await p.getByRole("alertdialog").getByRole("button", { name: "Cancelar" }).click();
      }
      // assistente de conexão (aberto pelo botão) também em celular
      await p.getByRole("button", { name: "Conectar outra caixa" }).click();
      await p.getByRole("button", { name: "Outro provedor", exact: true }).click();
      await dormir(800);
      const ass = await medirRegiao(p, '[data-testid="assistente-email"]');
      relatorio["assistente-de-conexao"] = ass;
      item(`${n}.assistente.sem-rolagem`, "assistente de conexão: sem rolagem lateral", Boolean(ass) && ass.larguraDaPagina <= ass.larguraDaJanela + 1 && ass.elementosForaDaJanela === 0, ass ? `página ${ass.larguraDaPagina} / janela ${ass.larguraDaJanela}` : "");
      item(`${n}.assistente.toque`, "assistente de conexão: controles >= 44 px", Boolean(ass) && ass.botoesBaixos.length === 0, ass?.botoesBaixos.join("; ") || "todos >= 44 px");
      await foto(p, "assistente-celular");
    },
    { viewport: { width: 375, height: 812 }, celular: true },
  );
  writeFileSync(join(EVIDENCIA, `${n}-medidas-celular.json`), mascara(JSON.stringify(relatorio, null, 2)));
} else if (passo === "erros") {
  // Rodada 2 (Fatia 7), achado 4: o erro do Conectar/Testar é claro, em português simples, e NUNCA convive com "Deu certo".
  // Roda por ÚLTIMO de propósito: senhas erradas no servidor de teste podem fazê-lo recusar a hml por um tempo
  // (ver rodada 2 no documento), e nenhum outro passo pode depender dele depois disto.
  const est = lerEstado();
  if (est.onboardedOriginal !== undefined) await patchOrg({ onboarded_at: new Date().toISOString() }); // o `limpar` já devolveu o original
  try {
    await comNavegador(async (p) => {
      await abaEmail(p);
      await p.waitForSelector('[data-testid="assistente-email"]');
      const painel = p.locator('[data-testid="assistente-email"]');
      const tecnico = /ECONN|ETIMEDOUT|ENOTFOUND|EAI_|stack|undefined|\[object|Error:|\{|\}|\b5\d\d\b|cifra|private\.|supabase/i;
      const frasesDeErro = {};
      const esperarErro = async (nome, ms = 75_000) => {
        const r = await Promise.race([
          painel.locator("[role=alert]").first().waitFor({ timeout: ms }).then(() => "erro"),
          painel.locator("[role=status]", { hasText: "Deu certo" }).waitFor({ timeout: ms }).then(() => "ok"),
        ]).catch(() => "tempo");
        const texto = r === "erro" ? (await painel.locator("[role=alert]").first().innerText()).trim() : "";
        const deuCerto = (await painel.locator("[role=status]", { hasText: "Deu certo" }).count()) > 0;
        frasesDeErro[nome] = texto;
        item(`${n}.${nome}`, `${nome}: aparece um aviso de erro e NÃO aparece "Deu certo"`, r === "erro" && !deuCerto, `${r}; "Deu certo" visível: ${deuCerto}`);
        item(`${n}.${nome}-claro`, `${nome}: a frase de erro é em português simples (sem termo técnico)`, texto.length >= 15 && !tecnico.test(texto) && /[a-zà-ú]/i.test(texto), `frase: ${texto}`);
        return r === "erro";
      };
      await p.getByRole("button", { name: "Outro provedor", exact: true }).click();
      await p.fill("#email-endereco", em.EMAIL1);
      await p.fill("#email-senha", em.SENHA1);
      await p.fill("#email-imap-host", em.EMAIL_HOST);
      await p.fill("#email-imap-porta", em.EMAIL_IMAP_PORT);
      await p.fill("#email-smtp-host", em.EMAIL_HOST);
      await p.fill("#email-smtp-porta", em.EMAIL_SMTP_PORT);
      // (a) CONECTAR falhando: o Testar passa com a senha certa; na hora do Conectar o corpo vai com senha errada
      await p.getByRole("button", { name: "Testar", exact: true }).click();
      const testou = await painel.locator("[role=status]", { hasText: "Deu certo" }).waitFor({ timeout: 75_000 }).then(() => true).catch(() => false);
      item(`${n}.testar-certo`, "Testar com os dados certos dá 'Deu certo' (ponto de partida do erro no Conectar)", testou, testou ? "" : (await painel.locator("[role=alert]").count()) ? await painel.locator("[role=alert]").first().innerText() : "sem aviso");
      if (testou) {
        await p.route(
          (u) => u.pathname === "/api/v1/channels/email",
          async (rota) => {
            const req = rota.request();
            if (req.method() !== "POST") return rota.continue();
            const corpo = JSON.parse(req.postData() ?? "{}");
            corpo.senha = "senha-errada-t044-rodada2";
            return rota.continue({ postData: JSON.stringify(corpo) });
          },
        );
        await p.getByRole("button", { name: "Conectar", exact: true }).click();
        await esperarErro("erro-conectar-senha-errada");
        item(`${n}.conectar-sem-caixa`, "Conectar que falhou não cria cartão de caixa e o botão Conectar volta a travar", (await p.locator('[data-testid="caixa-email"]').count()) === 0 && (await p.getByRole("button", { name: "Conectar", exact: true }).isDisabled()));
        await foto(p, "conectar-senha-errada");
        await p.unrouteAll({ behavior: "ignoreErrors" });
      }
      // (b) senha errada no Testar
      await p.fill("#email-senha", "senha-errada-t044-rodada2");
      await p.getByRole("button", { name: "Testar", exact: true }).click();
      await esperarErro("erro-testar-senha-errada");
      await foto(p, "testar-senha-errada");
      // (c) servidor inválido no Testar
      await p.fill("#email-senha", em.SENHA1);
      await p.fill("#email-imap-host", "servidor-que-nao-existe.invalid");
      await p.getByRole("button", { name: "Testar", exact: true }).click();
      await esperarErro("erro-testar-servidor-invalido");
      await foto(p, "testar-servidor-invalido");
      writeFileSync(join(EVIDENCIA, `${n}-frases-de-erro.json`), mascara(JSON.stringify(frasesDeErro, null, 2)));
      item(`${n}.sem-caixa`, "(banco) nenhuma caixa ficou ativa depois dos erros", (await caixasAtivas()).length === 0);
    });
  } finally {
    if (est.onboardedOriginal !== undefined) await patchOrg({ onboarded_at: est.onboardedOriginal });
  }
}

const falhas = resultados.filter((r) => r.resultado === "FALHOU").length;
writeFileSync(join(EVIDENCIA, `${n}-${passo}.json`), JSON.stringify({ passo, quando: new Date().toISOString(), resultados, achados }, null, 2));
console.log(falhas === 0 ? `\nPASSO ${passo}: nenhum item FALHOU` : `\nPASSO ${passo}: ${falhas} item(ns) FALHOU`);
process.exit(falhas === 0 ? 0 : 1);
