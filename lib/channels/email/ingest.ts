/**
 * Ingestão de um e-mail RECEBIDO (mudança 005, REQ-002 e REQ-003).
 *
 * Mesma forma dos irmãos (`zernio/ingest.ts`, `meta/ingest.ts`): decide se vira conversa,
 * acha ou cria o contato, grava a mensagem com `unique (organization_id, external_id)`
 * (o `Message-ID` é o `external_id`; `23505` é "duplicado", não erro), carimba a conversa e
 * aplica os efeitos pós-entrada. Só a identidade muda: o contato é achado pelo ENDEREÇO DE
 * E-MAIL, não por telefone.
 *
 * - O client é de service role: TODA consulta leva `organization_id` à mão, vindo da caixa
 *   (fonte confiável), nunca do conteúdo do e-mail.
 * - Conversa: uma por contato e caixa (ADR-002). A resposta a um e-mail anterior cai nela
 *   por construção; o assunto e o encadeamento ficam em `messages.metadata.email`.
 * - O corpo de quem foi ignorado NÃO é guardado: só o cabeçalho (remetente, assunto, data,
 *   motivo). Promover relê pelo UID (`ignorados.ts`).
 * - Nunca loga conteúdo nem endereço.
 */
import type { SupabaseClient } from "@supabase/supabase-js";

import { marcarConversaComMensagem } from "@/lib/channels/marcar-conversa";
import { logger } from "@/lib/logger";
import { extFromMime } from "@/lib/messaging/media/types";

import { aplicarEfeitosPosEntrada } from "../pos-entrada";
import { classificarAutomatico, type MotivoDeIgnorado } from "./automatico";
import type { EmailLido } from "./parse";

const BUCKET_DE_MIDIA = "whatsapp-media";

export interface CaixaDaIngestao {
  id: string;
  endereco: string;
}

export interface AnexoParaGuardar {
  organizationId: string;
  conversationId: string;
  messageId: string;
  indice: number;
  nome: string;
  tipo: string;
  conteudo: Buffer;
}

export interface DependenciasDaIngestao {
  /** Devolve o caminho no storage, ou `null` se não deu para guardar. */
  guardarAnexo?: (admin: SupabaseClient, anexo: AnexoParaGuardar) => Promise<string | null>;
  aplicarEfeitos?: typeof aplicarEfeitosPosEntrada;
}

export type ResultadoDaIngestao =
  | { resultado: "ingerido"; messageId: string; conversationId: string; contactId: string }
  | { resultado: "duplicado" }
  | { resultado: "ignorado"; motivo: MotivoDeIgnorado };

export async function guardarAnexoNoStorage(admin: SupabaseClient, a: AnexoParaGuardar): Promise<string | null> {
  const caminho = `${a.organizationId}/${a.conversationId}/${a.messageId}-${a.indice}.${extFromMime(a.tipo)}`;
  const { error } = await admin.storage
    .from(BUCKET_DE_MIDIA)
    .upload(caminho, a.conteudo, { contentType: a.tipo, upsert: false });
  if (error) {
    logger.warn("[email.ingest] guardar o anexo falhou", { organizationId: a.organizationId });
    return null;
  }
  return caminho;
}

function tipoDaMensagem(mime: string): "image" | "video" | "audio" | "document" {
  if (mime.startsWith("image/")) return "image";
  if (mime.startsWith("video/")) return "video";
  if (mime.startsWith("audio/")) return "audio";
  return "document";
}

async function acharContatoPorEmail(admin: SupabaseClient, organizationId: string, endereco: string) {
  const { data, error } = await admin
    .from("contacts")
    .select("id")
    .eq("organization_id", organizationId)
    .eq("email_normalized", endereco)
    .is("is_merged_into", null)
    .maybeSingle();
  if (error) throw new Error(`email_contact_lookup_failed: ${error.message}`);
  return (data as { id: string } | null)?.id ?? null;
}

