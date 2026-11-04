/**
 * PATCH /api/v1/channels/email/[id] — assinatura, teto diário, intervalo e troca de senha da
 * caixa. Pausar e retomar entram junto com a rodada (Fatia 6).
 *
 * Só admin; guarda de suporte antes do efeito; Zod estrito; a caixa é achada por
 * (organização do login, id): caixa de outra organização é 404, nunca 403 (não confirma que existe).
 * Senha nova só é guardada depois de entrar na caixa com ela.
 */
import { randomUUID } from "node:crypto";
import type { NextRequest, NextResponse } from "next/server";

import { fail, ok } from "@/lib/api/wrappers";
import { audit } from "@/lib/audit";
import { requireRole } from "@/lib/auth/require-role";
import {
  acharCaixa,
  alterarSchema,
  atualizarConfigDaCaixa,
  visaoPublicaDaCaixa,
  type ConfigDaCaixaGuardada,
} from "@/lib/channels/email/caixa";
import { verificarCaixa } from "@/lib/channels/email/conexao";
import { respostaDaFalhaDeConexao, semSegredo, tentativasEsgotadas } from "@/lib/channels/email/rotas";
import { gravarSenhaDaCaixa, ultimosQuatro } from "@/lib/channels/email/segredo";
import { traduzir } from "@/lib/i18n/dicionario";
import { requireSupportWrite } from "@/lib/impersonate/support";
import { logger } from "@/lib/logger";
import { createAdminClient } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function PATCH(
  req: NextRequest,
  contexto: { params: Promise<{ id: string }> },
): Promise<NextResponse> {
  const supportDenied = await requireSupportWrite();
  if (supportDenied) return supportDenied;

  const requestId = randomUUID();
  const authz = await requireRole("admin", { requestId, resource: "channels_email" });
  if (!authz.ok) return authz.response;
  const t = (texto: string) => traduzir(texto, authz.user.idioma);
  const orgId = authz.org.orgId;
  const { id } = await contexto.params;
  // Id que não é UUID nunca existe: 404 em vez de deixar o Postgres devolver 22P02 e virar 500.
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id)) {
    return fail("not_found", t("Caixa de e-mail não encontrada."), 404, { requestId });
  }

  const parsed = alterarSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return fail("validation_failed", t("Confira os dados da caixa de e-mail."), 422, { requestId });
  }
  const d = parsed.data;

  const admin = createAdminClient();
  const caixa = await acharCaixa(admin, orgId, id);
  if (!caixa) return fail("not_found", t("Caixa de e-mail não encontrada."), 404, { requestId });

  const config: ConfigDaCaixaGuardada = {
    ...caixa.config,
    ...(d.assinatura !== undefined ? { assinatura: d.assinatura } : {}),
    ...(d.teto_diario !== undefined ? { teto_diario: d.teto_diario } : {}),
    ...(d.intervalo_segundos !== undefined ? { intervalo_segundos: d.intervalo_segundos } : {}),
  };

  if (d.senha !== undefined) {
    const barrada = await tentativasEsgotadas(orgId, requestId, t);
    if (barrada) return barrada;

    const verificacao = await verificarCaixa(
      {
        endereco: caixa.endereco,
        usuario: caixa.config.usuario,
        senha: d.senha,
        imap: caixa.config.imap,
        smtp: caixa.config.smtp,
      },
      { enviarTeste: false },
    );
    if (!verificacao.ok) return respostaDaFalhaDeConexao(verificacao, t, requestId);

    const gravada = await gravarSenhaDaCaixa(admin, { organizationId: orgId, channelSessionId: id, senha: d.senha });
    if (!gravada.ok) {
      if (gravada.motivo === "cifra_indisponivel") {
        return fail("invalid_request", t("cifra indisponível nesta instalação — a chave não foi gravada"), 422, {
          requestId,
        });
      }
      return fail("internal_error", t("Não foi possível salvar a caixa agora. Tente de novo."), 500, { requestId });
    }
    config.senha_ultimos4 = ultimosQuatro(d.senha);
  }

  const { error } = await atualizarConfigDaCaixa(admin, { organizationId: orgId, channelSessionId: id, config });
  if (error) {
    logger.error("[email.alterar] gravar a configuração falhou", { requestId, erro: semSegredo(error, d.senha ?? "") });
    return fail("internal_error", t("Não foi possível salvar a caixa agora. Tente de novo."), 500, { requestId });
  }

  void audit({
    action: "channel.email_updated",
    actorUserId: authz.user.id,
    organizationId: orgId,
    resourceType: "channel_session",
    resourceId: id,
    requestId,
    // Só os NOMES do que mudou; o valor da senha nunca entra aqui.
    metadata: { endereco: caixa.endereco, campos: Object.keys(d) },
  });

  return ok(visaoPublicaDaCaixa({ ...caixa, config }), { requestId });
}
