/**
 * O gancho "Send Email" do GoTrue (REQ-006), sem I/O próprio: tudo o que toca o
 * mundo entra por `DepsDoGancho`, e a rota (`app/api/hooks/auth/send-email`) só
 * monta as dependências reais.
 *
 * Ordem: assinatura → formato → idempotência (webhook-id) → marca do contexto →
 * montagem → envio. Falha de envio devolve 500 com `email_hook_send_failed`
 * (o GoTrue repassa a mensagem ao app, que mostra o aviso), libera o webhook-id
 * (a retentativa do GoTrue precisa poder enviar) e deixa Sentry + auditoria.
 *
 * Nada de segredo, token ou e-mail em claro nos alertas: só `email_hash`.
 */
import { z } from "zod";

import { hashEmail } from "@/lib/audit";
import { montarEmailDeAcesso, type AcaoDeAcesso } from "@/lib/email/acesso-da-marca";
import type { MarcaDeSaida } from "@/lib/branding/saida";
import type { Brand } from "@/lib/brands/tipos";

import { assinaturaValida } from "./assinatura";

export const MENSAGEM_DE_FALHA_DO_GANCHO = "email_hook_send_failed";

export interface RepositorioDoGancho {
  registrarEntrega(webhookId: string): Promise<"nova" | "repetida">;
  apagarEntrega(webhookId: string): Promise<void>;
  /** A marca ATIVA gravada em `brand_email_context` para (e-mail, ação); `null` se não houver. */
  marcaDoContexto(email: string, acao: string): Promise<Brand | null>;
  marcaPadrao(): Promise<Brand>;
  /** Hosts ativos da marca (`brand_domains`). */
  hostsDaMarca(brandId: string): Promise<string[]>;
}

export interface DepsDoGancho {
  segredo: string;
  agoraMs: () => number;
  /** `NEXT_PUBLIC_APP_URL` — base dos links da marca padrão. */
  appUrl: string;
  repo: RepositorioDoGancho;
  marcaDeSaida: (marca: Brand) => Promise<MarcaDeSaida>;
  enviar: (args: {
    to: string;
    subject: string;
    html: string;
    text: string;
    replyTo?: string;
    fromName?: string;
    tags?: { name: string; value: string }[];
  }) => Promise<{ ok: boolean; error?: string; details?: string; via?: string }>;
  reportar: (erro: Error, contexto: Record<string, unknown>) => void;
  auditar: (entrada: { action: string; resourceType?: string; metadata: Record<string, unknown> }) => Promise<void>;
}

export type PedidoDoGancho = { corpo: string; id: string; timestamp: string; assinatura: string };
export type RespostaDoGancho = { status: number; corpo: Record<string, unknown> };

const PayloadSchema = z.object({
  user: z.object({ email: z.string().email().max(320), new_email: z.string().email().max(320).nullish() }),
  email_data: z.object({
    token: z.string().max(64).nullish(),
    token_hash: z.string().max(512),
    token_hash_new: z.string().max(512).nullish(),
    redirect_to: z.string().max(2048).nullish(),
    email_action_type: z.enum(["signup", "invite", "recovery", "magiclink", "email_change", "reauthentication"]),
  }),
});

function hostDe(url: string | null | undefined): string | null {
  if (!url) return null;
  try {
    return new URL(url).host.toLowerCase();
  } catch {
    return null;
  }
}

/**
 * A base (`https://host`) do link. O host do `redirect_to` só vale se for um
 * domínio ATIVO desta marca; do contrário, o primeiro domínio da marca; sem
 * domínio, o endereço do app. Nunca o host de outra marca (AC-006.4).
 */
export function baseDoLink(e: {
  redirectTo: string | null | undefined;
  marca: Brand;
  hosts: string[];
  appUrl: string;
}): string | null {
  const doApp = e.appUrl.replace(/\/+$/, "");
  if (e.marca.is_default) return doApp;
  const hosts = e.hosts.map((h) => h.toLowerCase());
  const doRedirect = hostDe(e.redirectTo);
  const escolhido = doRedirect && hosts.includes(doRedirect) ? doRedirect : hosts[0];
  // Marca que não é a padrão e não tem domínio ativo: NÃO cai no endereço da plataforma.
  return escolhido ? `https://${escolhido}` : null;
}

