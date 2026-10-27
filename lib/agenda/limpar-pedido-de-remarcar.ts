/**
 * A PENDÊNCIA DE "O CLIENTE PEDIU PARA REMARCAR" SOME QUANDO A EQUIPE AGE (mudança 007, AC-003.4).
 *
 * O pedido (`client_reschedule_requested_at` + um item aberto na Central) é um
 * recado para a equipe, e o recado perde o sentido quando a equipe remarca ou
 * cancela o compromisso pela agenda. Sem isto a pendência ficaria para sempre
 * apontando para um horário que já foi resolvido.
 *
 * Chamado pelos handlers de remarcar e cancelar (`app/api/v1/agenda/agendamentos/_handler.ts`),
 * o ponto único por onde passam a tela e as ferramentas MCP, sem mudar o contrato
 * de nenhuma rota. Roda DEPOIS de a mudança estar gravada e nunca lança:
 * falhar aqui não pode desfazer um cancelamento que já aconteceu.
 *
 * Remarcar (`horarioMudou`) zera também `client_confirmed_at`: o "1" do cliente
 * valia para o horário antigo, e deixá-lo carimbado "confirmado" no horário novo
 * seria afirmar uma confirmação que ele nunca deu. Cancelar não precisa: o
 * compromisso já não está aberto.
 *
 * Usa o cliente administrativo, sempre filtrando `organization_id` (vem do
 * contexto autenticado do handler, nunca do corpo).
 */
import type { SupabaseClient } from "@supabase/supabase-js";

import { logger } from "@/lib/logger";

export const KIND_PEDIDO_DE_REMARCAR = "agenda_cliente_pediu_remarcar";

export async function limparPedidoDeRemarcar(
  /** Fábrica, e não o cliente: criar o cliente administrativo também pode falhar, e aqui nada sobe. */
  criarAdmin: () => SupabaseClient,
  input: { organizationId: string; compromissoId: string; horarioMudou: boolean },
): Promise<void> {
  try {
    const admin = criarAdmin();
    const agora = new Date().toISOString();
    // Só escreve quando há o que limpar: a maioria dos compromissos nunca teve pedido.
    const base = admin
      .from("calendar_appointments")
      .update(
        input.horarioMudou
          ? { client_reschedule_requested_at: null, client_confirmed_at: null }
          : { client_reschedule_requested_at: null },
      )
      .eq("organization_id", input.organizationId)
      .eq("id", input.compromissoId);
    const { error: erroAp } = await (input.horarioMudou
      ? base.or("client_reschedule_requested_at.not.is.null,client_confirmed_at.not.is.null")
      : base.not("client_reschedule_requested_at", "is", null));
    if (erroAp) throw erroAp;

    const { error: erroItem } = await admin
      .from("agent_inbox_items")
      .update({ status: "resolved", resolved_at: agora })
      .eq("organization_id", input.organizationId)
      .eq("kind", KIND_PEDIDO_DE_REMARCAR)
      .eq("ref_id", input.compromissoId)
      .eq("status", "open");
    if (erroItem) throw erroItem;
  } catch (err) {
    logger.warn("[agenda] pendência de remarcar não foi limpa", {
      organization_id: input.organizationId,
      appointment_id: input.compromissoId,
      detail: err instanceof Error ? err.message.slice(0, 160) : String((err as { message?: string })?.message ?? err).slice(0, 160),
    });
  }
}
