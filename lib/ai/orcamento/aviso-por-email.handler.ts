/**
 * Consumidor do evento `ai.budget_warning` (mudança 006, AC-004.2): manda aos
 * administradores da organização o e-mail de "o gasto com IA chegou a 80%".
 *
 * O evento já nasce UMA vez por mês (a reivindicação está no gate, em
 * `aviso-por-email.ts`), então aqui não há dedup: um evento, um envio por
 * administrador. Melhor esforço — o aviso também está na Central; e-mail que
 * não sai (sem Resend nem SMTP) vira `skipped` com o motivo, sem erro e sem
 * nova tentativa (repetir mandaria em dobro a quem já recebeu).
 */
import { marcaDaSaida } from "@/lib/branding/saida";
import { sendEmail } from "@/lib/email/roteador";
import { env } from "@/lib/env";
import type { EventHandler, EventRow, HandlerResult } from "@/lib/event-log/dispatcher";
import { normalizarIdioma, type Idioma } from "@/lib/i18n/idiomas";
import { logger } from "@/lib/logger";
import { emailsDosAdmins } from "@/lib/cobranca/emails";
import { createAdminClient } from "@/lib/supabase/admin";

import { EVENTO_AVISO_DE_ORCAMENTO } from "./aviso-por-email";
import { enviarAvisoDeOrcamentoPorEmail, type EntradaDoEnvio } from "./aviso-por-email-envio";

const CONSUMER_KEY = "ai.orcamento-aviso-por-email";

const resultado = (status: HandlerResult["status"], detail?: string): HandlerResult => ({
  consumer_key: CONSUMER_KEY,
  status,
  detail,
});

export interface DepsDoAviso {
  idiomaDaOrganizacao: (organizationId: string) => Promise<Idioma>;
  emailsDosAdmins: (organizationId: string) => Promise<string[]>;
  marca: (organizationId: string) => Promise<EntradaDoEnvio["marca"]>;
  enviar: EntradaDoEnvio["enviar"];
  baseDaUrl: () => string;
}

export async function processarAvisoDeOrcamento(row: EventRow, deps: DepsDoAviso): Promise<HandlerResult> {
  const gasto = row.payload?.gasto_cents;
  const teto = row.payload?.teto_cents;
  if (typeof gasto !== "number" || typeof teto !== "number" || !Number.isFinite(gasto) || !Number.isFinite(teto)) {
    return resultado("skipped", "payload_invalido");
  }
  try {
    const [idioma, destinatarios, marca] = await Promise.all([
      deps.idiomaDaOrganizacao(row.organization_id),
      deps.emailsDosAdmins(row.organization_id),
      deps.marca(row.organization_id),
    ]);
    const r = await enviarAvisoDeOrcamentoPorEmail({
      organizationId: row.organization_id,
      gastoCents: gasto,
      tetoCents: teto,
      idioma,
      marca,
      link: `${deps.baseDaUrl().replace(/\/+$/, "")}/app/ai/usage`,
      destinatarios,
      enviar: deps.enviar,
    });
    if (r.semEmail) return resultado("skipped", "email_nao_configurado");
    if (r.falhas > 0) {
      logger.warn("ai_orcamento.email_nao_saiu", { organization_id: row.organization_id, falhas: r.falhas });
    }
    return resultado("ok", `enviados=${r.enviados}`);
  } catch (e) {
    logger.warn("ai_orcamento.email_falhou", {
      organization_id: row.organization_id,
      erro: e instanceof Error ? e.message : "desconhecido",
    });
    return resultado("skipped", "leitura_falhou");
  }
}

const depsReais: DepsDoAviso = {
  idiomaDaOrganizacao: async (organizationId) => {
    const { data } = await createAdminClient()
      .from("organizations")
      .select("locale")
      .eq("id", organizationId)
      .maybeSingle();
    return normalizarIdioma((data as { locale?: string | null } | null)?.locale);
  },
  emailsDosAdmins: (organizationId) => emailsDosAdmins(createAdminClient(), organizationId),
  marca: (organizationId) => marcaDaSaida(organizationId),
  enviar: (m) => sendEmail(m),
  baseDaUrl: () => env.NEXT_PUBLIC_APP_URL ?? "",
};

export const avisoDeOrcamentoPorEmailHandler: EventHandler = {
  key: CONSUMER_KEY,
  // Sai por rede de terceiro: organização parada não recebe.
  naOrgParada: "pula",
  events: [EVENTO_AVISO_DE_ORCAMENTO],
  handle: (row) => processarAvisoDeOrcamento(row, depsReais),
};
