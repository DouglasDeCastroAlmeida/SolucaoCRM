/**
 * Aviso de "a senha da caixa foi recusada" (mudança 005, AC-006.1): um item na Central e um
 * e-mail aos administradores da organização.
 *
 * Melhor esforço nos dois canais: a caixa já está pausada quando isto roda, e falha de aviso
 * nunca desfaz a pausa nem lança. Sem endereço nem senha em log; o e-mail diz QUAL caixa
 * (o endereço dela, que é do próprio destinatário) e o que fazer, sem segredo nenhum.
 *
 * Um item aberto por caixa: se já existe um, não abre outro (a rodada não repete o login,
 * então este aviso já nasce uma vez só; a checagem cobre a corrida entre duas instâncias).
 */
import type { SupabaseClient } from "@supabase/supabase-js";

import { emailsDosAdmins } from "@/lib/cobranca/emails";
import { sendEmail } from "@/lib/email/roteador";
import { traduzir } from "@/lib/i18n/dicionario";
import { normalizarIdioma } from "@/lib/i18n/idiomas";
import { logger } from "@/lib/logger";

export const KIND_SENHA_RECUSADA = "email_senha_recusada" as const;

export interface DependenciasDoAviso {
  enviar?: (m: { to: string; subject: string; html: string; text: string }) => Promise<{ ok: boolean }>;
  emailsDosAdmins?: (admin: SupabaseClient, organizationId: string) => Promise<string[]>;
}

function escapar(t: string): string {
  return t.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

export async function avisarSenhaRecusada(
  admin: SupabaseClient,
  input: { organizationId: string; caixaId: string; endereco: string },
  deps: DependenciasDoAviso = {},
): Promise<{ central: boolean; emails: number }> {
  let idioma = normalizarIdioma(null);
  try {
    const { data } = await admin.from("organizations").select("locale").eq("id", input.organizationId).maybeSingle();
    idioma = normalizarIdioma((data as { locale?: string | null } | null)?.locale);
  } catch {
    // fica no idioma padrão
  }
  const t = (texto: string) => traduzir(texto, idioma);
  const titulo = t("A senha da caixa de e-mail foi recusada");
  const corpo = `${t("O servidor recusou a senha da caixa")} ${input.endereco}. ${t(
    "Pausamos a leitura e o envio dessa caixa para não bloquear a sua conta. Em Conexões, atualize a senha para retomar de onde parou.",
  )}`;

  let central = false;
  try {
    const { data: aberto, error: erroDeLeitura } = await admin
      .from("agent_inbox_items")
      .select("id")
      .eq("organization_id", input.organizationId)
      .eq("kind", KIND_SENHA_RECUSADA)
      .eq("ref_id", input.caixaId)
      .eq("status", "open")
      .maybeSingle();
    if (erroDeLeitura) throw new Error(erroDeLeitura.message);
    if (aberto) {
      central = true;
    } else {
      const { error } = await admin.from("agent_inbox_items").insert({
        organization_id: input.organizationId,
        kind: KIND_SENHA_RECUSADA,
        severity: "warn",
        title: titulo,
        body: corpo,
        ref_kind: "channel_session",
        ref_id: input.caixaId,
      });
      central = !error || error.code === "23505";
      if (!central) logger.warn("[email.aviso] abrir o item na Central falhou", { organizationId: input.organizationId });
    }
  } catch {
    logger.warn("[email.aviso] item da Central interrompido", { organizationId: input.organizationId });
  }

  let emails = 0;
  try {
    const destinatarios = await (deps.emailsDosAdmins ?? emailsDosAdmins)(admin, input.organizationId);
    const enviar = deps.enviar ?? ((m) => sendEmail(m));
    for (const to of destinatarios) {
      const r = await enviar({ to, subject: titulo, html: `<p>${escapar(corpo)}</p>`, text: corpo });
      if (r.ok) emails++;
    }
  } catch {
    logger.warn("[email.aviso] e-mail aos administradores interrompido", { organizationId: input.organizationId });
  }
  return { central, emails };
}
