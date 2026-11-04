/**
 * email-rodada — a leitura das caixas de e-mail conectadas (mudança 005, ADR-001).
 *
 * Roda a cada minuto (scheduler). Uma rodada: rodízio entre as caixas (a lida há mais tempo
 * primeiro), prazo de 45 s, trava por caixa, lê só o que passou do último UID. A regra toda
 * mora em `lib/channels/email/rodada.ts`; esta rota é o relógio, a guarda e a trilha.
 *
 * - `EMAIL_CANAL=desligado`: responde 200 sem abrir conexão nenhuma (AC-008.3).
 * - Auditoria: UMA linha por organização que teve efeito (leu, ignorou, enviou da fila ou pausou uma caixa).
 *   Rodada vazia, a de 1 minuto numa instalação sem caixa, NÃO audita (doutrina de cron).
 * - Nenhum conteúdo de e-mail em log nem na auditoria: só contagens.
 *
 * Auth: Bearer INTERNAL_CRON_SECRET|INTERNAL_SECRET (fail-closed), como os demais crons.
 */
import { randomUUID } from "node:crypto";
import type { NextRequest } from "next/server";

import { fail, ok } from "@/lib/api/wrappers";
import { audit } from "@/lib/audit";
import { autorizaCron } from "@/lib/auth/cron-auth";
import { rodarRodada, type ResumoDaCaixa } from "@/lib/channels/email/rodada";
import { logger } from "@/lib/logger";
import { createAdminClient } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

async function handle(req: NextRequest): Promise<Response> {
  const requestId = randomUUID();
  if (!autorizaCron(req)) {
    return fail("forbidden", "Cron secret missing or invalid.", 403, { requestId });
  }

  let resultado: Awaited<ReturnType<typeof rodarRodada>>;
  try {
    resultado = await rodarRodada(createAdminClient());
  } catch (err) {
    logger.error("[email-rodada] rodada falhou", {
      requestId,
      erro: err instanceof Error ? err.message.slice(0, 200) : "desconhecido",
    });
    return fail("internal_error", "Failed to read mailboxes.", 500, { requestId });
  }

  const porOrganizacao = new Map<string, ResumoDaCaixa[]>();
  for (const c of resultado.caixas) {
    if (c.lidas > 0 || c.enviadas > 0 || c.falhasDeEnvio > 0 || c.desfecho === "senha_recusada") {
      porOrganizacao.set(c.organizationId, [...(porOrganizacao.get(c.organizationId) ?? []), c]);
    }
  }
  if (porOrganizacao.size > 0) for (const [organizationId, caixas] of porOrganizacao) {
    void audit({
      action: "channel.email_round_run",
      organizationId,
      bypassedRls: true,
      resourceType: "channel_session",
      requestId,
      metadata: {
        caixas: caixas.length,
        lidas: caixas.reduce((n, c) => n + c.lidas, 0),
        ingeridas: caixas.reduce((n, c) => n + c.ingeridas, 0),
        ignoradas: caixas.reduce((n, c) => n + c.ignoradas, 0),
        puladas: caixas.reduce((n, c) => n + c.puladas, 0),
        enviadas: caixas.reduce((n, c) => n + c.enviadas, 0),
        falhas_de_envio: caixas.reduce((n, c) => n + c.falhasDeEnvio, 0),
        senha_recusada: caixas.filter((c) => c.desfecho === "senha_recusada").length,
      },
    });
  }

  return ok(
    {
      desligado: resultado.desligado,
      caixas: resultado.caixas.length,
      lidas: resultado.caixas.reduce((n, c) => n + c.lidas, 0),
      ingeridas: resultado.caixas.reduce((n, c) => n + c.ingeridas, 0),
      ignoradas: resultado.caixas.reduce((n, c) => n + c.ignoradas, 0),
      enviadas: resultado.caixas.reduce((n, c) => n + c.enviadas, 0),
    },
    { requestId },
  );
}

export const GET = handle;
export const POST = handle;
