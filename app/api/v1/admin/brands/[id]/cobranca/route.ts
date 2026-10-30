/**
 * GET   /api/v1/admin/brands/{id}/cobranca — a chave da cobrança da marca e o
 *                                            que falta para poder ligá-la.
 * PATCH /api/v1/admin/brands/{id}/cobranca — liga ou desliga a chave (mudança 003).
 *
 * Ligar exige plano cobrável com preço, plano do cadastro e provedor com chave
 * (AC-001.3); recusa 422 dizendo o que falta. Desligar nunca confere nada e
 * nunca toca em assinatura (AC-001.4). Cada mudança real vira uma entrada
 * `brand.cobranca_changed` (AC-001.5). A marca vem do path, nunca do corpo.
 */
import { randomUUID } from "node:crypto";
import { type NextRequest } from "next/server";

import { audit } from "@/lib/audit";
import { fail, ok } from "@/lib/api/wrappers";
import {
  falhaDaEscritaDePlatformAdmin,
  requirePlatformAdmin,
  requirePlatformAdminEscrita,
  type PlatformAdminContext,
} from "@/lib/auth/requirePlatformAdmin";
import { definirCobranca, MENSAGEM_DA_FALTA, situacaoDaCobranca } from "@/lib/brands/cobranca-repo";
import { lerCorpo, respostaDeErro } from "@/lib/brands/rota";
import { LigarCobrancaSchema, UuidSchema } from "@/lib/brands/schemas";
import { requireSupportWrite } from "@/lib/impersonate/support";

type Ctx = { params: Promise<{ id: string }> };

export async function GET(_req: NextRequest, { params }: Ctx) {
  const requestId = randomUUID();
  try {
    await requirePlatformAdmin();
  } catch {
    return fail("forbidden", "Platform admin required", 403, { requestId });
  }
  const { id } = await params;
  if (!UuidSchema.safeParse(id).success) {
    return fail("validation_failed", "Marca inválida.", 400, { requestId });
  }
  try {
    return ok(await situacaoDaCobranca(id), { requestId });
  } catch (err) {
    return respostaDeErro(err, requestId);
  }
}

export async function PATCH(req: NextRequest, { params }: Ctx) {
  const supportDenied = await requireSupportWrite();
  if (supportDenied) return supportDenied;

  const requestId = randomUUID();
  let ctx: PlatformAdminContext;
  try {
    ctx = await requirePlatformAdminEscrita();
  } catch (err) {
    return falhaDaEscritaDePlatformAdmin(err, requestId);
  }

  const { id } = await params;
  if (!UuidSchema.safeParse(id).success) {
    return fail("validation_failed", "Marca inválida.", 400, { requestId });
  }
  const corpo = await lerCorpo(req, LigarCobrancaSchema, requestId);
  if (!corpo.ok) return corpo.res;
  const ligar = corpo.data.cobranca_ligada;

  try {
    if (ligar) {
      const { faltam } = await situacaoDaCobranca(id);
      if (faltam.length > 0) {
        const semPlano = faltam.some((f) => f === "plano" || f === "plano_padrao");
        const mensagem = `Ainda não dá para ligar a cobrança desta marca: ${faltam
          .map((f) => MENSAGEM_DA_FALTA[f].replace(/\.$/, "").replace(/^./, (c) => c.toLowerCase()))
          .join("; ")}.`;
        return fail(semPlano ? "cobranca_marca_sem_plano" : "cobranca_provedor_indisponivel", mensagem, 422, {
          requestId,
          details: { faltam },
        });
      }
    }

    const { anterior } = await definirCobranca(id, ligar);
    if (anterior !== ligar) {
      void audit({
        action: "brand.cobranca_changed",
        actorUserId: ctx.user.id,
        actingAsPlatformAdmin: true,
        bypassedRls: true,
        resourceType: "brand",
        resourceId: id,
        requestId,
        metadata: { brand_id: id, de: anterior, para: ligar },
      });
    }
    return ok({ cobranca_ligada: ligar, faltam: [] }, { requestId });
  } catch (err) {
    return respostaDeErro(err, requestId);
  }
}
