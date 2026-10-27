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
 * "2"/"cancelar"/"não vou"/"remarcar" só REGISTRAM o pedido (REQ-003, ver
 * `registrarPedidoDeRemarcar`): nada é cancelado nem remarcado sozinho. Nunca lança: a mensagem já está gravada
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

const RESPOSTA_REMARCAR_PT =
  "Entendido! Avisamos a nossa equipe e ela entrará em contato para combinar um novo horário para o seu {{tipo}} de {{dia}} às {{hora}}.";
const RESPOSTA_REMARCAR_EN =
  "Got it! We let our team know and they will contact you to arrange a new time for your {{tipo}} on {{dia}} at {{hora}}.";
const AVISO_TITULO_PT = "Um cliente pediu para remarcar um horário";
const AVISO_TITULO_EN = "A client asked to reschedule an appointment";
const AVISO_CORPO_PT =
  "O cliente respondeu ao lembrete pedindo para remarcar ou cancelar o {{tipo}} de {{dia}} às {{hora}}. Nada foi alterado: a conversa foi para a fila de atendimento.";
const AVISO_CORPO_EN =
  "The client replied to the reminder asking to reschedule or cancel the {{tipo}} on {{dia}} at {{hora}}. Nothing was changed: the conversation went to the human queue.";

function preencher(molde: string, pecas: Record<string, string>): string {
  return molde.replace(/\{\{\s*(\w+)\s*\}\}/g, (lit, k: string) => pecas[k] ?? lit);
}

