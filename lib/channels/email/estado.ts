/**
 * Estado de sincronização de cada caixa (`email_sync_estado`, mudança 005): o cursor por
 * UID, a trava da rodada, as falhas seguidas e a pausa.
 *
 * Toda consulta leva `organization_id` à mão (client de service role). A trava é um
 * compare-and-swap em `travado_ate`: duas rodadas sobrepostas nunca leem a mesma caixa.
 */
import type { SupabaseClient } from "@supabase/supabase-js";

export type MotivoDePausa = "senha_recusada" | "senha_ausente" | "pausada_pela_equipe";

export interface EstadoDaCaixa {
  channelSessionId: string;
  uidValidity: string | null;
  ultimoUid: number;
  ultimaRodadaEm: string | null;
  travadoAte: string | null;
  falhasSeguidas: number;
  pausaMotivo: string | null;
}

const COLUNAS = "channel_session_id, uidvalidity, ultimo_uid, ultima_rodada_em, travado_ate, falhas_seguidas, pausa_motivo";

type Linha = {
  channel_session_id: string;
  uidvalidity: number | string | null;
  ultimo_uid: number | string;
  ultima_rodada_em: string | null;
  travado_ate: string | null;
  falhas_seguidas: number;
  pausa_motivo: string | null;
};

function paraEstado(l: Linha): EstadoDaCaixa {
  return {
    channelSessionId: l.channel_session_id,
    uidValidity: l.uidvalidity === null || l.uidvalidity === undefined ? null : String(l.uidvalidity),
    ultimoUid: Number(l.ultimo_uid),
    ultimaRodadaEm: l.ultima_rodada_em,
    travadoAte: l.travado_ate,
    falhasSeguidas: l.falhas_seguidas,
    pausaMotivo: l.pausa_motivo,
  };
}

/** O estado da caixa, ou `null` se a caixa nunca foi inicializada. LANÇA se a consulta falha. */
export async function lerEstado(admin: SupabaseClient, organizationId: string, caixaId: string): Promise<EstadoDaCaixa | null> {
  const { data, error } = await admin
    .from("email_sync_estado")
    .select(COLUNAS)
    .eq("organization_id", organizationId)
    .eq("channel_session_id", caixaId)
    .maybeSingle();
  if (error) throw new Error(`email_estado_lookup_failed: ${error.message}`);
  return data ? paraEstado(data as Linha) : null;
}

/**
 * O motivo da pausa de cada caixa da organização (`null` = ativa). Caixa sem linha de estado não
 * aparece no mapa. LANÇA se a consulta falha: "ativa" e "não sei" são coisas diferentes.
 */
export async function listarPausas(admin: SupabaseClient, organizationId: string): Promise<Map<string, string | null>> {
  const { data, error } = await admin
    .from("email_sync_estado")
    .select("channel_session_id, pausa_motivo")
    .eq("organization_id", organizationId);
  if (error) throw new Error(`email_pausas_lookup_failed: ${error.message}`);
  return new Map(
    ((data as { channel_session_id: string; pausa_motivo: string | null }[] | null) ?? []).map((l) => [
      l.channel_session_id,
      l.pausa_motivo,
    ]),
  );
}

/**
 * Pega a trava da caixa por `ateQuando`. Devolve `false` se outra rodada a tem (ainda
 * dentro do prazo). Dois passos, porque o CAS precisa distinguir "livre" de "vencida".
 */
export async function pegarTrava(
  admin: SupabaseClient,
  organizationId: string,
  caixaId: string,
  agora: Date,
  ateQuando: Date,
): Promise<boolean> {
  const base = () =>
    admin
      .from("email_sync_estado")
      .update({ travado_ate: ateQuando.toISOString() })
      .eq("organization_id", organizationId)
      .eq("channel_session_id", caixaId);
  const livre = await base().is("travado_ate", null).select("channel_session_id");
  if (livre.error) throw new Error(`email_trava_failed: ${livre.error.message}`);
  if ((livre.data ?? []).length > 0) return true;
  const vencida = await base().lt("travado_ate", agora.toISOString()).select("channel_session_id");
  if (vencida.error) throw new Error(`email_trava_failed: ${vencida.error.message}`);
  return (vencida.data ?? []).length > 0;
}

export async function soltarTrava(admin: SupabaseClient, organizationId: string, caixaId: string): Promise<void> {
  await admin
    .from("email_sync_estado")
    .update({ travado_ate: null })
    .eq("organization_id", organizationId)
    .eq("channel_session_id", caixaId);
}

