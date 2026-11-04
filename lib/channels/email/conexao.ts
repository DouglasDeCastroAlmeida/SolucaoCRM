/**
 * Conexão com a caixa de e-mail (mudança 005): entrar por IMAP, falar com o SMTP e
 * dizer, em português claro, por que não deu.
 *
 * ─── O que este arquivo garante ──────────────────────────────────────────────
 *
 * - O destino passa por `validarDestino` ANTES de qualquer socket, e a conexão vai
 *   para o IP que ele devolveu, com o nome original só como `servername` do TLS.
 *   Resolver de novo dentro da biblioteca reabriria a janela de DNS rebinding.
 * - TLS sempre verificado (`rejectUnauthorized: true`); nada de conexão aberta: porta
 *   com STARTTLS EXIGE o upgrade.
 * - A senha mora só nos argumentos desta chamada. O resultado devolvido é montado de
 *   frases fixas: nunca repassa o texto do erro do servidor, que às vezes ecoa
 *   credencial. Falha de senha NÃO é repetida (a conta do cliente pode ser bloqueada).
 * - Conexão curta: abre, confere, fecha. Nenhuma conexão fica pendurada.
 *
 * As dependências de rede entram por parâmetro para o teste usar servidores simulados.
 */
import { ImapFlow } from "imapflow";
import { createTransport } from "nodemailer";

import { classificarFalhaDeAlcance, type FalhaDeAlcance } from "@/lib/net/alcance";

import { validarDestino, type ResolvedorDns } from "./destino-seguro";

export type SegurancaDaConexao = "ssl" | "starttls";

export interface ServidorDaCaixa {
  host: string;
  porta: number;
  seguranca: SegurancaDaConexao;
}

export interface ConfigDaCaixa {
  /** O endereço da caixa (From, e destino do e-mail de teste). */
  endereco: string;
  usuario: string;
  /** Só em memória, só nesta chamada. */
  senha: string;
  imap: ServidorDaCaixa;
  smtp: ServidorDaCaixa;
}

export type CausaDaFalha =
  | "senha_recusada"
  | "verificacao_em_duas_etapas"
  | "servidor_nao_encontrado"
  | "servidor_invalido"
  | "porta_fechada"
  | "porta_nao_permitida"
  | "servidor_inalcancavel"
  | "tempo_esgotado"
  | "certificado_recusado"
  | "destino_proibido"
  | "envio_recusado"
  | "desconhecida";

export type EtapaDaConexao = "leitura" | "envio";

export type ResultadoDaVerificacao =
  | { ok: true; uidValidity: string; uidNext: number; testeEnviado: boolean }
  | { ok: false; causa: CausaDaFalha; etapa: EtapaDaConexao; mensagem: string };

/**
 * As frases (pt-BR; a rota passa por `traduzir`). Fixas de propósito: nunca recebem o
 * texto do erro do servidor.
 */
export const MENSAGEM_DA_CAUSA: Record<CausaDaFalha, string> = {
  senha_recusada:
    "O servidor recusou o usuário ou a senha. Confira os dois e tente de novo. Em provedores como o Gmail, use a senha de app, não a senha normal da conta.",
  verificacao_em_duas_etapas:
    "O provedor exige uma senha de app. Ligue a verificação em duas etapas na sua conta, crie uma senha de app e cole-a aqui no lugar da senha normal.",
  servidor_nao_encontrado:
    "Não encontramos esse servidor. Confira o endereço do servidor (por exemplo, imap.seudominio.com) e tente de novo.",
  servidor_invalido:
    "O endereço do servidor parece inválido. Informe só o nome do servidor, por exemplo imap.seudominio.com.",
  porta_fechada:
    "O servidor foi encontrado, mas não aceitou a conexão nessa porta. Confira a porta e o tipo de segurança (normalmente 993 para leitura e 465 ou 587 para envio).",
  porta_nao_permitida: "Essa porta não é de e-mail. Use 993 ou 143 para leitura e 465 ou 587 para envio.",
  servidor_inalcancavel:
    "Não conseguimos chegar até o servidor. Ele pode estar desligado ou bloqueado por um firewall.",
  tempo_esgotado: "O servidor demorou demais para responder. Tente de novo em alguns minutos.",
  certificado_recusado:
    "O certificado de segurança do servidor não é válido para esse endereço. Confira se o endereço do servidor está certo.",
  destino_proibido:
    "Esse endereço de servidor não é permitido, porque aponta para uma rede interna. Use o servidor de e-mail do seu provedor.",
  envio_recusado:
    "Entramos na caixa, mas o servidor recusou o e-mail de teste. Confira se esse usuário pode enviar mensagens por esse servidor de envio.",
  desconhecida:
    "Não foi possível concluir a conexão e não identificamos a causa. Confira os dados e tente de novo.",
};

