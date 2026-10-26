/**
 * GET /api/internal/tls-ask?domain=<host>&token=<TLS_ASK_TOKEN> — o `ask` do Caddy.
 *
 * O Caddy não envia cabeçalhos no `ask`, então o token vai na URL; é aceitável
 * porque o caminho nunca é público (o Caddy responde 404 a /api/internal/* por
 * fora) e o tráfego é interno (ADR-004). Sem sessão: `lib/auth/public-paths.ts`
 * ("o proxy não decide"); a autenticação é o token, em tempo constante.
 * Não muta dados do produto, portanto não audita.
 */
import { resolve4 } from "node:dns/promises";

import { NextResponse, type NextRequest } from "next/server";

import { buscarMarcaDoHost } from "@/lib/brands/repositorio";
import { criarDecisorTlsAsk } from "@/lib/brands/tls-ask";
import { env } from "@/lib/env";
import { logger } from "@/lib/logger";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const LIMITE_POR_HORA = 10;
const PRAZO_DNS_MS = 2000;
const TTL_DNS_MS = 60_000;
const TETO_CACHE_DNS = 200;

const cacheDns = new Map<string, { ate: number; ips: string[] }>();

async function resolverComPrazo(host: string): Promise<string[]> {
  const hit = cacheDns.get(host);
  if (hit && hit.ate > Date.now()) return hit.ips;
  const ips = await Promise.race([
    resolve4(host),
    new Promise<string[]>((_, rej) => setTimeout(() => rej(new Error("dns_timeout")), PRAZO_DNS_MS)),
  ]);
  if (cacheDns.size >= TETO_CACHE_DNS) cacheDns.delete(cacheDns.keys().next().value as string);
  cacheDns.set(host, { ate: Date.now() + TTL_DNS_MS, ips });
  return ips;
}

function alertar(motivo: string, contexto: Record<string, unknown>): void {
  logger.warn("tls-ask recusado", { motivo, ...contexto });
  void import("@sentry/nextjs")
    .then((S) => S.captureMessage(`[tls-ask] ${motivo}`, { level: "warning", tags: { subsystem: "tls_ask" }, extra: contexto }))
    .catch(() => undefined);
}

let decisor: ReturnType<typeof criarDecisorTlsAsk> | null = null;
function obterDecisor() {
  decisor ??= criarDecisorTlsAsk({
    tokenEsperado: env.TLS_ASK_TOKEN,
    ipDaVps: env.VPS_PUBLIC_IP,
    limitePorHora: LIMITE_POR_HORA,
    agora: () => Date.now(),
    buscarMarca: buscarMarcaDoHost,
    resolverIpv4: resolverComPrazo,
    alertar,
  });
  return decisor;
}

export async function GET(request: NextRequest): Promise<NextResponse> {
  const q = new URL(request.url).searchParams;
  try {
    const d = await obterDecisor()({
      domain: q.get("domain"),
      token: q.get("token"),
      xff: request.headers.get("x-forwarded-for"),
    });
    return new NextResponse(null, { status: d.status });
  } catch {
    // Erro de banco: nunca aprova.
    return new NextResponse(null, { status: 503 });
  }
}
