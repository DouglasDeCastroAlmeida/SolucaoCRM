/**
 * POST /api/v1/channels/email/testar — entra de verdade na caixa de entrada e envia um e-mail
 * de teste para a própria caixa (AC-001.3). Não grava nada: só devolve `ok` ou a causa.
 *
 * Só admin. Guarda de suporte ANTES de qualquer efeito (a rota toca a rede e o e-mail de
 * outro servidor). A senha vem no corpo, vive só nesta chamada e nunca volta.
 */
import { randomUUID } from "node:crypto";
import type { NextRequest, NextResponse } from "next/server";

import { fail, ok } from "@/lib/api/wrappers";
import { requireRole } from "@/lib/auth/require-role";
import { dadosDeConexaoSchema } from "@/lib/channels/email/caixa";
import { verificarCaixa } from "@/lib/channels/email/conexao";
import { respostaDaFalhaDeConexao, tentativasEsgotadas } from "@/lib/channels/email/rotas";
import { traduzir } from "@/lib/i18n/dicionario";
import { requireSupportWrite } from "@/lib/impersonate/support";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function POST(req: NextRequest): Promise<NextResponse> {
  const supportDenied = await requireSupportWrite();
  if (supportDenied) return supportDenied;

  const requestId = randomUUID();
  const authz = await requireRole("admin", { requestId, resource: "channels_email" });
  if (!authz.ok) return authz.response;
  const t = (texto: string) => traduzir(texto, authz.user.idioma);

  const parsed = dadosDeConexaoSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return fail("validation_failed", t("Confira os dados da caixa de e-mail."), 422, { requestId });
  }

  const barrada = await tentativasEsgotadas(authz.org.orgId, requestId, t);
  if (barrada) return barrada;

  const d = parsed.data;
  const resultado = await verificarCaixa(
    { endereco: d.endereco, usuario: d.usuario ?? d.endereco, senha: d.senha, imap: d.imap, smtp: d.smtp },
    { enviarTeste: true },
  );
  if (!resultado.ok) return respostaDaFalhaDeConexao(resultado, t, requestId);
  return ok({ ok: true, teste_enviado: resultado.testeEnviado }, { requestId });
}
