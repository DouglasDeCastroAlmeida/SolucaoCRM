/**
 * O limite de envio de cada caixa (mudança 005, AC-005.1 a AC-005.3).
 *
 * Provedor de e-mail bloqueia a conta que manda demais e depressa; quem paga é o cliente.
 * Duas travas por caixa, ambas configuráveis em `email_config`:
 *
 * - **Teto diário** (padrão 200): o que passa do teto NÃO falha, fica na fila para o início
 *   do dia seguinte NO FUSO DA ORGANIZAÇÃO, e a Central avisa. O contador mora em
 *   `email_envios_dia`, uma linha por caixa e dia local, então a virada do dia não precisa de
 *   cron para zerar: o dia novo simplesmente não tem linha.
 * - **Intervalo mínimo** entre dois envios da mesma caixa, medido pelo último envio feito.
 *
 * Aqui só há decisão e contabilidade; quem adia a mensagem é o handler de envio, e quem a
 * reenvia é a rodada (`fila.ts`). O relógio entra por parâmetro. Toda consulta leva
 * `organization_id` à mão (client de service role).
 */
import type { SupabaseClient } from "@supabase/supabase-js";

import { logger } from "@/lib/logger";

export const FUSO_PADRAO = "America/Sao_Paulo";
export const KIND_TETO_ATINGIDO = "email_teto_atingido" as const;

export type Admissao =
  | { ok: true }
  | { ok: false; adiarAte: Date; motivo: "teto_diario" | "intervalo" };

function fusoValido(fuso: string | null | undefined): string {
  if (!fuso) return FUSO_PADRAO;
  try {
    new Intl.DateTimeFormat("en-CA", { timeZone: fuso });
    return fuso;
  } catch {
    return FUSO_PADRAO;
  }
}

/** O fuso da organização; qualquer coisa ilegível cai no padrão do produto. Nunca lança. */
export async function fusoDaOrganizacao(admin: SupabaseClient, organizationId: string): Promise<string> {
  try {
    const { data } = await admin.from("organizations").select("timezone").eq("id", organizationId).maybeSingle();
    return fusoValido((data as { timezone?: string | null } | null)?.timezone);
  } catch {
    return FUSO_PADRAO;
  }
}

/** A data (AAAA-MM-DD) que `instante` tem no fuso. */
export function diaNoFuso(instante: Date, fuso: string): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: fusoValido(fuso),
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(instante);
}

/** Quantos ms o relógio de parede do fuso está à frente de UTC naquele instante. */
function deslocamentoDoFusoMs(instante: Date, fuso: string): number {
  const partes = new Intl.DateTimeFormat("en-US", {
    timeZone: fuso,
    hourCycle: "h23",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  }).formatToParts(instante);
  const n = (tipo: string) => Number(partes.find((x) => x.type === tipo)?.value ?? 0);
  const comoUtc = Date.UTC(n("year"), n("month") - 1, n("day"), n("hour"), n("minute"), n("second"));
  return comoUtc - Math.floor(instante.getTime() / 1000) * 1000;
}

/** O instante em que o próximo dia começa (00:00 local) no fuso. */
export function inicioDoDiaSeguinte(instante: Date, fuso: string): Date {
  const f = fusoValido(fuso);
  const [a, m, d] = diaNoFuso(instante, f).split("-").map(Number) as [number, number, number];
  const meiaNoiteComoUtc = Date.UTC(a, m - 1, d + 1, 0, 0, 0);
  // Duas passadas: o deslocamento pode mudar entre o chute e o instante real (horário de verão).
  let alvo = meiaNoiteComoUtc - deslocamentoDoFusoMs(new Date(meiaNoiteComoUtc), f);
  alvo = meiaNoiteComoUtc - deslocamentoDoFusoMs(new Date(alvo), f);
  return new Date(alvo);
}

export interface ParametrosDeAdmissao {
  organizationId: string;
  caixaId: string;
  tetoDiario: number;
  intervaloSegundos: number;
  fuso: string;
  agora: Date;
}