function diaEHora(quando: Date, timezone: string, idioma: IdiomaDoTextoPadrao) {
  const etiqueta = idioma === "en" ? "en-US" : tagDeIdioma(idioma);
  const dia = new Intl.DateTimeFormat(etiqueta, {
    timeZone: timezone,
    weekday: "long",
    day: "2-digit",
    month: "2-digit",
  }).format(quando);
  const hora = new Intl.DateTimeFormat(etiqueta, {
    timeZone: timezone,
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).format(quando);
  return { dia, hora };
}

const dicionarioOuEn = (pt: string, en: string, idioma: IdiomaDoTextoPadrao) =>
  idioma === "en" ? en : traduzir(pt, idioma);

/**
 * "2"/"cancelar"/"não vou"/"remarcar" (AC-003.1 a AC-003.3). Só REGISTRA o pedido:
 * não toca `status`, não cancela, não remarca, não libera o horário (AC-003.2) —
 * quem decide é a equipe, e o horário segue do cliente até lá.
 *
 * Devolve `true` sempre que chega aqui: a mensagem é do pedido e nem o agente a
 * responde. O UPDATE condicional (`client_reschedule_requested_at is null`) é a
 * idempotência: quem perde a corrida (ou repete o "2") não avisa, não responde e
 * não audita. A limpeza, quando a equipe age, é `limpar-pedido-de-remarcar.ts`.
 */
async function registrarPedidoDeRemarcar(
  admin: Admin,
  entrada: EntradaDaResposta,
  alvo: LinhaDoCompromisso,
  agora: Date,
  deps: DependenciasDaConfirmacao,
): Promise<boolean> {
  const { data: gravadas, error: erroGravar } = await admin
    .from("calendar_appointments")
    .update({ client_reschedule_requested_at: agora.toISOString() })
    .eq("id", alvo.id)
    .eq("organization_id", entrada.organizationId)
    .eq("contact_id", entrada.contactId)
    .in("status", [...ESTADOS_ABERTOS])
    .is("client_reschedule_requested_at", null)
    .select("id");
  if (erroGravar) {
    logger.error("[agenda] pedido de remarcar do cliente NÃO gravado", {
      organization_id: entrada.organizationId,
      appointment_id: alvo.id,
      detail: erroGravar.message.slice(0, 160),
    });
    return false;
  }
  if (!gravadas || gravadas.length === 0) return true;

  let timezone = "America/Sao_Paulo";
  let idioma: IdiomaDoTextoPadrao = "pt-BR";
  try {
    const { data: org } = await admin
      .from("organizations")
      .select("timezone, locale, name")
      .eq("id", entrada.organizationId)
      .maybeSingle();
    const o = org as { timezone?: string | null; locale?: string | null } | null;
    timezone = o?.timezone ?? timezone;
    idioma = idiomaDoTextoPadrao(o?.locale);
  } catch {
    // Padrão do produto: o pedido já está gravado, e o texto sai em pt-BR.
  }
  const tipo = tipoDe(alvo)?.name?.trim() || alvo.title;
  const pecas = { tipo, ...diaEHora(new Date(alvo.starts_at), timezone, idioma) };

  // (a) Fila humana, no mínimo que deixa uma pessoa ver a conversa e cala o agente nela
  // (a mesma dupla `status='pending'` + `bot_silenced_until='infinity'` do handoff do motor).
  // Conversa já assumida por alguém (`claimed`) segue com essa pessoa: só o agente é calado.
  try {
    const agora = new Date().toISOString();
    await admin
      .from("conversations")
      .update({
        bot_silenced_until: "infinity",
        // A origem da passagem fica visível para a fila e para os relatórios de handoff.
        last_handoff_at: agora,
        last_handoff_reason: "agenda_cliente_pediu_remarcar",
      })
      .eq("organization_id", entrada.organizationId)
      .eq("id", entrada.conversationId);
    await admin
      .from("conversations")
      .update({ status: "pending", status_changed_at: agora })
      .eq("organization_id", entrada.organizationId)
      .eq("id", entrada.conversationId)
      .in("status", ["open", "ai_handling", "resolved", "closed"]);
  } catch (err) {
    logger.warn("[agenda] pedido de remarcar gravado, conversa não foi para a fila", {
      organization_id: entrada.organizationId,
      appointment_id: alvo.id,
      detail: err instanceof Error ? err.message.slice(0, 160) : "desconhecido",
    });
  }

  // (b) Central: um item por compromisso enquanto estiver aberto.
  try {
    const { data: aberto } = await admin
      .from("agent_inbox_items")
      .select("id")
      .eq("organization_id", entrada.organizationId)
      .eq("kind", "agenda_cliente_pediu_remarcar")
      .eq("ref_kind", "appointment")
      .eq("ref_id", alvo.id)
      .eq("status", "open")
      .maybeSingle();
    if (!aberto) {
      const { error } = await admin.from("agent_inbox_items").insert({
        organization_id: entrada.organizationId,
        kind: "agenda_cliente_pediu_remarcar",
        severity: "warn",
        title: dicionarioOuEn(AVISO_TITULO_PT, AVISO_TITULO_EN, idioma),
        body: preencher(dicionarioOuEn(AVISO_CORPO_PT, AVISO_CORPO_EN, idioma), pecas),
        ref_kind: "appointment",
        ref_id: alvo.id,
        status: "open",
      });
      if (error) throw error;
    }
  } catch (err) {
    logger.error("[agenda] pedido de remarcar gravado, aviso na Central falhou", {
      organization_id: entrada.organizationId,
      appointment_id: alvo.id,
      detail: err instanceof Error ? err.message.slice(0, 160) : String((err as { message?: string })?.message ?? err).slice(0, 160),
    });
  }

  await audit({
    action: "agenda.client_requested_reschedule",
    organizationId: entrada.organizationId,
    resourceType: "calendar_appointment",
    resourceId: alvo.id,
    requestId: entrada.requestId,
    metadata: {
      appointment_id: alvo.id,
      contact_id: entrada.contactId,
      conversation_id: entrada.conversationId,
      message_id: entrada.messageId,
      classificacao: "remarcar",
      origem: entrada.origem,
    },
  });

  // (c) A resposta ao cliente. Cortesia: o pedido já está registrado; não reenvia.
  try {
    await (deps.enviar ?? enviarPeloCaminhoComum)(admin, {
      organizationId: entrada.organizationId,
      conversationId: entrada.conversationId,
      compromissoId: alvo.id,
      corpo: preencher(dicionarioOuEn(RESPOSTA_REMARCAR_PT, RESPOSTA_REMARCAR_EN, idioma), pecas),
      requestId: `agenda-remarcar-cliente:${entrada.messageId}`,
    });
  } catch (err) {
    logger.warn("[agenda] pedido de remarcar gravado, resposta ao cliente não saiu", {
      organization_id: entrada.organizationId,
      appointment_id: alvo.id,
      detail: err instanceof Error ? err.message.slice(0, 160) : "desconhecido",
    });
  }
  return true;
}

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
    if (classificarRespostaDoCliente(entrada.texto) === null) return false;
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

    if (decisao.tipo === "nada") return false;
    // Repetida: nada muda e ninguém responde — nem o agente.
    if (decisao.tipo === "ja_confirmado") return true;

    const alvo = doTipoLigado.find((l) => l.id === decisao.compromissoId)!;
    if (decisao.tipo === "remarcar") return await registrarPedidoDeRemarcar(admin, entrada, alvo, agora, deps);

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