/** Falha com código fixo e sem PII: é o único texto que vai ao Sentry e à auditoria. */
class FalhaDoGancho extends Error {
  constructor(readonly codigo: string) {
    super(codigo);
  }
}

const FALHA: RespostaDoGancho = {
  status: 500,
  corpo: { error: { http_code: 500, message: MENSAGEM_DE_FALHA_DO_GANCHO } },
};

export async function processarGanchoDeEmail(
  pedido: PedidoDoGancho,
  deps: DepsDoGancho,
): Promise<RespostaDoGancho> {
  if (
    !assinaturaValida({
      id: pedido.id,
      timestamp: pedido.timestamp,
      assinatura: pedido.assinatura,
      corpo: pedido.corpo,
      segredo: deps.segredo,
      agoraSeg: Math.floor(deps.agoraMs() / 1000),
    })
  ) {
    return { status: 401, corpo: { error: { code: "invalid_signature" } } };
  }

  let json: unknown;
  try {
    json = JSON.parse(pedido.corpo);
  } catch {
    return { status: 400, corpo: { error: { code: "invalid_payload" } } };
  }
  const parsed = PayloadSchema.safeParse(json);
  if (!parsed.success) return { status: 400, corpo: { error: { code: "invalid_payload" } } };
  const { user, email_data: dados } = parsed.data;
  const acao: AcaoDeAcesso = dados.email_action_type;
  const emailHash = hashEmail(user.email);

  let marcaId: string | null = null;
  try {
    if ((await deps.repo.registrarEntrega(pedido.id)) === "repetida") {
      return { status: 200, corpo: {} };
    }
    const marca = (await deps.repo.marcaDoContexto(user.email, acao)) ?? (await deps.repo.marcaPadrao());
    marcaId = marca.id;
    const hosts = marca.is_default ? [] : await deps.repo.hostsDaMarca(marca.id);
    const trocaDeEmail = acao === "email_change" && user.new_email;
    const base = baseDoLink({ redirectTo: dados.redirect_to, marca, hosts, appUrl: deps.appUrl });
    if (base === null) throw new FalhaDoGancho("marca_sem_dominio_ativo");
    const email = montarEmailDeAcesso({
      acao,
      marca: await deps.marcaDeSaida(marca),
      senderName: marca.sender_name,
      replyTo: marca.reply_to,
      supportEmail: marca.support_email,
      baseUrl: base,
      tokenHash: trocaDeEmail ? (dados.token_hash_new ?? dados.token_hash) : dados.token_hash,
      token: dados.token,
    });

    const r = await deps.enviar({
      to: trocaDeEmail ? (user.new_email as string) : user.email,
      subject: email.subject,
      html: email.html,
      text: email.text,
      ...(email.replyTo ? { replyTo: email.replyTo } : {}),
      fromName: email.fromName,
      tags: [{ name: "kind", value: `auth_${acao}` }],
    });
    // Só o CÓDIGO do roteador (vocabulário fechado); o texto livre pode citar o destinatário.
    if (!r.ok) throw new FalhaDoGancho(`envio_falhou:${/^[a-z_]{1,40}$/.test(r.error ?? "") ? r.error : "desconhecido"}`);
    return { status: 200, corpo: {} };
  } catch (erro) {
    const motivo = erro instanceof FalhaDoGancho ? erro.codigo : "excecao";
    await deps.repo.apagarEntrega(pedido.id).catch(() => undefined);
    deps.reportar(new Error(`gancho de e-mail: ${motivo}`), { subsystem: "auth_email_hook", acao, brand_id: marcaId, motivo });
    await deps
      .auditar({
        action: "auth.email_hook_send_failed",
        resourceType: "auth_email",
        metadata: { acao, brand_id: marcaId, email_hash: emailHash, motivo },
      })
      .catch(() => undefined);
    return FALHA;
  }
}
