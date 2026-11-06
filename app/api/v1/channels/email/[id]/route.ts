/**
 * PATCH /api/v1/channels/email/[id] — assinatura, teto diário, intervalo e troca de senha da
 * caixa, e pausar/retomar (`pausada`).
 *
 * Só admin; guarda de suporte antes do efeito; Zod estrito; a caixa é achada por
 * (organização do login, id): caixa de outra organização é 404, nunca 403 (não confirma que existe).
 * Senha nova só é guardada depois de entrar na caixa com ela.
 *
 * DELETE remove a caixa (REQ-008): para a leitura e o envio, apaga a senha guardada e ARQUIVA a
 * linha — conversas e mensagens ficam. Mesmo guarda, mesmo papel, mesma busca por organização.
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
import { resolverAvisoSenhaRecusada } from "@/lib/channels/email/avisos";
import { removerCaixa } from "@/lib/channels/email/remocao";
import { lerEstado, pausar, retomar } from "@/lib/channels/email/estado";
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

  // Retomar uma caixa parada por senha recusada sem trocar a senha só a faria parar de novo na
  // rodada seguinte (e abriria outro aviso): quem retoma nesse caso é a senha nova.
  let pausaAtual: string | null = null;
  try {
    pausaAtual = (await lerEstado(admin, orgId, id))?.pausaMotivo ?? null;
  } catch (erro) {
    logger.error("[email.alterar] ler o estado da caixa falhou", {
      requestId,
      erro: erro instanceof Error ? erro.message.slice(0, 120) : "desconhecido",
    });
    // Quem só muda assinatura ou teto não depende do estado; quem pausa ou retoma, sim.
    if (d.pausada !== undefined) {
      return fail("internal_error", t("Não foi possível salvar a caixa agora. Tente de novo."), 500, { requestId });
    }
  }
  const paradaPorSenha = pausaAtual === "senha_recusada" || pausaAtual === "senha_ausente";
  if (d.pausada === false && paradaPorSenha && d.senha === undefined) {
    return fail(
      "validation_failed",
      t("A senha desta caixa foi recusada. Informe a senha nova para retomar."),
      422,
      { requestId },
    );
  }

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
        return fail("invalid_request", t("Não foi possível guardar a senha com segurança neste servidor. Peça a quem instalou o sistema para conferir a chave de segurança e tente de novo."), 422, {
          requestId,
        });
      }
      return fail("internal_error", t("Não foi possível salvar a caixa agora. Tente de novo."), 500, { requestId });
    }
    config.senha_ultimos4 = ultimosQuatro(d.senha);
  }

  const mudouConfig = Object.keys(d).some((k) => k !== "pausada");
  const { error } = mudouConfig
    ? await atualizarConfigDaCaixa(admin, { organizationId: orgId, channelSessionId: id, config })
    : { error: null };
  if (error) {
    logger.error("[email.alterar] gravar a configuração falhou", { requestId, erro: semSegredo(error, d.senha ?? "") });
    return fail("internal_error", t("Não foi possível salvar a caixa agora. Tente de novo."), 500, { requestId });
  }

  // Senha nova de uma caixa que estava pausada por senha recusada: volta a ler de onde parou.
  if (d.senha !== undefined) {
    try {
      if (pausaAtual === "senha_recusada" || pausaAtual === "senha_ausente") {
        await retomar(admin, orgId, id);
        await resolverAvisoSenhaRecusada(admin, orgId, id);
        pausaAtual = null;
      }
    } catch (erro) {
      logger.warn("[email.alterar] retomar a caixa depois da senha nova falhou", {
        requestId,
        erro: erro instanceof Error ? erro.message.slice(0, 120) : "desconhecido",
      });
    }
  }

  // Pausar e retomar (AC-008.2): só o estado muda. O cursor de leitura não é tocado, então
  // retomar continua do ponto em que parou, e as conversas ficam intactas.
  let pausaFinal = pausaAtual;
  let acaoDaPausa: "channel.email_paused" | "channel.email_resumed" | null = null;
  if (d.pausada === true && pausaAtual === null) {
    try {
      await pausar(admin, orgId, id, "pausada_pela_equipe");
    } catch {
      return fail("internal_error", t("Não foi possível salvar a caixa agora. Tente de novo."), 500, { requestId });
    }
    pausaFinal = "pausada_pela_equipe";
    acaoDaPausa = "channel.email_paused";
  } else if (d.pausada === false && pausaAtual !== null) {
    try {
      await retomar(admin, orgId, id);
    } catch {
      return fail("internal_error", t("Não foi possível salvar a caixa agora. Tente de novo."), 500, { requestId });
    }
    pausaFinal = null;
    acaoDaPausa = "channel.email_resumed";
  } else if (d.pausada === false) {
    pausaFinal = null;
  }
  if (acaoDaPausa) {
    void audit({
      action: acaoDaPausa,
      actorUserId: authz.user.id,
      organizationId: orgId,
      resourceType: "channel_session",
      resourceId: id,
      requestId,
      metadata: { endereco: caixa.endereco },
    });
  }
  if (!mudouConfig) return ok(visaoPublicaDaCaixa({ ...caixa, config }, pausaFinal), { requestId });

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

  return ok(visaoPublicaDaCaixa({ ...caixa, config }, pausaFinal), { requestId });
}

export async function DELETE(
  _req: NextRequest,
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
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id)) {
    return fail("not_found", t("Caixa de e-mail não encontrada."), 404, { requestId });
  }

  let r;
  try {
    r = await removerCaixa(createAdminClient(), orgId, id);
  } catch (erro) {
    logger.error("[email.remover] remover a caixa falhou", {
      requestId,
      erro: erro instanceof Error ? erro.message.slice(0, 120) : "desconhecido",
    });
    return fail("internal_error", t("Não foi possível remover a caixa agora. Tente de novo."), 500, { requestId });
  }
  if (r.resultado === "nao_encontrada") {
    return fail("not_found", t("Caixa de e-mail não encontrada."), 404, { requestId });
  }

  void audit({
    action: "channel.email_removed",
    actorUserId: authz.user.id,
    organizationId: orgId,
    resourceType: "channel_session",
    resourceId: id,
    requestId,
    metadata: { endereco: r.endereco },
  });
  return ok({ id, removida: true }, { requestId });
}