/** Avança o cursor depois de UMA mensagem tratada: se a rodada cair, retoma dali. */
export async function avancarCursor(
  admin: SupabaseClient,
  organizationId: string,
  caixaId: string,
  ultimoUid: number,
): Promise<void> {
  const { error } = await admin
    .from("email_sync_estado")
    .update({ ultimo_uid: ultimoUid, updated_at: new Date().toISOString() })
    .eq("organization_id", organizationId)
    .eq("channel_session_id", caixaId);
  if (error) throw new Error(`email_cursor_failed: ${error.message}`);
}

/**
 * UIDVALIDITY mudou (ou primeira leitura): descarta o cursor e recomeça de "agora", sem
 * importar o passado (o `unique` do Message-ID cobre qualquer repetição).
 */
export async function reposicionarCursor(
  admin: SupabaseClient,
  organizationId: string,
  caixaId: string,
  uidValidity: string,
  ultimoUid: number,
): Promise<void> {
  const { error } = await admin
    .from("email_sync_estado")
    .update({ uidvalidity: uidValidity, ultimo_uid: ultimoUid, updated_at: new Date().toISOString() })
    .eq("organization_id", organizationId)
    .eq("channel_session_id", caixaId);
  if (error) throw new Error(`email_cursor_failed: ${error.message}`);
}

export async function registrarRodadaBoa(admin: SupabaseClient, organizationId: string, caixaId: string, agora: Date): Promise<void> {
  await admin
    .from("email_sync_estado")
    .update({ ultima_rodada_em: agora.toISOString(), falhas_seguidas: 0, travado_ate: null, updated_at: agora.toISOString() })
    .eq("organization_id", organizationId)
    .eq("channel_session_id", caixaId);
}

/**
 * Carimba a vez da caixa sem tocar em falhas nem trava. Usado quando a rodada PULA a caixa
 * (organização parada, canal desativado, arquivada): sem isto ela ficaria entre as mais antigas
 * para sempre e, com 20 ou mais assim, tomaria todas as vagas do rodízio.
 */
export async function carimbarRodada(admin: SupabaseClient, organizationId: string, caixaId: string, agora: Date): Promise<void> {
  await admin
    .from("email_sync_estado")
    .update({ ultima_rodada_em: agora.toISOString() })
    .eq("organization_id", organizationId)
    .eq("channel_session_id", caixaId);
}

export async function registrarFalha(
  admin: SupabaseClient,
  organizationId: string,
  caixaId: string,
  agora: Date,
  falhasAnteriores: number,
): Promise<void> {
  await admin
    .from("email_sync_estado")
    .update({
      ultima_rodada_em: agora.toISOString(),
      falhas_seguidas: falhasAnteriores + 1,
      travado_ate: null,
      updated_at: agora.toISOString(),
    })
    .eq("organization_id", organizationId)
    .eq("channel_session_id", caixaId);
}

/** Pausa a leitura e o envio; só `retomar` desfaz. A trava também cai. */
export async function pausar(
  admin: SupabaseClient,
  organizationId: string,
  caixaId: string,
  motivo: MotivoDePausa,
): Promise<void> {
  const { error } = await admin
    .from("email_sync_estado")
    .update({ pausa_motivo: motivo, travado_ate: null, updated_at: new Date().toISOString() })
    .eq("organization_id", organizationId)
    .eq("channel_session_id", caixaId);
  if (error) throw new Error(`email_pausa_failed: ${error.message}`);
}

/** Retoma de onde parou: o cursor não se mexe. */
export async function retomar(admin: SupabaseClient, organizationId: string, caixaId: string): Promise<void> {
  const { error } = await admin
    .from("email_sync_estado")
    .update({ pausa_motivo: null, falhas_seguidas: 0, updated_at: new Date().toISOString() })
    .eq("organization_id", organizationId)
    .eq("channel_session_id", caixaId);
  if (error) throw new Error(`email_retomada_failed: ${error.message}`);
}

/** Espera antes de tentar a caixa de novo depois de falhas seguidas: 1, 2, 4, 8, 16 min, teto de 30. */
export function recuoEmMs(falhasSeguidas: number): number {
  if (falhasSeguidas <= 0) return 0;
  return Math.min(2 ** (falhasSeguidas - 1), 30) * 60_000;
}
