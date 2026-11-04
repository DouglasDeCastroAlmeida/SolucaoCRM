/**
 * A fila de envio da caixa (mudança 005, AC-005.1 a AC-005.3): drena o que o handler deixou
 * `queued` por teto diário, intervalo mínimo ou canal desligado.
 *
 * ─── De quem é esta fila ─────────────────────────────────────────────────────
 * Só das mensagens que um ATENDENTE escreveu (`sent_via = 'user'`). IA e automação têm dono
 * próprio: o motor reagenda o turno quando o envio volta `queued`, e drenar a mesma linha aqui
 * mandaria em dobro. Só entram motivos que este canal escreveu na linha (`teto_diario`,
 * `intervalo` com `adiar_ate`, ou canal desligado); `queued` por outro motivo é de outro dono.
 *
 * ─── Como não enviar duas vezes ──────────────────────────────────────────────
 * A mensagem é reivindicada com um UPDATE condicional (`queued` → `sending`) ANTES de falar
 * com o servidor: duas rodadas ao mesmo tempo disputam a linha e só uma ganha. Se a rodada
 * morre no meio, a linha fica `sending` e o cron `recover-stuck-messages` a marca `failed`
 * (reenviar às cegas seria pior que não enviar).
 *
 * Cada envio passa pelas MESMAS travas do handler (`decidirAdmissao`): bateu o teto, para e
 * avisa a Central; dentro do intervalo, para e deixa o resto para a rodada seguinte.
 * Toda consulta leva `organization_id` à mão (client de service role).
 */
import type { SupabaseClient } from "@supabase/supabase-js";

import { logger } from "@/lib/logger";

import type { CaixaDeEmail } from "./caixa";
import { enviarEmailDaCaixa, FalhaDeEnvio, type DependenciasDoEnvio, type EntradaDoEnvio } from "./envio";
import { avisarTetoAtingido, decidirAdmissao, fusoDaOrganizacao, resolverAvisoTeto } from "./limite";

const BUCKET_DE_MIDIA = "whatsapp-media";
/** Mensagens da fila que uma caixa envia por rodada (o intervalo mínimo costuma parar antes). */
export const ENVIOS_POR_RODADA = 10;
const MOTIVOS_DA_FILA = new Set(["teto_diario", "intervalo", "email_not_configured"]);
const FRASE_GENERICA = "Não foi possível enviar o e-mail agora. Tente de novo em instantes.";

export interface DependenciasDaFila {
  agora?: () => Date;
  enviar?: (admin: SupabaseClient, entrada: EntradaDoEnvio, deps?: DependenciasDoEnvio) => Promise<{ externalId: string }>;
  envio?: DependenciasDoEnvio;
  /** URL assinada de um arquivo do armazenamento (padrão: o bucket de mídia). */
  assinarUrl?: (admin: SupabaseClient, caminho: string) => Promise<string | null>;
  maximo?: number;
}

export interface ResumoDaFila {
  enviadas: number;
  falhas: number;
}

type Linha = {
  id: string;
  conversation_id: string;
  contact_id: string;
  type: string;
  body: string | null;
  media_storage_path: string | null;
  media_mime: string | null;
  media_size_bytes: number | null;
  metadata: Record<string, unknown> | null;
};

const assinarPadrao = async (admin: SupabaseClient, caminho: string): Promise<string | null> => {
  const { data, error } = await admin.storage.from(BUCKET_DE_MIDIA).createSignedUrl(caminho, 600);
  return error || !data?.signedUrl ? null : data.signedUrl;
};

function vencida(m: Linha, agora: Date): boolean {
  const meta = m.metadata ?? {};
  const motivo = typeof meta.queued_reason === "string" ? meta.queued_reason : "";
  if (!MOTIVOS_DA_FILA.has(motivo)) return false;
  if (motivo === "email_not_configured") return true;
  const quando = typeof meta.adiar_ate === "string" ? Date.parse(meta.adiar_ate) : NaN;
  return Number.isFinite(quando) && quando <= agora.getTime();
}