/** LANÇA se o banco falha: quem chama decide (o adaptador adia, em vez de arriscar a conta). */
export async function decidirAdmissao(admin: SupabaseClient, p: ParametrosDeAdmissao): Promise<Admissao> {
  const dia = diaNoFuso(p.agora, p.fuso);
  const { data: contagem, error: erroDaContagem } = await admin
    .from("email_envios_dia")
    .select("quantidade")
    .eq("organization_id", p.organizationId)
    .eq("channel_session_id", p.caixaId)
    .eq("dia", dia)
    .maybeSingle();
  if (erroDaContagem) throw new Error(`email_limite_contagem_failed: ${erroDaContagem.message}`);
  const feitos = Number((contagem as { quantidade?: number } | null)?.quantidade ?? 0);
  if (feitos >= p.tetoDiario) {
    return { ok: false, motivo: "teto_diario", adiarAte: inicioDoDiaSeguinte(p.agora, p.fuso) };
  }

  if (p.intervaloSegundos > 0) {
    const { data: ultimo, error: erroDoUltimo } = await admin
      .from("messages")
      .select("sent_at")
      .eq("organization_id", p.organizationId)
      .eq("channel_session_id", p.caixaId)
      .eq("direction", "outbound")
      .eq("status", "sent")
      .order("sent_at", { ascending: false })
      .limit(1);
    if (erroDoUltimo) throw new Error(`email_limite_intervalo_failed: ${erroDoUltimo.message}`);
    const quando = (ultimo as Array<{ sent_at?: string | null }> | null)?.[0]?.sent_at;
    if (quando) {
      const liberaEm = new Date(quando).getTime() + p.intervaloSegundos * 1000;
      if (p.agora.getTime() < liberaEm) return { ok: false, motivo: "intervalo", adiarAte: new Date(liberaEm) };
    }
  }
  return { ok: true };
}

/** Soma um envio feito ao contador do dia local. Melhor esforço: a mensagem já saiu. */
export async function registrarEnvioFeito(
  admin: SupabaseClient,
  input: { organizationId: string; caixaId: string; fuso: string; agora: Date },
): Promise<void> {
  const dia = diaNoFuso(input.agora, input.fuso);
  try {
    for (let tentativa = 0; tentativa < 2; tentativa++) {
      const { data: atual, error } = await admin
        .from("email_envios_dia")
        .select("quantidade")
        .eq("organization_id", input.organizationId)
        .eq("channel_session_id", input.caixaId)
        .eq("dia", dia)
        .maybeSingle();
      if (error) throw new Error(error.message);
      if (atual) {
        const { error: erroDeUpdate } = await admin
          .from("email_envios_dia")
          .update({ quantidade: Number((atual as { quantidade: number }).quantidade) + 1 })
          .eq("organization_id", input.organizationId)
          .eq("channel_session_id", input.caixaId)
          .eq("dia", dia);
        if (erroDeUpdate) throw new Error(erroDeUpdate.message);
        return;
      }
      const { error: erroDeInsert } = await admin
        .from("email_envios_dia")
        .insert({ organization_id: input.organizationId, channel_session_id: input.caixaId, dia, quantidade: 1 });
      if (!erroDeInsert) return;
      // 23505: outro envio criou a linha entre a leitura e a escrita; relê e soma.
      if (erroDeInsert.code !== "23505") throw new Error(erroDeInsert.message);
    }
  } catch {
    logger.warn("[email.limite] não foi possível contar o envio do dia", { organizationId: input.organizationId });
  }
}

/** Abre o aviso "teto atingido" na Central, uma vez enquanto houver um aberto. Nunca lança. */
export async function avisarTetoAtingido(
  admin: SupabaseClient,
  input: { organizationId: string; caixaId: string; endereco: string },
): Promise<void> {
  try {
    const { data: aberto, error: erroDeLeitura } = await admin
      .from("agent_inbox_items")
      .select("id")
      .eq("organization_id", input.organizationId)
      .eq("kind", KIND_TETO_ATINGIDO)
      .eq("ref_id", input.caixaId)
      .eq("status", "open")
      .maybeSingle();
    if (erroDeLeitura) throw new Error(erroDeLeitura.message);
    if (aberto) return;
    const { error } = await admin.from("agent_inbox_items").insert({
      organization_id: input.organizationId,
      kind: KIND_TETO_ATINGIDO,
      status: "open",
      severity: "warn",
      title: "A caixa de e-mail atingiu o limite de envios do dia",
      body: `A caixa ${input.endereco} chegou ao limite diário. O que passou do limite está na fila e sai sozinho amanhã. Para enviar mais, aumente o limite da caixa em Conexões.`,
      ref_kind: "channel_session",
      ref_id: input.caixaId,
    });
    if (error && error.code !== "23505") {
      logger.warn("[email.limite] abrir o aviso do teto falhou", { organizationId: input.organizationId });
    }
  } catch {
    logger.warn("[email.limite] aviso do teto interrompido", { organizationId: input.organizationId });
  }
}

/** Fecha o aviso aberto quando o dia vira e a fila volta a sair. Nunca lança. */
export async function resolverAvisoTeto(admin: SupabaseClient, organizationId: string, caixaId: string): Promise<void> {
  try {
    await admin
      .from("agent_inbox_items")
      .update({ status: "resolved", resolved_at: new Date().toISOString() })
      .eq("organization_id", organizationId)
      .eq("kind", KIND_TETO_ATINGIDO)
      .eq("ref_id", caixaId)
      .eq("status", "open");
  } catch {
    logger.warn("[email.limite] fechar o aviso do teto interrompido", { organizationId });
  }
}
