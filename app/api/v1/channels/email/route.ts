/**
 * GET  /api/v1/channels/email — as caixas de e-mail conectadas da organização.
 * POST /api/v1/channels/email — conecta uma caixa (AC-001.5).
 *
 * Só admin; guarda de suporte antes do efeito; Zod no corpo; auditoria da conexão.
 *
 * ─── Conectar não confia no "Testar" da tela ─────────────────────────────────
 * O servidor entra na caixa DE NOVO (sem mandar outro e-mail de teste) antes de gravar:
 * a tela pode ter sido adulterada, e gravar caixa que não abre é o dono descobrindo pela
 * ausência de e-mails. Aproveita a entrada para posicionar o cursor no fim da caixa: nada
 * do passado é importado, só o que chegar depois.
 *
 * ─── A senha ──────────────────────────────────────────────────────────────────
 * Cifrada em `email_credenciais`; aqui só passam os 4 últimos caracteres. Sem a chave de
 * cifra a conexão é recusada: a alternativa seria guardar em claro.
 */
import { randomBytes, randomUUID } from "node:crypto";
import type { NextRequest, NextResponse } from "next/server";

import { fail, ok } from "@/lib/api/wrappers";
import { audit } from "@/lib/audit";
import { requireRole } from "@/lib/auth/require-role";
import {
  acharCaixaPorEndereco,
  conectarSchema,
  descartarCaixa,
  INTERVALO_PADRAO_SEGUNDOS,
  iniciarCursor,
  listarCaixas,
  salvarCaixa,
  TETO_DIARIO_PADRAO,
  visaoPublicaDaCaixa,
  type ConfigDaCaixaGuardada,
} from "@/lib/channels/email/caixa";
import { verificarCaixa } from "@/lib/channels/email/conexao";
import { respostaDaFalhaDeConexao, semSegredo, tentativasEsgotadas } from "@/lib/channels/email/rotas";
import { gravarSenhaDaCaixa, ultimosQuatro } from "@/lib/channels/email/segredo";
import { traduzirLimiteDoPlano } from "@/lib/cobranca/limites";
import { traduzir } from "@/lib/i18n/dicionario";
import { requireSupportWrite } from "@/lib/impersonate/support";
import { logger } from "@/lib/logger";
import { createAdminClient } from "@/lib/supabase/admin";
import { encryptWebhookSecret } from "@/lib/webhooks/secrets";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const CAIXA_DUPLICADA = /duplicate key|23505|email_address_ativo_unique/i;

export async function GET(_req: NextRequest): Promise<NextResponse> {
  const requestId = randomUUID();
  const authz = await requireRole("admin", { requestId, resource: "channels_email" });
  if (!authz.ok) return authz.response;

  const caixas = await listarCaixas(createAdminClient(), authz.org.orgId);
  return ok({ caixas: caixas.map(visaoPublicaDaCaixa) }, { requestId });
}

