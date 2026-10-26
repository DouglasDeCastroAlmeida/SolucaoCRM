/**
 * Os e-mails de ACESSO (confirmação, convite, recuperação, link mágico, troca de
 * e-mail, reautenticação) montados POR NÓS a partir do gancho do GoTrue, com a
 * identidade da marca do endereço em que o pedido nasceu (REQ-006).
 *
 * Pura: recebe a marca já resolvida e a base do link; não lê banco nem relógio.
 * Tema claro, estilo inline, mesma paleta de neutros dos outros e-mails
 * (`NEUTROS_DE_SAIDA`). Nunca cita nome, logo ou domínio que não seja o da marca
 * recebida (AC-006.4): tudo o que aparece vem dos argumentos.
 */
import { marcaDaSaida, NEUTROS_DE_SAIDA, type MarcaDeSaida } from "@/lib/branding/saida";
import type { Brand } from "@/lib/brands/tipos";

export const ACOES_DE_ACESSO = [
  "signup",
  "invite",
  "recovery",
  "magiclink",
  "email_change",
  "reauthentication",
] as const;
export type AcaoDeAcesso = (typeof ACOES_DE_ACESSO)[number];

type Copia = { assunto: string; titulo: string; corpo: (m: string) => string; botao: string; rodape: string };

const COPIA: Record<AcaoDeAcesso, Copia> = {
  signup: {
    assunto: "Confirme seu e-mail",
    titulo: "Confirme seu e-mail",
    corpo: (m) => `Sua conta no ${m} está quase pronta. Clique no botão abaixo para confirmar seu e-mail.`,
    botao: "Confirmar e-mail",
    rodape: "Se você não criou esta conta, ignore este e-mail.",
  },
  invite: {
    assunto: "Você foi convidado",
    titulo: "Você foi convidado",
    corpo: (m) => `Você recebeu um convite para acessar o ${m}. Clique no botão abaixo para aceitar e criar sua senha.`,
    botao: "Aceitar convite",
    rodape: "Se você não esperava este convite, ignore este e-mail.",
  },
  recovery: {
    assunto: "Redefinir sua senha",
    titulo: "Redefinir sua senha",
    corpo: (m) => `Recebemos um pedido para redefinir a senha da sua conta no ${m}. Clique no botão abaixo para escolher uma nova.`,
    botao: "Definir nova senha",
    rodape: "Se não foi você quem pediu, ignore este e-mail — sua senha continua a mesma.",
  },
  magiclink: {
    assunto: "Seu link de acesso",
    titulo: "Seu link de acesso",
    corpo: (m) => `Use o botão abaixo para entrar no ${m}.`,
    botao: "Entrar",
    rodape: "Se não foi você quem pediu, ignore este e-mail.",
  },
  email_change: {
    assunto: "Confirme a troca de e-mail",
    titulo: "Confirme a troca de e-mail",
    corpo: (m) => `Recebemos um pedido para trocar o e-mail da sua conta no ${m}. Clique no botão abaixo para confirmar.`,
    botao: "Confirmar troca",
    rodape: "Se não foi você quem pediu, ignore este e-mail e avise o suporte.",
  },
  reauthentication: {
    assunto: "Seu código de confirmação",
    titulo: "Seu código de confirmação",
    corpo: (m) => `Use o código abaixo para confirmar a operação na sua conta no ${m}.`,
    botao: "",
    rodape: "Se não foi você quem pediu, ignore este e-mail.",
  },
};

/** O `type` que o `/auth/confirm` espera no `verifyOtp`. */
const TIPO_DO_LINK: Record<Exclude<AcaoDeAcesso, "reauthentication">, string> = {
  signup: "signup",
  invite: "invite",
  recovery: "recovery",
  magiclink: "magiclink",
  email_change: "email_change",
};

export type EntradaDoEmailDeAcesso = {
  acao: AcaoDeAcesso;
  marca: MarcaDeSaida;
  senderName: string | null | undefined;
  replyTo: string | null | undefined;
  supportEmail: string | null | undefined;
  /** `https://<domínio da marca>` — sem barra final. */
  baseUrl: string;
  tokenHash: string;
  /** Código de 6 dígitos (reautenticação). */
  token: string | null | undefined;
};

