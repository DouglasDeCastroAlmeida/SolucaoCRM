/**
 * O AVISO DE 80% DO TETO DE IA POR E-MAIL, UMA VEZ POR PERÍODO (mudança 006, AC-004.2).
 *
 * O aviso na Central já existia: o gate (`SQL_ORCAMENTO`) abre um `budget_warning`
 * quando o gasto cruza o limiar. O e-mail ao admin, não: o único chamador morreu
 * na limpeza da 0159. Aqui ele volta, em duas metades que não se misturam:
 *
 *  1. NO GATE (processo do worker, só `pg`): `reivindicarAvisoPorEmail` ganha o
 *     direito de avisar neste mês por UM comando — carimba
 *     `ai_budgets.last_alarm_sent_at` e, no mesmo statement, emite o evento
 *     `ai.budget_warning`. Dois processos cruzando o limiar ao mesmo tempo: só um
 *     vê a linha atualizada, só um emite. Carimbo e evento andam juntos para o
 *     e-mail não se perder entre os dois (nem sair sem o carimbo).
 *  2. NO DRENO DE EVENTOS (processo do app, onde mora o e-mail): o handler lê o
 *     evento e manda a mensagem aos administradores
 *     (`aviso-por-email.handler.ts`). Este arquivo guarda só o que é puro ou
 *     injetável, para o gate não arrastar o e-mail para dentro do worker.
 *
 * Novo período = novo mês civil, a mesma régua de `fn_gasto_de_ia_do_mes`: o
 * carimbo do mês passado deixa de valer e o próximo cruzamento avisa de novo.
 *
 * MELHOR ESFORÇO, SEMPRE: nada aqui lança para quem chama. A Central já mostra o
 * aviso; um e-mail que não sai (Resend ausente, SMTP fora) vira log, nunca erro.
 */
import type pg from "pg";


export const EVENTO_AVISO_DE_ORCAMENTO = "ai.budget_warning";

/**
 * `$1` organization_id, `$2` o tipo do evento, `$3` o payload (jsonb).
 * Devolve uma linha só para quem venceu a reivindicação do mês.
 */
export const SQL_REIVINDICAR_AVISO_POR_EMAIL = `
with reivindicado as (
  update ai_budgets
     set last_alarm_sent_at = now()
   where organization_id = $1
     and (last_alarm_sent_at is null or last_alarm_sent_at < date_trunc('month', now()))
  returning organization_id
)
insert into event_log (organization_id, event_type, entity_kind, entity_id, payload)
select organization_id, $2, 'ai_budget', organization_id, $3::jsonb
  from reivindicado
returning id
`;

export async function reivindicarAvisoPorEmail(
  db: Pick<pg.Pool, "query">,
  d: { organizationId: string; gastoCents: number; tetoCents: number },
): Promise<boolean> {
  try {
    const { rows } = await db.query(SQL_REIVINDICAR_AVISO_POR_EMAIL, [
      d.organizationId,
      EVENTO_AVISO_DE_ORCAMENTO,
      JSON.stringify({ gasto_cents: d.gastoCents, teto_cents: d.tetoCents }),
    ]);
    return rows.length > 0;
  } catch {
    // O aviso por e-mail é um extra da Central: falhar aqui não pode trocar a
    // resposta do agente por um erro de banco.
    return false;
  }
}
