/**
 * O EFEITO DA RESPOSTA DO CLIENTE AO LEMBRETE (mudança 007, REQ-002).
 *
 * ─── Onde isto roda, e por quê ──────────────────────────────────────────────
 *
 * Chamado por `aplicarEfeitosPosEntrada` (`lib/channels/pos-entrada.ts`), o
 * ponto ÚNICO por onde passa toda mensagem de ENTRADA do WhatsApp (WAHA), da
 * Meta e do Zernio, e que roda ANTES de `pedirDespachoDoAgente`. Plugar aqui
 * (e não no ingest de cada canal, nem dentro do turno do agente) dá, de graça:
 * os três transportes, o "só inbound", o corte do número interno de avisos e do
 * contato pessoal — e funciona com o agente desligado, porque nada daqui
 * depende dele (AC-002.9). Quando esta função devolve `true`, o pos-entrada NÃO
 * emite `ai_agent.dispatch_requested` para a mensagem (AC-002.8).
 *
 * ─── O que ela faz ──────────────────────────────────────────────────────────
 *
 * Lê só a mensagem e os compromissos DESTE contato nesta organização (a
 * organização vem da conversa ingerida, nunca do corpo da mensagem), pergunta à
 * regra pura (`confirmacao-do-cliente.ts`) e, se for confirmação, grava
 * `client_confirmed_at` — campo próprio: não toca `status` nem a confirmação da
 * equipe (`service_*`) — e agradece citando data e hora, no idioma e no fuso da
 * organização. Audita `agenda.client_confirmed` com ids e classificação, nunca
 * com o texto do cliente.
 *
 * ─── Idempotência ───────────────────────────────────────────────────────────
 *
 * O UPDATE é condicional (`client_confirmed_at is null`) e devolve a linha: quem
 * perde a corrida (mesma mensagem entregue duas vezes, ou "1" repetido) não
 * grava, não responde e não audita. Reentrega sem `messageId` (a linha não
 * nasceu agora) nem entra.
 *
 * ─── O que NÃO faz ──────────────────────────────────────────────────────────
 *
 * "2"/"cancelar"/"remarcar" são classificados pela regra, mas o efeito é da
 * Fatia 4: aqui seguem o fluxo normal. Nunca lança: a mensagem já está gravada
 * e erro aqui viraria 500 para o provider (tempestade de reentregas).
 */
import type { SupabaseClient } from "@supabase/supabase-js";

import {
  decidirRespostaDoCliente,
  classificarRespostaDoCliente,
  ESTADOS_ABERTOS,
  type CompromissoCandidato,
} from "@/lib/agenda/confirmacao-do-cliente";
import { audit } from "@/lib/audit";
import { tagDeIdioma } from "@/lib/i18n/datas";
import { traduzir } from "@/lib/i18n/dicionario";
import { idiomaDoTextoPadrao, type IdiomaDoTextoPadrao } from "@/lib/agenda/lembrete-padrao";
import { logger } from "@/lib/logger";

type Admin = SupabaseClient;

export interface EntradaDaResposta {
  organizationId: string;
  contactId: string;
  conversationId: string;
  /** `null` quando a linha não nasceu agora (reentrega): então nada é feito. */
  messageId: string | null;
  texto: string | null;
  requestId?: string;
  origem: string;
}

export interface EnvioDaResposta {
  organizationId: string;
  conversationId: string;
  compromissoId: string;
  corpo: string;
  requestId: string;
}

export interface DependenciasDaConfirmacao {
  agora?: () => Date;
  enviar?: (admin: Admin, envio: EnvioDaResposta) => Promise<void>;
  /** A chave de instalação. Ausente = ligada. */
  instalacaoLigada?: () => boolean;
}

const VALORES_QUE_DESLIGAM = new Set(["false", "0", "off", "no", "desligado"]);

/**
 * A chave de instalação `AGENDA_CONFIRMACAO_CLIENTE` (REQ-005). A declaração em
 * `lib/env.ts` e no `.env.example` é da Fatia 5; até lá, ausência = ligada.
 */
export function confirmacaoDoClienteLigadaNaInstalacao(): boolean {
  const bruto = process.env.AGENDA_CONFIRMACAO_CLIENTE;
  if (bruto === undefined) return true;
  return !VALORES_QUE_DESLIGAM.has(bruto.trim().toLowerCase());
}