/** O que usamos do imapflow. Estreito de propósito: é o que o teste simula. */
export interface ClienteImap {
  connect(): Promise<void>;
  mailboxOpen(caminho: string, opcoes?: { readOnly?: boolean }): Promise<{ uidValidity: bigint; uidNext: number; exists: number }>;
  logout(): Promise<unknown>;
  close(): void;
}

export interface OpcoesImap {
  host: string;
  port: number;
  secure: boolean;
  doSTARTTLS?: boolean;
  servername: string;
  auth: { user: string; pass: string };
  tls: { servername: string; rejectUnauthorized: true };
  logger: false;
  connectionTimeout: number;
  greetingTimeout: number;
  socketTimeout: number;
}

/** O que usamos do transporte do nodemailer. */
export interface TransporteSmtp {
  verify(): Promise<unknown>;
  sendMail(mensagem: Record<string, unknown>): Promise<{ accepted: unknown[]; rejected: unknown[]; messageId: string }>;
  close(): void;
}

export interface OpcoesSmtp {
  host: string;
  port: number;
  secure: boolean;
  requireTLS: boolean;
  name?: string;
  auth: { user: string; pass: string };
  tls: { servername: string; rejectUnauthorized: true };
  connectionTimeout: number;
  greetingTimeout: number;
  socketTimeout: number;
}

export interface DependenciasDaConexao {
  resolver?: ResolvedorDns;
  criarImap?: (opcoes: OpcoesImap) => ClienteImap;
  criarSmtp?: (opcoes: OpcoesSmtp) => TransporteSmtp;
}

const PRAZO_DE_CONEXAO_MS = 15_000;
const PRAZO_DE_SOCKET_MS = 30_000;

const criarImapPadrao = (opcoes: OpcoesImap): ClienteImap => {
  const cliente = new ImapFlow(opcoes);
  // Sem ouvinte, um erro de socket depois do connect derrubaria o processo.
  cliente.on("error", () => undefined);
  return cliente as unknown as ClienteImap;
};

const criarSmtpPadrao = (opcoes: OpcoesSmtp): TransporteSmtp =>
  createTransport(opcoes) as unknown as TransporteSmtp;

/** O provedor está dizendo "use senha de app / ligue a verificação em duas etapas". */
const PEDE_SENHA_DE_APP =
  /application-specific password|app password|app-specific|senha de app|2-?step|two-?step|less secure|web login required|AUTHENTICATIONFAILED.*(web|app)/i;

function campoTexto(erro: unknown, campo: string): string {
  const valor = (erro as Record<string, unknown> | null)?.[campo];
  return typeof valor === "string" ? valor : "";
}

function textoParaClassificar(erro: unknown): string {
  return [campoTexto(erro, "message"), campoTexto(erro, "responseText"), campoTexto(erro, "response")].join(" ");
}

function ehRecusaDeAutenticacao(erro: unknown): boolean {
  const e = erro as { authenticationFailed?: unknown; code?: unknown; responseCode?: unknown } | null;
  if (e?.authenticationFailed === true) return true;
  if (e?.code === "EAUTH") return true;
  return e?.responseCode === 535 || e?.responseCode === 534;
}

