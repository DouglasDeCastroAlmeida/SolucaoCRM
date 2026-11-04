/**
 * A lista de ignorados e o "não é cliente" (mudança 005, AC-003.3 e AC-003.4).
 *
 * - Lista: só o cabeçalho do que não virou conversa (remetente, assunto, data, motivo).
 *   O corpo não é guardado; se a pessoa promover, o e-mail é relido pelo UID.
 * - Promover: relê, confere que o UID ainda aponta para o MESMO e-mail (o `Message-ID`
 *   guardado), ingere como conversa ignorando a regra de automático e tira da lista.
 * - Não é cliente: o endereço entra em `email_remetentes_ignorados` (vale para a organização
 *   inteira) e as conversas de E-MAIL desse contato saem da lista (arquivadas, nada apagado).
 * - Poda: ignorados vencem em 30 dias (cron `data-retention`).
 *
 * Client de service role: toda consulta leva `organization_id` à mão.
 */
import type { SupabaseClient } from "@supabase/supabase-js";

import { acharCaixa } from "./caixa";
import { ingerirEmail, type DependenciasDaIngestao } from "./ingest";
import { abrirLeitorImap, type AbrirLeitor } from "./leitura-imap";
import { lerEmail } from "./parse";
import { RETENCAO_DOS_IGNORADOS_DIAS } from "./retencao";
import { lerSenhaDaCaixa } from "./segredo";

const LIMITE_DA_LISTA = 200;

export interface IgnoradoVisivel {
  id: string;
  caixa_id: string;
  remetente: string;
  assunto: string | null;
  recebido_em: string;
  motivo: string;
}

export async function listarIgnorados(
  admin: SupabaseClient,
  organizationId: string,
  filtro: { caixaId?: string; limite?: number },
): Promise<IgnoradoVisivel[]> {
  let q = admin
    .from("email_ignorados")
    .select("id, channel_session_id, remetente, assunto, recebido_em, motivo")
    .eq("organization_id", organizationId);
  if (filtro.caixaId) q = q.eq("channel_session_id", filtro.caixaId);
  const { data, error } = await q.order("recebido_em", { ascending: false }).limit(Math.min(filtro.limite ?? 100, LIMITE_DA_LISTA));
  if (error) throw new Error(`email_ignorados_lookup_failed: ${error.message}`);
  return ((data ?? []) as Array<Record<string, unknown>>).map((l) => ({
    id: l.id as string,
    caixa_id: l.channel_session_id as string,
    remetente: l.remetente as string,
    assunto: (l.assunto as string | null) ?? null,
    recebido_em: l.recebido_em as string,
    motivo: l.motivo as string,
  }));
}

export interface DependenciasDaPromocao {
  abrirLeitor?: AbrirLeitor;
  lerSenha?: typeof lerSenhaDaCaixa;
  ingestao?: DependenciasDaIngestao;
}

export type ResultadoDaPromocao =
  | { resultado: "promovido"; conversationId: string }
  | { resultado: "nao_encontrado" }
  | { resultado: "indisponivel" };

export async function promoverIgnorado(
  admin: SupabaseClient,
  organizationId: string,
  ignoradoId: string,
  deps: DependenciasDaPromocao = {},
): Promise<ResultadoDaPromocao> {
  const { data: linha, error } = await admin
    .from("email_ignorados")
    .select("id, channel_session_id, message_id, uid, remetente, motivo")
    .eq("organization_id", organizationId)
    .eq("id", ignoradoId)
    .maybeSingle();
  if (error) throw new Error(`email_ignorado_lookup_failed: ${error.message}`);
  if (!linha) return { resultado: "nao_encontrado" };
  const r = linha as { channel_session_id: string; message_id: string; uid: number | string; remetente: string; motivo: string };

  const caixa = await acharCaixa(admin, organizationId, r.channel_session_id);
  if (!caixa) return { resultado: "indisponivel" };
  const senha = await (deps.lerSenha ?? lerSenhaDaCaixa)(admin, { organizationId, channelSessionId: caixa.id });
  if (!senha) return { resultado: "indisponivel" };

  let cru: Buffer | null = null;
  const leitor = await (deps.abrirLeitor ?? abrirLeitorImap)({
    endereco: caixa.endereco,
    usuario: caixa.config.usuario,
    senha,
    imap: caixa.config.imap,
    smtp: caixa.config.smtp,
  }).catch(() => null);
  if (!leitor) return { resultado: "indisponivel" };
  try {
    cru = await leitor.baixar(Number(r.uid));
  } catch {
    cru = null;
  } finally {
    await leitor.fechar().catch(() => undefined);
  }
  if (!cru) return { resultado: "indisponivel" };

  const lido = await lerEmail(cru);
  // O UID pode apontar para outro e-mail se a caixa foi renumerada: só promove o MESMO.
  if (!lido.ok || lido.email.messageId !== r.message_id) return { resultado: "indisponivel" };

  const ingerido = await ingerirEmail(
    admin,
    { organizationId, caixa: { id: caixa.id, endereco: caixa.endereco }, uid: Number(r.uid), email: lido.email, ignorarRegras: true },
    deps.ingestao,
  );
  if (ingerido.resultado === "ignorado") return { resultado: "indisponivel" };

  await admin.from("email_ignorados").delete().eq("organization_id", organizationId).eq("id", ignoradoId);
  if (r.motivo === "nao_e_cliente") {
    await admin
      .from("email_remetentes_ignorados")
      .delete()
      .eq("organization_id", organizationId)
      .eq("endereco_normalizado", r.remetente.trim().toLowerCase());
  }

  if (ingerido.resultado === "ingerido") return { resultado: "promovido", conversationId: ingerido.conversationId };
  // Duplicado: o e-mail já era conversa; só limpamos a lista. A conversa é a do contato.
  const { data: msg } = await admin
    .from("messages")
    .select("conversation_id")
    .eq("organization_id", organizationId)
    .eq("external_id", r.message_id)
    .maybeSingle();
  return { resultado: "promovido", conversationId: (msg as { conversation_id: string } | null)?.conversation_id ?? "" };
}

