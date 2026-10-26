/**
 * POST /api/hooks/auth/send-email — o gancho "Send Email" do GoTrue (REQ-006).
 *
 * Quem chama é o GoTrue, assinado (Standard Webhooks). Sem sessão: o caminho
 * está em `lib/auth/public-paths.ts` ("o proxy não decide"), e a autenticação é
 * a assinatura HMAC, verificada antes de qualquer outra coisa. `AUTH_HOOK_SECRET`
 * vazio = gancho desligado: toda chamada é 401 e o GoTrue segue com o SMTP dele.
 *
 * Rate limit: não se aplica — só quem tem o segredo passa da assinatura, e o
 * volume é o dos e-mails de acesso, já limitado por `authRateLimited` nas
 * actions que os pedem. O corpo é limitado a 64 KB.
 */
import { NextResponse, type NextRequest } from "next/server";

import { audit } from "@/lib/audit";
import { lerCorpoLimitado } from "@/lib/auth/gancho-de-email/corpo-limitado";
import { processarGanchoDeEmail } from "@/lib/auth/gancho-de-email/processar";
import { repositorioDoGancho } from "@/lib/auth/gancho-de-email/repositorio";
import { marcaDeSaidaDaMarca } from "@/lib/email/acesso-da-marca";
import { sendEmail } from "@/lib/email/roteador";
import { env } from "@/lib/env";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const LIMITE_DO_CORPO = 64 * 1024;

function reportar(erro: Error, contexto: Record<string, unknown>): void {
  void import("@sentry/nextjs")
    .then((Sentry) => Sentry.captureException(erro, { level: "error", tags: { subsystem: "auth_email_hook" }, extra: contexto }))
    .catch(() => undefined);
}

export async function POST(request: NextRequest): Promise<NextResponse> {
  const declarado = Number(request.headers.get("content-length") ?? "0");
  if (declarado > LIMITE_DO_CORPO) return NextResponse.json({ error: { code: "payload_too_large" } }, { status: 413 });
  // Sem content-length (ou com um que mente) o stream é contado byte a byte.
  const corpo = await lerCorpoLimitado(request.body, LIMITE_DO_CORPO);
  if (corpo === null) return NextResponse.json({ error: { code: "payload_too_large" } }, { status: 413 });

  const resposta = await processarGanchoDeEmail(
    {
      corpo,
      id: request.headers.get("webhook-id") ?? "",
      timestamp: request.headers.get("webhook-timestamp") ?? "",
      assinatura: request.headers.get("webhook-signature") ?? "",
    },
    {
      segredo: env.AUTH_HOOK_SECRET,
      agoraMs: () => Date.now(),
      appUrl: env.NEXT_PUBLIC_APP_URL,
      repo: repositorioDoGancho,
      marcaDeSaida: marcaDeSaidaDaMarca,
      enviar: sendEmail,
      reportar,
      auditar: (entrada) => audit({ ...entrada, requestId: request.headers.get("x-request-id") }),
    },
  );
  return NextResponse.json(resposta.corpo, { status: resposta.status });
}
