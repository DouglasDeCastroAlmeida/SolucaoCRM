import { requireSupportWrite } from "@/lib/impersonate/support";
/**
 * ATIVAR LEMBRETES PADRÃO — num tipo de agendamento que já existia.
 *
 * Tipo criado depois da mudança 007 já nasce com os dois lembretes (24 h e 2 h).
 * Os que existiam ficam como estavam (AC-001.2), e esta rota é a porta, de UM
 * clique, para quem quer o mesmo: liga os dois degraus com o texto padrão e só
 * isso. Não toca duração, categoria, canal nem nenhum outro campo.
 *
 * Quem já tem lembrete ligado recebe 409 em vez de ter o texto sobrescrito: o
 * botão só faz sentido em tipo sem lembretes, e apagar a mensagem que alguém
 * escreveu seria perda de trabalho.
 *
 * Mesmo papel (`manager`), mesma guarda de suporte e mesmo filtro explícito de
 * `organization_id` (da sessão, nunca do corpo) das rotas irmãs `reativar` e
 * `DELETE`. Ato de gestão com verbo próprio na trilha.
 */
import { type NextRequest } from "next/server";
import { z } from "zod";

import { confirmacaoDoClienteLigadaNaInstalacao } from "@/lib/agenda/aplicar-confirmacao-do-cliente";
import { camposDoLembretePadrao, idiomaDoTextoPadrao } from "@/lib/agenda/lembrete-padrao";
import { fail, ok } from "@/lib/api/wrappers";
import { audit } from "@/lib/audit";
import { requireRole } from "@/lib/auth/require-role";
import { traduzir } from "@/lib/i18n/dicionario";
import { createAdminClient } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";

const corpo = z.object({ id: z.string().uuid() });

export async function POST(req: NextRequest): Promise<Response> {
  const supportDenied = await requireSupportWrite();
  if (supportDenied) return supportDenied;

  const requestId = req.headers.get("x-request-id") ?? undefined;
  const autorizado = await requireRole("manager", { requestId, resource: "calendar_event_types" });
  if (!autorizado.ok) return autorizado.response;
  const t = (texto: string) => traduzir(texto, autorizado.user.idioma);
  const org = autorizado.org.orgId;

  const lido = corpo.safeParse(await req.json().catch(() => ({})));
  if (!lido.success) return fail("validation_failed", t("corpo inválido"), 422, { requestId });

  const admin = createAdminClient();
  const { data: atual, error: erroLeitura } = await admin
    .from("calendar_event_types")
    .select("id, reminder_enabled, client_confirmation_enabled")
    .eq("id", lido.data.id)
    .eq("organization_id", org)
    .maybeSingle();
  if (erroLeitura) return fail("internal_error", erroLeitura.message, 500, { requestId });
  if (!atual) return fail("not_found", t("Tipo de agendamento não encontrado."), 404, { requestId });
  if (atual.reminder_enabled) {
    return fail("conflict", t("Este tipo já tem lembretes ligados."), 409, { requestId });
  }

  const { data: o } = await admin.from("organizations").select("locale").eq("id", org).maybeSingle();
  const campos = camposDoLembretePadrao(
    idiomaDoTextoPadrao(o?.locale),
    atual.client_confirmation_enabled === true && confirmacaoDoClienteLigadaNaInstalacao(),
  );

  const { data, error } = await admin
    .from("calendar_event_types")
    .update(campos)
    .eq("id", lido.data.id)
    .eq("organization_id", org)
    // Corrida: se alguém ligou entre a leitura e a escrita, não sobrescreve.
    .eq("reminder_enabled", false)
    .select("id")
    .maybeSingle();
  if (error) return fail("internal_error", error.message, 500, { requestId });
  if (!data) return fail("conflict", t("Este tipo já tem lembretes ligados."), 409, { requestId });

  await audit({
    actorUserId: autorizado.user.id,
    action: "agenda.tipo_lembretes_padrao_ativados",
    organizationId: org,
    resourceType: "calendar_event_types",
    resourceId: lido.data.id,
    metadata: { degraus: [1440, 120] },
  });
  return ok(data, { requestId });
}