export async function drenarFilaDaCaixa(
  admin: SupabaseClient,
  organizationId: string,
  caixa: CaixaDeEmail,
  deps: DependenciasDaFila = {},
): Promise<ResumoDaFila> {
  const resumo: ResumoDaFila = { enviadas: 0, falhas: 0 };
  const agora = deps.agora ?? (() => new Date());

  const { data, error } = await admin
    .from("messages")
    .select("id, conversation_id, contact_id, type, body, media_storage_path, media_mime, media_size_bytes, metadata")
    .eq("organization_id", organizationId)
    .eq("channel_session_id", caixa.id)
    .eq("direction", "outbound")
    .eq("status", "queued")
    .eq("sent_via", "user")
    .order("created_at", { ascending: true })
    .limit(100);
  if (error) throw new Error(`email_fila_lookup_failed: ${error.message}`);
  const prontas = ((data as Linha[] | null) ?? []).filter((m) => vencida(m, agora())).slice(0, deps.maximo ?? ENVIOS_POR_RODADA);
  if (prontas.length === 0) return resumo;

  const fuso = await fusoDaOrganizacao(admin, organizationId);
  const enviar = deps.enviar ?? enviarEmailDaCaixa;
  let avisoFechado = false;

  for (const m of prontas) {
    const admissao = await decidirAdmissao(admin, {
      organizationId,
      caixaId: caixa.id,
      tetoDiario: caixa.config.teto_diario,
      intervaloSegundos: caixa.config.intervalo_segundos,
      fuso,
      agora: agora(),
    });
    if (!admissao.ok) {
      if (admissao.motivo === "teto_diario") {
        await avisarTetoAtingido(admin, { organizationId, caixaId: caixa.id, endereco: caixa.endereco });
      }
      break;
    }
    if (!avisoFechado) {
      await resolverAvisoTeto(admin, organizationId, caixa.id);
      avisoFechado = true;
    }

    // Reivindica: só uma rodada leva a mensagem.
    const { data: reivindicada } = await admin
      .from("messages")
      .update({ status: "sending" })
      .eq("organization_id", organizationId)
      .eq("id", m.id)
      .eq("status", "queued")
      .select("id");
    if (!reivindicada || (reivindicada as unknown[]).length === 0) continue;

    const falhar = async (mensagem: string) => {
      await admin
        .from("messages")
        .update({ status: "failed", error_code: "email_error", error_message: mensagem })
        .eq("organization_id", organizationId)
        .eq("id", m.id);
      resumo.falhas++;
    };

    try {
      const { data: contato } = await admin
        .from("contacts")
        .select("email")
        .eq("organization_id", organizationId)
        .eq("id", m.contact_id)
        .maybeSingle();
      const para = (contato as { email?: string | null } | null)?.email?.trim().toLowerCase();
      if (!para) {
        await falhar("O contato não tem endereço de e-mail. Corrija o cadastro e envie de novo.");
        continue;
      }

      let media: EntradaDoEnvio["media"];
      if (m.media_storage_path) {
        const url = await (deps.assinarUrl ?? assinarPadrao)(admin, m.media_storage_path);
        if (!url) throw new FalhaDeEnvio("anexo_indisponivel");
        media = {
          url,
          mime: m.media_mime ?? "application/octet-stream",
          filename: m.media_storage_path.split("/").pop(),
          tamanho: m.media_size_bytes,
        };
      }

      const r = await enviar(
        admin,
        { organizationId, sessionRef: caixa.endereco, para, conversationId: m.conversation_id, corpo: m.body ?? "", media },
        { ...deps.envio, agora },
      );
      const { queued_reason: _motivo, adiar_ate: _quando, ...resto } = m.metadata ?? {};
      void _motivo;
      void _quando;
      await admin
        .from("messages")
        .update({ status: "sent", external_id: r.externalId, sent_at: agora().toISOString(), ack: 0, metadata: resto })
        .eq("organization_id", organizationId)
        .eq("id", m.id);
      resumo.enviadas++;
    } catch (erro) {
      if (erro instanceof FalhaDeEnvio && erro.causa === "caixa_pausada") {
        // A caixa está parada (senha, equipe): a mensagem volta à fila e a rodada para aqui.
        await admin.from("messages").update({ status: "queued" }).eq("organization_id", organizationId).eq("id", m.id);
        break;
      }
      if (!(erro instanceof FalhaDeEnvio)) {
        logger.warn("[email.fila] envio interrompido", { organizationId, erro: erro instanceof Error ? erro.name : "desconhecido" });
      }
      await falhar(erro instanceof FalhaDeEnvio ? erro.message : FRASE_GENERICA);
    }
  }
  return resumo;
}
