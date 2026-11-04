// Sonda real de e-mail (005, T-001 / AC-009.1). Nao imprime e-mail completo nem senha.
// Uso: SONDA_EMAIL_MODULOS=<pasta com node_modules> SONDA_EMAIL_ENV=<arquivo .env> node scripts/sondas/sonda-email-real.mjs
import { createRequire } from "node:module";
import { readFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

const pasta = process.env.SONDA_EMAIL_MODULOS;
if (!pasta) { console.error("Defina SONDA_EMAIL_MODULOS (pasta que contem node_modules com imapflow, nodemailer)."); process.exit(2); }
const req = createRequire(join(pasta, "package.json"));
const { ImapFlow } = req("imapflow");
const nodemailer = req("nodemailer");

const arq = process.env.SONDA_EMAIL_ENV || join(homedir(), ".secrets", "senha_email_teste.env");
const env = {};
for (const l of readFileSync(arq, "utf8").split(/\r?\n/)) {
  const m = l.match(/^\s*(\w+)\s*=\s*(.*?)\s*$/);
  if (m) env[m[1]] = m[2].replace(/^["']|["']$/g, "");
}
const email = env.email || env.EMAIL1, senha = (env.senha || env.SENHA1 || "").replace(/\s+/g, "");
if (!email || !senha) { console.error("Arquivo sem email/senha."); process.exit(2); }

const mascE = (e) => e.replace(/^(.).*(@.*)$/, "$1***$2");
const limpa = (s) => String(s ?? "").split(email).join("<email>").split(senha).join("<senha>");
const dominio = email.split("@")[1].toLowerCase();
const PROV = {
  "gmail.com": { imap: "imap.gmail.com", smtp: "smtp.gmail.com" },
  "googlemail.com": { imap: "imap.gmail.com", smtp: "smtp.gmail.com" },
  "outlook.com": { imap: "outlook.office365.com", smtp: "smtp-mail.outlook.com" },
  "hotmail.com": { imap: "outlook.office365.com", smtp: "smtp-mail.outlook.com" },
};
// Servidor proprio (ex.: o de teste da hml): EMAIL_HOST no arquivo de credenciais, mesmo host para IMAP e SMTP.
const p = env.EMAIL_HOST ? { imap: env.EMAIL_HOST, smtp: env.EMAIL_HOST } : PROV[dominio];
const log = (...a) => console.log(...a);
log(`conta: ${mascE(email)} dominio: ${dominio} provedor: ${p ? "conhecido" : "desconhecido"}`);
if (!p) { log("PARADO: dominio sem preset."); process.exit(3); }

const marca = `sonda-005-${Date.now()}`;
const imap = new ImapFlow({ host: p.imap, port: 993, secure: true, auth: { user: email, pass: senha }, logger: false });
imap.on("error", () => {});
try {
  await imap.connect();
  log("IMAP login: OK (993 TLS)");
  const lock = await imap.getMailboxLock("INBOX");
  try {
    log(`INBOX: ${imap.mailbox.exists} mensagens, uidValidity presente: ${!!imap.mailbox.uidValidity}`);
    let n = 0;
    for await (const m of imap.fetch("1:*", { envelope: true }, { })) { if (++n >= 3) break; }
    // cabecalhos das 3 mais recentes
    const total = imap.mailbox.exists, ini = Math.max(1, total - 2);
    if (total > 0) { let c = 0; for await (const m of imap.fetch(`${ini}:*`, { envelope: true })) { c++; } log(`cabecalhos lidos (ultimas): ${c}`); }
  } finally { lock.release(); }
} catch (e) {
  log(`IMAP FALHOU: ${limpa(e.responseText || e.message)} | codigo: ${limpa(e.authenticationFailed ? "authenticationFailed" : e.code || "")}`);
  try { await imap.logout(); } catch {}
  process.exit(4);
}

let porta = 465;
try {
  let tr = nodemailer.createTransport({ host: p.smtp, port: 465, secure: true, auth: { user: email, pass: senha } });
  let info;
  try { info = await tr.sendMail({ from: email, to: email, subject: marca, text: "Mensagem de teste da sonda 005." }); }
  catch (e1) {
    log(`SMTP 465 falhou: ${limpa(e1.response || e1.message)}; tentando 587`);
    porta = 587;
    tr = nodemailer.createTransport({ host: p.smtp, port: 587, secure: false, requireTLS: true, auth: { user: email, pass: senha } });
    info = await tr.sendMail({ from: email, to: email, subject: marca, text: "Mensagem de teste da sonda 005." });
  }
  log(`SMTP envio: OK (porta ${porta}) aceitos: ${info.accepted.length}`);
} catch (e) {
  log(`SMTP FALHOU: ${limpa(e.response || e.message)}`);
  await imap.logout().catch(() => {});
  process.exit(5);
}

let chegou = false;
for (let i = 0; i < 12 && !chegou; i++) {
  await new Promise((r) => setTimeout(r, 5000));
  const lock = await imap.getMailboxLock("INBOX");
  try {
    const uids = await imap.search({ subject: marca });
    if (uids && uids.length) chegou = true;
  } finally { lock.release(); }
}
log(`Chegada por IMAP: ${chegou ? "OK" : "NAO CHEGOU em 60s"}`);
if (chegou) {
  const lock = await imap.getMailboxLock("INBOX");
  try { const u = await imap.search({ subject: marca }); await imap.messageDelete(u, { uid: true }); log("mensagem de teste removida da caixa"); }
  catch (e) { log(`limpeza falhou: ${limpa(e.message)}`); } finally { lock.release(); }
}
await imap.logout().catch(() => {});
process.exit(chegou ? 0 : 6);
