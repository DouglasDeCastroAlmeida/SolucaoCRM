/**
 * Persistência e vocabulário da caixa de e-mail (mudança 005): a linha de
 * `channel_sessions` com `provider = 'email'`.
 *
 * Do lado de dentro do seam, como `graph-parceiro/session.ts`: a rota e a tela falam em
 * "caixa", "endereço" e "senha". Toda consulta leva `organization_id` À MÃO — o client é de
 * service role e ignora a RLS.
 *
 * A senha NÃO passa por aqui: vive cifrada em `email_credenciais` (`./segredo`). Esta
 * linha guarda só os últimos 4 caracteres em `email_config`.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import { z } from "zod";

import { metadataInicialDoCanal } from "@/lib/ai/elegibilidade/pre-go-live";

import { reactivateChannelSession } from "../reactivate";
import type { SegurancaDaConexao } from "./conexao";

export const TETO_DIARIO_PADRAO = 200;
export const TETO_DIARIO_MAXIMO = 2000;
export const INTERVALO_PADRAO_SEGUNDOS = 30;
export const INTERVALO_MAXIMO_SEGUNDOS = 3600;
const PROVIDER = "email";

// ─── Entrada (Zod) ───────────────────────────────────────────────────────────

const servidorSchema = z
  .object({
    host: z.string().trim().min(1).max(253),
    porta: z.number().int().min(1).max(65535),
    seguranca: z.enum(["ssl", "starttls"]),
  })
  .strict();

const enderecoSchema = z.string().trim().toLowerCase().max(254).email();

/** O que o assistente manda para testar: tudo que é preciso para entrar e enviar. */
export const dadosDeConexaoSchema = z
  .object({
    endereco: enderecoSchema,
    usuario: z.string().trim().min(1).max(254).optional(),
    senha: z.string().min(1).max(500),
    imap: servidorSchema,
    smtp: servidorSchema,
  })
  .strict();

/** Conectar = os dados da conexão + a configuração de uso da caixa. */
export const conectarSchema = dadosDeConexaoSchema.extend({
  assinatura: z.string().max(2000).optional(),
  teto_diario: z.number().int().min(1).max(TETO_DIARIO_MAXIMO).optional(),
  intervalo_segundos: z.number().int().min(0).max(INTERVALO_MAXIMO_SEGUNDOS).optional(),
});

export const alterarSchema = z
  .object({
    assinatura: z.string().max(2000).nullable().optional(),
    teto_diario: z.number().int().min(1).max(TETO_DIARIO_MAXIMO).optional(),
    intervalo_segundos: z.number().int().min(0).max(INTERVALO_MAXIMO_SEGUNDOS).optional(),
    senha: z.string().min(1).max(500).optional(),
  })
  .strict()
  .refine((v) => Object.keys(v).length > 0, { message: "informe ao menos um campo" });

// ─── Forma guardada ──────────────────────────────────────────────────────────

export interface ServidorGuardado {
  host: string;
  porta: number;
  seguranca: SegurancaDaConexao;
}

/** `channel_sessions.email_config`. Sem a senha: ela vive em `email_credenciais`. */
export interface ConfigDaCaixaGuardada {
  usuario: string;
  imap: ServidorGuardado;
  smtp: ServidorGuardado;
  senha_ultimos4: string;
  assinatura: string | null;
  teto_diario: number;
  intervalo_segundos: number;
}

export interface CaixaDeEmail {
  id: string;
  endereco: string;
  status: string | null;
  archivedAt: string | null;
  config: ConfigDaCaixaGuardada;
}

/** O que a API devolve de uma caixa. Lista branca: nada que não esteja aqui sai. */
export function visaoPublicaDaCaixa(c: CaixaDeEmail) {
  return {
    id: c.id,
    endereco: c.endereco,
    status: c.status,
    usuario: c.config.usuario,
    imap: c.config.imap,
    smtp: c.config.smtp,
    senha_ultimos4: c.config.senha_ultimos4,
    assinatura: c.config.assinatura,
    teto_diario: c.config.teto_diario,
    intervalo_segundos: c.config.intervalo_segundos,
  };
}

const COLUNAS = "id, email_address, email_config, status, archived_at";

function paraCaixa(row: Record<string, unknown> | null): CaixaDeEmail | null {
  if (!row) return null;
  const bruta = (row.email_config ?? {}) as Partial<ConfigDaCaixaGuardada>;
  const servidor = (s: Partial<ServidorGuardado> | undefined): ServidorGuardado => ({
    host: s?.host ?? "",
    porta: s?.porta ?? 0,
    seguranca: s?.seguranca === "starttls" ? "starttls" : "ssl",
  });
  return {
    id: row.id as string,
    endereco: row.email_address as string,
    status: (row.status as string) ?? null,
    archivedAt: (row.archived_at as string) ?? null,
    config: {
      usuario: bruta.usuario ?? (row.email_address as string),
      imap: servidor(bruta.imap),
      smtp: servidor(bruta.smtp),
      senha_ultimos4: bruta.senha_ultimos4 ?? "",
      assinatura: bruta.assinatura ?? null,
      teto_diario: bruta.teto_diario ?? TETO_DIARIO_PADRAO,
      intervalo_segundos: bruta.intervalo_segundos ?? INTERVALO_PADRAO_SEGUNDOS,
    },
  };
}

// ─── Consultas ───────────────────────────────────────────────────────────────