export async function POST(req: NextRequest): Promise<NextResponse> {
  const supportDenied = await requireSupportWrite();
  if (supportDenied) return supportDenied;

  const requestId = randomUUID();
  const authz = await requireRole("admin", { requestId, resource: "channels_email" });
  if (!authz.ok) return authz.response;
  const t = (texto: string) => traduzir(texto, authz.user.idioma);
  const orgId = authz.org.orgId;

  const parsed = conectarSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return fail("validation_failed", t("Confira os dados da caixa de e-mail."), 422, { requestId });
  }
  const d = parsed.data;
  const usuario = d.usuario ?? d.endereco;

  const barrada = await tentativasEsgotadas(orgId, requestId, t);
  if (barrada) return barrada;

  const admin = createAdminClient();
  const existente = await acharCaixaPorEndereco(admin, orgId, d.endereco);
  if (existente && !existente.archivedAt) {
    return fail("state_conflict", t("Essa caixa de e-mail já está conectada."), 409, { requestId });
  }

  const verificacao = await verificarCaixa(
    { endereco: d.endereco, usuario, senha: d.senha, imap: d.imap, smtp: d.smtp },
    { enviarTeste: false },
  );
  if (!verificacao.ok) return respostaDaFalhaDeConexao(verificacao, t, requestId);

  const config: ConfigDaCaixaGuardada = {
    usuario,
    imap: d.imap,
    smtp: d.smtp,
    senha_ultimos4: ultimosQuatro(d.senha),
    assinatura: d.assinatura ?? null,
    teto_diario: d.teto_diario ?? TETO_DIARIO_PADRAO,
    intervalo_segundos: d.intervalo_segundos ?? INTERVALO_PADRAO_SEGUNDOS,
  };

  // `webhook_secret_encrypted` é NOT NULL e a caixa não tem webhook: um valor aleatório sem uso.
  const semUsoCifrado = await encryptWebhookSecret(admin, randomBytes(32).toString("hex"));
  if (!semUsoCifrado) {
    return fail("invalid_request", t("cifra indisponível nesta instalação — a chave não foi gravada"), 422, {
      requestId,
    });
  }

  const { error, channelSessionId } = await salvarCaixa(admin, {
    organizationId: orgId,
    existente,
    endereco: d.endereco,
    config,
    segredoSemUsoCifrado: semUsoCifrado,
    userId: authz.user.id,
    requestId,
  });
  if (error || !channelSessionId) {
    const mensagem = semSegredo(error ?? "sem id", d.senha);
    const limite = traduzirLimiteDoPlano(mensagem, authz.user.idioma);
    if (limite) return fail(limite.code, limite.message, 409, { requestId, details: limite.details });
    if (CAIXA_DUPLICADA.test(mensagem)) {
      return fail("state_conflict", t("Essa caixa de e-mail já está conectada."), 409, { requestId });
    }
    logger.error("[email.conectar] gravar a caixa falhou", { requestId, erro: mensagem });
    return fail("internal_error", t("Não foi possível salvar a caixa agora. Tente de novo."), 500, { requestId });
  }

  // Caixa sem senha ou sem cursor não serve: só desfaz o que NASCEU agora (nunca uma arquivada).
  const desfazer = async () => {
    if (!existente) await descartarCaixa(admin, orgId, channelSessionId);
  };

  const senha = await gravarSenhaDaCaixa(admin, { organizationId: orgId, channelSessionId, senha: d.senha });
  if (!senha.ok) {
    await desfazer();
    if (senha.motivo === "cifra_indisponivel") {
      return fail("invalid_request", t("cifra indisponível nesta instalação — a chave não foi gravada"), 422, {
        requestId,
      });
    }
    return fail("internal_error", t("Não foi possível salvar a caixa agora. Tente de novo."), 500, { requestId });
  }

  const cursor = await iniciarCursor(admin, {
    organizationId: orgId,
    channelSessionId,
    uidValidity: verificacao.uidValidity,
    ultimoUid: Math.max(0, verificacao.uidNext - 1),
  });
  if (cursor.error) {
    await desfazer();
    logger.error("[email.conectar] posicionar o cursor falhou", { requestId, erro: semSegredo(cursor.error, d.senha) });
    return fail("internal_error", t("Não foi possível salvar a caixa agora. Tente de novo."), 500, { requestId });
  }

  void audit({
    action: "channel.email_connected",
    actorUserId: authz.user.id,
    organizationId: orgId,
    resourceType: "channel_session",
    resourceId: channelSessionId,
    requestId,
    metadata: {
      endereco: d.endereco,
      servidor_leitura: d.imap.host,
      servidor_envio: d.smtp.host,
      reconectada: Boolean(existente),
    },
  });

  return ok(
    visaoPublicaDaCaixa({ id: channelSessionId, endereco: d.endereco, status: "WORKING", archivedAt: null, config }),
    { requestId, status: 201 },
  );
}