async function remetenteMarcadoComoNaoCliente(admin: SupabaseClient, organizationId: string, endereco: string) {
  const { data, error } = await admin
    .from("email_remetentes_ignorados")
    .select("endereco_normalizado")
    .eq("organization_id", organizationId)
    .eq("endereco_normalizado", endereco)
    .maybeSingle();
  if (error) throw new Error(`email_sender_block_lookup_failed: ${error.message}`);
  return data !== null;
}

async function criarOuAcharContato(
  admin: SupabaseClient,
  organizationId: string,
  remetente: EmailLido["remetente"],
): Promise<string> {
  const existente = await acharContatoPorEmail(admin, organizationId, remetente.endereco);
  if (existente) return existente;
  const { data, error } = await admin
    .from("contacts")
    .insert({
      organization_id: organizationId,
      email: remetente.endereco,
      name: remetente.nome,
      display_name: remetente.nome ?? remetente.endereco,
      source: "email",
    })
    .select("id")
    .single();
  if (error?.code === "23505") {
    // Duas rodadas criaram o mesmo contato ao mesmo tempo: fica quem ganhou.
    const vencedor = await acharContatoPorEmail(admin, organizationId, remetente.endereco);
    if (vencedor) return vencedor;
  }
  if (error || !data) throw new Error(`email_contact_create_failed: ${error?.message ?? "sem id"}`);
  return (data as { id: string }).id;
}

/** Grava (ou reconhece) uma linha da lista de ignorados: só cabeçalho. */
export async function registrarIgnorado(
  admin: SupabaseClient,
  input: { organizationId: string; caixaId: string; uid: number; email: Pick<EmailLido, "messageId" | "remetente" | "assunto" | "data">; motivo: string },
): Promise<void> {
  const { error } = await admin.from("email_ignorados").insert({
    organization_id: input.organizationId,
    channel_session_id: input.caixaId,
    message_id: input.email.messageId,
    uid: input.uid,
    remetente: input.email.remetente.endereco,
    assunto: input.email.assunto || null,
    recebido_em: (input.email.data ?? new Date()).toISOString(),
    motivo: input.motivo,
  });
  if (error && error.code !== "23505") throw new Error(`email_ignored_insert_failed: ${error.message}`);
}