const AGRADECIMENTO_PT =
  "Obrigado pela confirmação! Seu {{tipo}} está confirmado para {{dia}} às {{hora}}.";

/** O inglês mora aqui (o mesmo padrão de `lembrete-padrao.ts`): o catálogo só tem pt-BR e es. */
const AGRADECIMENTO_EN = "Thank you for confirming! Your {{tipo}} is confirmed for {{dia}} at {{hora}}.";

function textoDoAgradecimento(idioma: IdiomaDoTextoPadrao): string {
  if (idioma === "en") return AGRADECIMENTO_EN;
  return traduzir(AGRADECIMENTO_PT, idioma);
}

export function montarAgradecimento(input: {
  tipo: string;
  quando: Date;
  timezone: string;
  idioma: IdiomaDoTextoPadrao;
}): string {
  const etiqueta = input.idioma === "en" ? "en-US" : tagDeIdioma(input.idioma);
  const dia = new Intl.DateTimeFormat(etiqueta, {
    timeZone: input.timezone,
    weekday: "long",
    day: "2-digit",
    month: "2-digit",
  }).format(input.quando);
  const hora = new Intl.DateTimeFormat(etiqueta, {
    timeZone: input.timezone,
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).format(input.quando);
  const pecas: Record<string, string> = { tipo: input.tipo, dia, hora };
  return textoDoAgradecimento(input.idioma).replace(/\{\{\s*(\w+)\s*\}\}/g, (lit, k: string) => pecas[k] ?? lit);
}

/** O caminho de envio comum do sistema; import tardio para não pesar o pos-entrada. */
async function enviarPeloCaminhoComum(admin: Admin, envio: EnvioDaResposta): Promise<void> {
  const { sendMessageHandler } = await import("@/app/api/v1/messages/_handler");
  await sendMessageHandler(
    admin as never,
    {
      organization_id: envio.organizationId,
      actor: { type: "webhook_source", id: envio.compromissoId },
      requestId: envio.requestId,
    },
    { conversation_id: envio.conversationId, type: "text", body: envio.corpo } as never,
  );
}

interface LinhaDoCompromisso {
  id: string;
  title: string;
  starts_at: string;
  status: string;
  client_confirmed_at: string | null;
  client_reschedule_requested_at: string | null;
  reminder_sent_at: string | null;
  calendar_event_types:
    | { name: string | null; client_confirmation_enabled: boolean | null }
    | Array<{ name: string | null; client_confirmation_enabled: boolean | null }>
    | null;
}

function tipoDe(l: LinhaDoCompromisso) {
  const t = l.calendar_event_types;
  return Array.isArray(t) ? (t[0] ?? null) : t;
}

const data = (v: string | null) => (v ? new Date(v) : null);

/**
 * `true` = a mensagem foi tratada como resposta ao lembrete (o agente não deve
 * respondê-la). `false` = segue o fluxo normal.
 */
export async function tratarRespostaDoCliente(
  admin: Admin,
  entrada: EntradaDaResposta,
  deps: DependenciasDaConfirmacao = {},
): Promise<boolean> {
  try {
    if (!entrada.messageId) return false;
    // Barata e primeiro: quase toda mensagem não é "1"/"sim" e não toca o banco.
    // "2"/"remarcar" ainda não têm efeito aqui (Fatia 4): seguem o fluxo normal.
    if (classificarRespostaDoCliente(entrada.texto) !== "confirmar") return false;
    if (!(deps.instalacaoLigada ?? confirmacaoDoClienteLigadaNaInstalacao)()) return false;

    const agora = (deps.agora ?? (() => new Date()))();
    const { data: linhas, error } = await admin
      .from("calendar_appointments")
      .select(
        "id, title, starts_at, status, client_confirmed_at, client_reschedule_requested_at, reminder_sent_at, calendar_event_types!inner(name, client_confirmation_enabled)",
      )
      .eq("organization_id", entrada.organizationId)
      .eq("contact_id", entrada.contactId)
      .in("status", [...ESTADOS_ABERTOS])
      .gt("starts_at", agora.toISOString())
      .not("reminder_sent_at", "is", null)
      .eq("calendar_event_types.client_confirmation_enabled", true)
      .order("starts_at", { ascending: true })
      .limit(10);
    if (error) {
      logger.warn("[agenda] confirmação do cliente: leitura falhou (a mensagem segue o fluxo)", {
        organization_id: entrada.organizationId,
        detail: error.message.slice(0, 160),
      });
      return false;
    }

    const doTipoLigado = ((linhas ?? []) as unknown as LinhaDoCompromisso[]).filter(
      (l) => tipoDe(l)?.client_confirmation_enabled === true,
    );
    const decisao = decidirRespostaDoCliente({
      texto: entrada.texto,
      agora,
      candidatos: doTipoLigado.map<CompromissoCandidato>((l) => ({
        id: l.id,
        comeca: new Date(l.starts_at),
        estado: l.status,
        clientConfirmedAt: data(l.client_confirmed_at),
        clientRescheduleRequestedAt: data(l.client_reschedule_requested_at),
        ultimoLembreteEm: data(l.reminder_sent_at),
      })),
    });

    if (decisao.tipo === "nada" || decisao.tipo === "remarcar") return false;
    // Repetida: nada muda e ninguém responde — nem o agente.
    if (decisao.tipo === "ja_confirmado") return true;

    const alvo = doTipoLigado.find((l) => l.id === decisao.compromissoId)!;

    // O UPDATE condicional é a idempotência: perde a corrida quem chegar depois.
    const { data: gravadas, error: erroGravar } = await admin
      .from("calendar_appointments")
      .update({ client_confirmed_at: agora.toISOString() })
      .eq("id", alvo.id)
      .eq("organization_id", entrada.organizationId)
      .eq("contact_id", entrada.contactId)
      .in("status", [...ESTADOS_ABERTOS])
      .is("client_confirmed_at", null)
      .select("id");
    if (erroGravar) {
      logger.error("[agenda] confirmação do cliente NÃO gravada", {
        organization_id: entrada.organizationId,
        appointment_id: alvo.id,
        detail: erroGravar.message.slice(0, 160),
      });
      return false;
    }
    if (!gravadas || gravadas.length === 0) return true;

    await audit({
      action: "agenda.client_confirmed",
      organizationId: entrada.organizationId,
      resourceType: "calendar_appointment",
      resourceId: alvo.id,
      requestId: entrada.requestId,
      metadata: {
        appointment_id: alvo.id,
        contact_id: entrada.contactId,
        conversation_id: entrada.conversationId,
        message_id: entrada.messageId,
        classificacao: "confirmar",
        origem: entrada.origem,
      },
    });

    try {
      const { data: org } = await admin
        .from("organizations")
        .select("timezone, locale, name")
        .eq("id", entrada.organizationId)
        .maybeSingle();
      const o = org as { timezone?: string | null; locale?: string | null } | null;
      const tipo = tipoDe(alvo)?.name?.trim() || alvo.title;
      const corpo = montarAgradecimento({
        tipo,
        quando: new Date(alvo.starts_at),
        timezone: o?.timezone ?? "America/Sao_Paulo",
        idioma: idiomaDoTextoPadrao(o?.locale),
      });
      await (deps.enviar ?? enviarPeloCaminhoComum)(admin, {
        organizationId: entrada.organizationId,
        conversationId: entrada.conversationId,
        compromissoId: alvo.id,
        corpo,
        requestId: `agenda-confirmacao-cliente:${entrada.messageId}`,
      });
    } catch (err) {
      // A confirmação já está gravada; o agradecimento é cortesia. Não desfaz,
      // não reenvia ("envio em dobro é pior que não-envio").
      logger.warn("[agenda] confirmação gravada, agradecimento não saiu", {
        organization_id: entrada.organizationId,
        appointment_id: alvo.id,
        detail: err instanceof Error ? err.message.slice(0, 160) : "desconhecido",
      });
    }
    return true;
  } catch (err) {
    logger.warn("[agenda] confirmação do cliente falhou (a mensagem segue o fluxo)", {
      organization_id: entrada.organizationId,
      detail: err instanceof Error ? err.message.slice(0, 160) : "desconhecido",
    });
    return false;
  }
}