/** As caixas ATIVAS da organização. LANÇA se a consulta falha (vazio e "não sei" são coisas diferentes). */
export async function listarCaixas(admin: SupabaseClient, organizationId: string): Promise<CaixaDeEmail[]> {
  const { data, error } = await admin
    .from("channel_sessions")
    .select(COLUNAS)
    .eq("organization_id", organizationId)
    .eq("provider", PROVIDER)
    .is("archived_at", null)
    .order("created_at", { ascending: true });
  if (error) throw new Error(`email_caixas_lookup_failed: ${error.message}`);
  return ((data as Record<string, unknown>[] | null) ?? []).map((r) => paraCaixa(r)).filter((c): c is CaixaDeEmail => c !== null);
}

export async function acharCaixa(
  admin: SupabaseClient,
  organizationId: string,
  channelSessionId: string,
): Promise<CaixaDeEmail | null> {
  const { data, error } = await admin
    .from("channel_sessions")
    .select(COLUNAS)
    .eq("organization_id", organizationId)
    .eq("provider", PROVIDER)
    .eq("id", channelSessionId)
    .is("archived_at", null)
    .maybeSingle();
  if (error) throw new Error(`email_caixa_lookup_failed: ${error.message}`);
  return paraCaixa(data as Record<string, unknown> | null);
}

/** Por endereço, ATIVA primeiro: reconectar por cima de uma arquivada traz a linha de volta. */
export async function acharCaixaPorEndereco(
  admin: SupabaseClient,
  organizationId: string,
  endereco: string,
): Promise<CaixaDeEmail | null> {
  const { data, error } = await admin
    .from("channel_sessions")
    .select(COLUNAS)
    .eq("organization_id", organizationId)
    .eq("provider", PROVIDER)
    // `eq`, não `ilike`: `_` e `%` são curingas no ilike e `_` é válido em e-mail. O endereço já chega em minúsculas.
    .eq("email_address", endereco.toLowerCase())
    .order("archived_at", { ascending: true, nullsFirst: true })
    .order("created_at", { ascending: false })
    .limit(1);
  if (error) throw new Error(`email_caixa_lookup_failed: ${error.message}`);
  return paraCaixa((data as Record<string, unknown>[] | null)?.[0] ?? null);
}

// ─── Escrita ─────────────────────────────────────────────────────────────────

/** Cria a caixa (ou ressuscita a arquivada do mesmo endereço). A senha é gravada à parte. */
export async function salvarCaixa(
  admin: SupabaseClient,
  input: {
    organizationId: string;
    existente: CaixaDeEmail | null;
    endereco: string;
    config: ConfigDaCaixaGuardada;
    /** `webhook_secret_encrypted` é NOT NULL; a caixa não tem webhook, então vai um valor aleatório sem uso. */
    segredoSemUsoCifrado: string;
    userId: string;
    requestId: string;
  },
): Promise<{ error: string | null; channelSessionId: string | null }> {
  const linha = {
    organization_id: input.organizationId,
    provider: PROVIDER,
    email_address: input.endereco,
    email_config: input.config,
    display_name: input.endereco,
    status: "WORKING",
  };

  if (input.existente) {
    const r = await reactivateChannelSession(
      admin,
      {
        organizationId: input.organizationId,
        channelSessionId: input.existente.id,
        archivedAt: input.existente.archivedAt,
      },
      linha,
      { userId: input.userId, requestId: input.requestId, metadata: { provider: PROVIDER } },
    );
    return { error: r.error?.message ?? null, channelSessionId: input.existente.id };
  }

  const { data, error } = await admin
    .from("channel_sessions")
    .insert({
      ...linha,
      webhook_secret_encrypted: input.segredoSemUsoCifrado,
      metadata: metadataInicialDoCanal(),
    })
    .select("id")
    .maybeSingle();
  return { error: error?.message ?? null, channelSessionId: (data as { id: string } | null)?.id ?? null };
}

/** Troca a configuração guardada (assinatura, teto, intervalo, últimos 4 da senha). */
export async function atualizarConfigDaCaixa(
  admin: SupabaseClient,
  input: { organizationId: string; channelSessionId: string; config: ConfigDaCaixaGuardada },
): Promise<{ error: string | null }> {
  const { error } = await admin
    .from("channel_sessions")
    .update({ email_config: input.config })
    .eq("organization_id", input.organizationId)
    .eq("id", input.channelSessionId)
    .eq("provider", PROVIDER);
  return { error: error?.message ?? null };
}

/**
 * Apaga uma caixa que acabou de ser criada e não chegou a ficar inteira (sem senha).
 * Só para o rollback da conexão: caixa com histórico nunca é apagada, é arquivada.
 */
export async function descartarCaixa(
  admin: SupabaseClient,
  organizationId: string,
  channelSessionId: string,
): Promise<void> {
  await admin
    .from("channel_sessions")
    .delete()
    .eq("organization_id", organizationId)
    .eq("id", channelSessionId)
    .eq("provider", PROVIDER);
}

/**
 * Posiciona o cursor de leitura no FIM da caixa: só o que chegar depois da conexão é lido
 * (AC-002.6) e nada do passado é importado (AC-001.5). `ultimoUid` é o último UID que já
 * existia; a primeira rodada lê de `ultimoUid + 1` em diante.
 */
export async function iniciarCursor(
  admin: SupabaseClient,
  input: { organizationId: string; channelSessionId: string; uidValidity: string; ultimoUid: number },
): Promise<{ error: string | null }> {
  const { error } = await admin.from("email_sync_estado").upsert(
    {
      channel_session_id: input.channelSessionId,
      organization_id: input.organizationId,
      uidvalidity: input.uidValidity,
      ultimo_uid: input.ultimoUid,
      falhas_seguidas: 0,
      pausa_motivo: null,
      travado_ate: null,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "channel_session_id" },
  );
  return { error: error?.message ?? null };
}