export async function ingerirEmail(
  admin: SupabaseClient,
  entrada: { organizationId: string; caixa: CaixaDaIngestao; uid: number; email: EmailLido; requestId?: string; ignorarRegras?: boolean },
  deps: DependenciasDaIngestao = {},
): Promise<ResultadoDaIngestao> {
  const { organizationId, caixa, uid, email } = entrada;
  const remetente = email.remetente.endereco;

  // 1. Vira conversa? "Não é cliente" (decisão de uma pessoa) vence tudo; depois, a regra de automático.
  //    `ignorarRegras` é só da promoção manual: a pessoa já decidiu que ESTE e-mail é conversa.
  if (!entrada.ignorarRegras) {
    if (await remetenteMarcadoComoNaoCliente(admin, organizationId, remetente)) {
      await registrarIgnorado(admin, { organizationId, caixaId: caixa.id, uid, email, motivo: "nao_e_cliente" });
      return { resultado: "ignorado", motivo: "nao_e_cliente" };
    }
    const conhecido = (await acharContatoPorEmail(admin, organizationId, remetente)) !== null;
    const decisao = classificarAutomatico({
      remetente,
      enderecoDaCaixa: caixa.endereco,
      cabecalhos: email.cabecalhos,
      contatoConhecido: conhecido,
    });
    if (decisao.ignorar) {
      await registrarIgnorado(admin, { organizationId, caixaId: caixa.id, uid, email, motivo: decisao.motivo });
      return { resultado: "ignorado", motivo: decisao.motivo };
    }
  }

  // 2. Contato e conversa.
  const contactId = await criarOuAcharContato(admin, organizationId, email.remetente);
  const { data: conversa, error: erroDaConversa } = await admin.rpc("fn_upsert_email_conversation" as never, {
    p_org: organizationId,
    p_contact: contactId,
    p_session: caixa.id,
  } as never);
  if (erroDaConversa || !conversa) {
    throw new Error(`email_conversation_upsert_failed: ${erroDaConversa?.message ?? "sem id"}`);
  }
  const conversationId = conversa as unknown as string;

  // 3. A mensagem. `23505` em (organization_id, external_id) = já vimos este e-mail.
  const quando = (email.data ?? new Date()).toISOString();
  const anexosDescritos = email.anexos.map((a) => ({ nome: a.nome, tipo: a.tipo, tamanho: a.tamanho, caminho: null as string | null }));
  const metadataDoEmail = () => ({
    email: {
      assunto: email.assunto,
      de_nome: email.remetente.nome,
      in_reply_to: email.inReplyTo,
      references: email.references,
      html: email.html,
      anexos: anexosDescritos,
      anexos_omitidos: email.anexosOmitidos,
    },
  });
  const corpo = email.texto.trim() || email.assunto;
  const { data: inserida, error: erroDeInsert } = await admin
    .from("messages")
    .insert({
      organization_id: organizationId,
      conversation_id: conversationId,
      contact_id: contactId,
      channel_session_id: caixa.id,
      external_id: email.messageId,
      direction: "inbound",
      // Veio de fora do CRM (o cliente escreveu); o default `crm` mentiria nas métricas de fricção.
      sent_via: "external_device",
      status: "delivered",
      type: "text",
      body: corpo,
      metadata: metadataDoEmail(),
      sent_at: quando,
    })
    .select("id")
    .maybeSingle();
  if (erroDeInsert?.code === "23505") return { resultado: "duplicado" };
  if (erroDeInsert || !inserida) throw new Error(`email_ingest_insert_failed: ${erroDeInsert?.message ?? "sem id"}`);
  const messageId = (inserida as { id: string }).id;

  // 4. Anexos: guardados depois, com o id da mensagem. Falhar aqui não perde o e-mail.
  if (email.anexos.length > 0) {
    const guardar = deps.guardarAnexo ?? guardarAnexoNoStorage;
    for (let i = 0; i < email.anexos.length; i++) {
      const a = email.anexos[i]!;
      try {
        anexosDescritos[i]!.caminho = await guardar(admin, {
          organizationId,
          conversationId,
          messageId,
          indice: i,
          nome: a.nome,
          tipo: a.tipo,
          conteudo: a.conteudo,
        });
      } catch {
        anexosDescritos[i]!.caminho = null;
      }
    }
    const primeiro = anexosDescritos.find((a) => a.caminho);
    const { error: erroDoAnexo } = await admin
      .from("messages")
      .update({
        metadata: metadataDoEmail(),
        ...(primeiro?.caminho ? { media_storage_path: primeiro.caminho, media_mime: primeiro.tipo } : {}),
        ...(primeiro && !email.texto.trim() ? { type: tipoDaMensagem(primeiro.tipo) } : {}),
      })
      .eq("organization_id", organizationId)
      .eq("id", messageId);
    if (erroDoAnexo) logger.warn("[email.ingest] gravar os anexos falhou", { organizationId });
  }

  // 5. Carimbo da conversa e efeitos (opt-out, lead, campanha, follow-up, agente).
  await marcarConversaComMensagem(admin, {
    organizationId,
    conversationId,
    direction: "inbound",
    preview: [email.assunto, email.texto.trim()].filter(Boolean).join(": ").slice(0, 200),
    at: quando,
    canal: "email",
  });
  try {
    await (deps.aplicarEfeitos ?? aplicarEfeitosPosEntrada)(admin as never, {
      organizationId,
      contactId,
      conversationId,
      messageId,
      channelSessionId: caixa.id,
      texto: email.texto,
      nomeDoContato: email.remetente.nome,
      requestId: entrada.requestId,
      origem: "email_imap",
      canal: "email",
    });
  } catch {
    // A mensagem já está gravada: perder um efeito é ruim, repetir a ingestão é pior.
    logger.warn("[email.ingest] efeitos pós-entrada falharam", { organizationId });
  }

  return { resultado: "ingerido", messageId, conversationId, contactId };
}