const DO_ALCANCE: Record<FalhaDeAlcance, CausaDaFalha> = {
  endereco_nao_resolve: "servidor_nao_encontrado",
  conexao_recusada: "porta_fechada",
  host_inalcancavel: "servidor_inalcancavel",
  tempo_esgotado: "tempo_esgotado",
  tls_recusado: "certificado_recusado",
  indeterminada: "desconhecida",
};

/** Do erro cru para a causa que a pessoa entende. Nunca devolve o texto do erro. */
export function causaDoErro(erro: unknown, etapa: EtapaDaConexao): CausaDaFalha {
  if (ehRecusaDeAutenticacao(erro)) {
    return PEDE_SENHA_DE_APP.test(textoParaClassificar(erro)) ? "verificacao_em_duas_etapas" : "senha_recusada";
  }
  const e = erro as { tlsFailed?: unknown; code?: unknown; responseCode?: unknown } | null;
  if (e?.tlsFailed === true) return "certificado_recusado";
  // O servidor SMTP aceitou o login e recusou a mensagem (EMESSAGE/EENVELOPE, 5xx).
  if (etapa === "envio" && (e?.code === "EMESSAGE" || e?.code === "EENVELOPE" || typeof e?.responseCode === "number")) {
    return "envio_recusado";
  }
  return DO_ALCANCE[classificarFalhaDeAlcance(erro)];
}

function falha(causa: CausaDaFalha, etapa: EtapaDaConexao): ResultadoDaVerificacao {
  return { ok: false, causa, etapa, mensagem: MENSAGEM_DA_CAUSA[causa] };
}

const CAUSA_DO_DESTINO = {
  host_invalido: "servidor_invalido",
  porta_proibida: "porta_nao_permitida",
  nao_resolve: "servidor_nao_encontrado",
  ip_proibido: "destino_proibido",
} as const satisfies Record<string, CausaDaFalha>;

/** Entra na caixa de entrada (somente leitura) e confere o servidor de envio. */
export async function verificarCaixa(
  cfg: ConfigDaCaixa,
  opcoes: { enviarTeste: boolean },
  deps: DependenciasDaConexao = {},
): Promise<ResultadoDaVerificacao> {
  const destinoImap = await validarDestino(cfg.imap.host, cfg.imap.porta, { resolver: deps.resolver });
  if (!destinoImap.ok) return falha(CAUSA_DO_DESTINO[destinoImap.motivo], "leitura");
  const destinoSmtp = await validarDestino(cfg.smtp.host, cfg.smtp.porta, { resolver: deps.resolver });
  if (!destinoSmtp.ok) return falha(CAUSA_DO_DESTINO[destinoSmtp.motivo], "envio");

  const auth = { user: cfg.usuario, pass: cfg.senha };

  // 1. Leitura: entrar e abrir a caixa de entrada (só leitura, nada é marcado).
  const imap = (deps.criarImap ?? criarImapPadrao)({
    host: destinoImap.ip,
    port: destinoImap.porta,
    secure: cfg.imap.seguranca === "ssl",
    ...(cfg.imap.seguranca === "starttls" ? { doSTARTTLS: true } : {}),
    servername: destinoImap.servername,
    auth,
    tls: { servername: destinoImap.servername, rejectUnauthorized: true },
    logger: false,
    connectionTimeout: PRAZO_DE_CONEXAO_MS,
    greetingTimeout: PRAZO_DE_CONEXAO_MS,
    socketTimeout: PRAZO_DE_SOCKET_MS,
  });
  let uidValidity: string;
  let uidNext: number;
  try {
    await imap.connect();
    const caixa = await imap.mailboxOpen("INBOX", { readOnly: true });
    uidValidity = String(caixa.uidValidity);
    uidNext = caixa.uidNext;
    await imap.logout();
  } catch (erro) {
    try {
      imap.close();
    } catch {
      // já fechada
    }
    return falha(causaDoErro(erro, "leitura"), "leitura");
  }

  // 2. Envio: conferir o login e, se pedido, mandar o e-mail de teste para a própria caixa.
  const smtp = (deps.criarSmtp ?? criarSmtpPadrao)(opcoesSmtp(cfg, destinoSmtp, auth));
  try {
    await smtp.verify();
    if (opcoes.enviarTeste) {
      await smtp.sendMail({
        from: cfg.endereco,
        to: cfg.endereco,
        subject: "Teste de conexão da caixa de e-mail",
        text: "Este e-mail confirma que a sua caixa de e-mail foi conectada com sucesso. Você pode apagá-lo.",
        // Marca de e-mail automático: a regra de entrada não pode tratá-lo como cliente.
        headers: { "Auto-Submitted": "auto-generated", "X-Auto-Response-Suppress": "All" },
      });
    }
  } catch (erro) {
    return falha(causaDoErro(erro, "envio"), "envio");
  } finally {
    try {
      smtp.close();
    } catch {
      // já fechado
    }
  }
  return { ok: true, uidValidity, uidNext, testeEnviado: opcoes.enviarTeste };
}