export type ResultadoDoNaoCliente =
  | { resultado: "marcado"; endereco: string; conversasArquivadas: number }
  | { resultado: "nao_encontrada" };

export async function marcarNaoCliente(
  admin: SupabaseClient,
  input: { organizationId: string; userId: string; conversationId?: string; endereco?: string },
): Promise<ResultadoDoNaoCliente> {
  let endereco = (input.endereco ?? "").trim().toLowerCase();
  let contactId: string | null = null;

  if (input.conversationId) {
    const { data: conversa, error } = await admin
      .from("conversations")
      .select("id, contact_id, channel")
      .eq("organization_id", input.organizationId)
      .eq("id", input.conversationId)
      .eq("channel", "email")
      .maybeSingle();
    if (error) throw new Error(`email_conversa_lookup_failed: ${error.message}`);
    if (!conversa) return { resultado: "nao_encontrada" };
    contactId = (conversa as { contact_id: string }).contact_id;
    const { data: contato, error: erroDoContato } = await admin
      .from("contacts")
      .select("email_normalized")
      .eq("organization_id", input.organizationId)
      .eq("id", contactId)
      .maybeSingle();
    if (erroDoContato) throw new Error(`email_contato_lookup_failed: ${erroDoContato.message}`);
    endereco = ((contato as { email_normalized?: string | null } | null)?.email_normalized ?? "").trim().toLowerCase();
    if (!endereco) return { resultado: "nao_encontrada" };
  }
  if (!endereco) return { resultado: "nao_encontrada" };

  const { error } = await admin.from("email_remetentes_ignorados").upsert(
    { organization_id: input.organizationId, endereco_normalizado: endereco, created_by: input.userId },
    { onConflict: "organization_id,endereco_normalizado" },
  );
  if (error) throw new Error(`email_nao_cliente_failed: ${error.message}`);

  // Sai da lista: arquiva as conversas de E-MAIL desse contato. A de WhatsApp, se houver, é outra coisa.
  let conversasArquivadas = 0;
  if (contactId) {
    const { data: arquivadas, error: erroDoArquivo } = await admin
      .from("conversations")
      .update({ status: "archived" })
      .eq("organization_id", input.organizationId)
      .eq("contact_id", contactId)
      .eq("channel", "email")
      .select("id");
    if (erroDoArquivo) throw new Error(`email_arquivar_failed: ${erroDoArquivo.message}`);
    conversasArquivadas = (arquivadas ?? []).length;
  }
  return { resultado: "marcado", endereco, conversasArquivadas };
}

/** Apaga os ignorados mais velhos que a retenção. Devolve quantos. */
export async function podarIgnorados(
  admin: SupabaseClient,
  agora: Date,
  dias: number = RETENCAO_DOS_IGNORADOS_DIAS,
): Promise<number> {
  const corte = new Date(agora.getTime() - dias * 86_400_000).toISOString();
  const { data, error } = await admin.from("email_ignorados").delete().lt("created_at", corte).select("id");
  if (error) throw new Error(`email_ignorados_poda_failed: ${error.message}`);
  return (data ?? []).length;
}
