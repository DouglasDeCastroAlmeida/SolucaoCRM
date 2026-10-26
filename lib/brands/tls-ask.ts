/**
 * Decisão da pergunta `ask` do Caddy (HTTPS sob demanda, REQ-007).
 *
 * Pura e com dependências injetadas: a rota (`app/api/internal/tls-ask`) monta
 * as reais. Só diz "sim" (200) quando TUDO bate: token certo, pedido direto da
 * rede do Caddy (sem `x-forwarded-for`), domínio ativo de marca ativa, DNS
 * apontando para a VPS e emissões distintas na última hora abaixo do limite.
 */
import { createHash, timingSafeEqual } from "node:crypto";

import type { MarcaDoDominio } from "./repositorio";

export type PedidoTlsAsk = { domain: string | null; token: string | null; xff: string | null };
export type DecisaoTlsAsk = { status: 200 | 400 | 403 | 404 | 429; motivo: string };

export type DepsTlsAsk = {
  tokenEsperado: string;
  ipDaVps: string;
  limitePorHora: number;
  agora: () => number;
  buscarMarca: (host: string) => Promise<MarcaDoDominio>;
  resolverIpv4: (host: string) => Promise<string[]>;
  alertar: (motivo: string, contexto: Record<string, unknown>) => void;
};

const HORA_MS = 60 * 60 * 1000;
const HOST_VALIDO = /^(?=.{1,253}$)([a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}$/;

function tokenConfere(recebido: string | null, esperado: string): boolean {
  if (!esperado || !recebido) return false;
  const a = createHash("sha256").update(recebido).digest();
  const b = createHash("sha256").update(esperado).digest();
  return timingSafeEqual(a, b);
}

export function criarDecisorTlsAsk(deps: DepsTlsAsk): (p: PedidoTlsAsk) => Promise<DecisaoTlsAsk> {
  // host -> instante da última aprovação nova; só aprovações distintas gastam o limite.
  const emissoes = new Map<string, number>();

  return async (p) => {
    if (!tokenConfere(p.token, deps.tokenEsperado)) return { status: 403, motivo: "token" };
    if (p.xff) return { status: 403, motivo: "veio_por_fora" };

    const host = (p.domain ?? "").trim().toLowerCase();
    if (!HOST_VALIDO.test(host)) return { status: 400, motivo: "dominio_invalido" };

    const { domainKind } = await deps.buscarMarca(host);
    if (domainKind === "padrao") return { status: 404, motivo: "dominio_desconhecido_ou_inativo" };

    if (!deps.ipDaVps) return { status: 403, motivo: "vps_ip_ausente" };
    let ips: string[] = [];
    try {
      ips = await deps.resolverIpv4(host);
    } catch {
      ips = [];
    }
    if (!ips.includes(deps.ipDaVps)) return { status: 403, motivo: "dns_fora_da_vps" };

    const agora = deps.agora();
    for (const [h, t] of emissoes) if (agora - t >= HORA_MS) emissoes.delete(h);
    if (!emissoes.has(host) && emissoes.size >= deps.limitePorHora) {
      deps.alertar("limite_por_hora", { domain: host, limite: deps.limitePorHora });
      return { status: 429, motivo: "limite_por_hora" };
    }
    if (!emissoes.has(host)) emissoes.set(host, agora);
    return { status: 200, motivo: "ok" };
  };
}