function opcoesSmtp(
  cfg: ConfigDaCaixa,
  destino: { ip: string; porta: number; servername: string },
  auth: { user: string; pass: string },
): OpcoesSmtp {
  return {
    host: destino.ip,
    port: destino.porta,
    secure: cfg.smtp.seguranca === "ssl",
    requireTLS: cfg.smtp.seguranca === "starttls",
    // Sem `name`, o nodemailer se apresenta com o IP/host; o nome do servidor é o que o TLS já conferiu.
    name: destino.servername,
    auth,
    tls: { servername: destino.servername, rejectUnauthorized: true },
    connectionTimeout: PRAZO_DE_CONEXAO_MS,
    greetingTimeout: PRAZO_DE_CONEXAO_MS,
    socketTimeout: PRAZO_DE_SOCKET_MS,
  };
}

export type ResultadoDoEnvio =
  | { ok: true; messageId: string }
  | { ok: false; causa: CausaDaFalha; mensagem: string };

/**
 * Envia UMA mensagem pelo SMTP da caixa (mudança 005, Fatia 5). Mesma guarda de destino e
 * mesmo TLS verificado da conexão; o resultado é montado de frases fixas, nunca do texto que o
 * servidor devolveu (que às vezes ecoa credencial ou o endereço de quem recebe).
 */
export async function enviarMensagemSmtp(
  cfg: ConfigDaCaixa,
  mensagem: Record<string, unknown>,
  deps: DependenciasDaConexao = {},
): Promise<ResultadoDoEnvio> {
  const destino = await validarDestino(cfg.smtp.host, cfg.smtp.porta, { resolver: deps.resolver });
  if (!destino.ok) {
    const causa = CAUSA_DO_DESTINO[destino.motivo];
    return { ok: false, causa, mensagem: MENSAGEM_DA_CAUSA[causa] };
  }
  const smtp = (deps.criarSmtp ?? criarSmtpPadrao)(opcoesSmtp(cfg, destino, { user: cfg.usuario, pass: cfg.senha }));
  try {
    const r = await smtp.sendMail(mensagem);
    if (Array.isArray(r.rejected) && r.rejected.length > 0 && (r.accepted ?? []).length === 0) {
      return { ok: false, causa: "envio_recusado", mensagem: MENSAGEM_DA_CAUSA.envio_recusado };
    }
    return { ok: true, messageId: r.messageId };
  } catch (erro) {
    const causa = causaDoErro(erro, "envio");
    return { ok: false, causa, mensagem: MENSAGEM_DA_CAUSA[causa] };
  } finally {
    try {
      smtp.close();
    } catch {
      // já fechado
    }
  }
}