export type EmailDeAcesso = {
  subject: string;
  html: string;
  text: string;
  fromName: string;
  replyTo?: string;
  link: string | null;
};

function esc(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

export function montarEmailDeAcesso(e: EntradaDoEmailDeAcesso): EmailDeAcesso {
  const c = COPIA[e.acao];
  const nome = e.marca.nome;
  const link =
    e.acao === "reauthentication"
      ? null
      : `${e.baseUrl.replace(/\/+$/, "")}/auth/confirm?token_hash=${encodeURIComponent(e.tokenHash)}&type=${TIPO_DO_LINK[e.acao]}`;

  const logo = e.marca.logoUrl
    ? `<p style="margin:0 0 24px"><img src="${esc(e.marca.logoUrl)}" alt="${esc(nome)}" height="40" style="height:40px;width:auto;max-width:200px;border:0;display:block"></p>`
    : "";
  const acao = link
    ? `<p style="margin:24px 0"><a href="${esc(link)}" style="display:inline-block;padding:12px 24px;background:${e.marca.accent};color:${e.marca.accentFg};border-radius:6px;text-decoration:none;font-weight:600">${esc(c.botao)}</a></p>
    <p style="margin:0 0 8px;font-size:13px;color:${NEUTROS_DE_SAIDA.suave}">Ou copie e cole este link no navegador:<br><span style="word-break:break-all;color:${e.marca.accent}">${esc(link)}</span></p>`
    : `<p style="margin:24px 0;font-size:28px;letter-spacing:6px;font-weight:700">${esc(e.token ?? "")}</p>`;
  const suporte = e.supportEmail
    ? `<p style="margin:8px 0 0;font-size:13px;color:${NEUTROS_DE_SAIDA.suave}">Dúvidas? Fale com ${esc(e.supportEmail)}.</p>`
    : "";

  const html = `<!doctype html>
<html lang="pt-BR">
<body style="margin:0;padding:0;background:${NEUTROS_DE_SAIDA.fundo};font-family:system-ui,-apple-system,Segoe UI,sans-serif;color:${NEUTROS_DE_SAIDA.texto}">
  <div style="max-width:560px;margin:0 auto;padding:32px 24px">
    ${logo}
    <h1 style="font-size:22px;line-height:1.3;margin:0 0 16px;color:${NEUTROS_DE_SAIDA.texto}">${esc(c.titulo)}</h1>
    <p style="margin:0 0 16px;font-size:15px;line-height:1.5">${esc(c.corpo(nome))}</p>
    ${acao}
    <p style="margin:24px 0 0;font-size:13px;color:${NEUTROS_DE_SAIDA.suave}">${esc(c.rodape)}</p>
    ${suporte}
  </div>
</body>
</html>`;

  const text = [
    c.titulo,
    "",
    c.corpo(nome),
    "",
    link ?? (e.token ?? ""),
    "",
    c.rodape,
    ...(e.supportEmail ? ["", `Dúvidas? Fale com ${e.supportEmail}.`] : []),
  ].join("\n");

  const sender = (e.senderName ?? "").trim();
  const reply = (e.replyTo ?? "").trim();
  return {
    subject: `${c.assunto} · ${nome}`,
    html,
    text,
    fromName: sender !== "" ? sender : nome,
    ...(reply !== "" ? { replyTo: reply } : {}),
    link,
  };
}

/**
 * A marca de saída (tema claro, accent legível) de uma MARCA. Marca que não é a
 * padrão e não definiu `app_name` mostra o próprio NOME — herdar da instalação
 * poria o nome da plataforma no e-mail de outra marca (AC-006.4). Só a marca
 * padrão herda, por construção (ADR-002). Nunca lança (`marcaDaSaida` não lança).
 */
export async function marcaDeSaidaDaMarca(marca: Brand): Promise<MarcaDeSaida> {
  const nomeProprio = (marca.app_name ?? "").trim();
  const appName = nomeProprio !== "" ? nomeProprio : marca.is_default ? null : marca.name;
  return marcaDaSaida(null, { ...marca, app_name: appName });
}
