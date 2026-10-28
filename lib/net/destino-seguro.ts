/**
 * Destino seguro compartilhado: o endereco que uma ORGANIZACAO informa nunca
 * alcanca a rede interna do servidor.
 *
 * Diferente de `assertDestinoResolvidoSeguro` (que so confere o DNS e deixa o
 * `fetch` resolver de novo, com janela de rebinding), aqui o IP validado e o
 * MESMO usado na conexao: o TLS segue falando com o nome (SNI e certificado),
 * mas o socket abre para o IP fixado. Regras:
 *
 * - so `https`;
 * - qualquer IP especial (loopback, privado, link-local/metadata, CGNAT,
 *   multicast, reservado) recusa, e basta UM entre os resolvidos;
 * - redirecionamento so e seguido se o novo destino passar por tudo isto de novo.
 *
 * Reutilizavel por outros canais (ex.: e-mail): importe daqui em vez de duplicar.
 * Destino interno autorizado pela plataforma continua sendo outro mecanismo
 * (`lib/automation/destinos-internos-autorizados.ts`), nao este.
 */
import { request as httpsRequest } from "node:https";
import { lookup as dnsLookup } from "node:dns/promises";
import { isIPv4, isIPv6, type LookupFunction } from "node:net";
import { Readable } from "node:stream";

import { ipEhEspecial } from "@/lib/automation/outbound-ip";

export type MotivoDeRecusa = "http" | "ip_especial" | "dns_falhou" | "host_invalido";

export type DestinoSeguro =
  | { ok: true; ip: string; servername: string }
  | { ok: false; motivo: MotivoDeRecusa };

export interface DepsDeResolucao {
  /** Devolve todos os enderecos do nome. Default: DNS do sistema. */
  resolver?: (host: string) => Promise<string[]>;
}

/** A requisicao com o IP ja decidido, entregue ao executor de rede. */
export interface RequisicaoFixada {
  url: URL;
  ip: string;
  servername: string;
  init: RequestInit;
}

export interface DepsDeFetch extends DepsDeResolucao {
  /** Executor de rede. Default: `https.request` com lookup fixado. */
  requisitar?: (req: RequisicaoFixada) => Promise<Response>;
  /** Prazo total (conexão + corpo). Default 30 s. */
  timeoutMs?: number;
  /** Teto de bytes da resposta. Default 2 MB. */
  maxBytes?: number;
}

const TIMEOUT_PADRAO_MS = 30_000;
const MAX_BYTES_PADRAO = 2 * 1024 * 1024;

const MAX_REDIRECIONAMENTOS = 3;

async function resolverPeloSistema(host: string): Promise<string[]> {
  const r = await dnsLookup(host, { all: true });
  return r.map((e) => e.address);
}

export async function resolverDestinoSeguro(
  url: string,
  deps: DepsDeResolucao = {},
): Promise<DestinoSeguro> {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return { ok: false, motivo: "host_invalido" };
  }
  if (parsed.protocol === "http:") return { ok: false, motivo: "http" };
  if (parsed.protocol !== "https:" || parsed.hostname === "") {
    return { ok: false, motivo: "host_invalido" };
  }

  const host = parsed.hostname.replace(/^\[|\]$/g, "");
  if (isIPv4(host) || isIPv6(host)) {
    return ipEhEspecial(host)
      ? { ok: false, motivo: "ip_especial" }
      : { ok: true, ip: host, servername: host };
  }

  let enderecos: string[];
  try {
    enderecos = await (deps.resolver ?? resolverPeloSistema)(host);
  } catch {
    return { ok: false, motivo: "dns_falhou" };
  }
  const primeiro = enderecos[0];
  if (primeiro === undefined) return { ok: false, motivo: "dns_falhou" };
  if (enderecos.some((ip) => ipEhEspecial(ip))) return { ok: false, motivo: "ip_especial" };
  return { ok: true, ip: primeiro, servername: host };
}

/** `lookup` para o socket: ignora o nome e devolve sempre o IP validado. */
export function lookupFixado(ip: string): LookupFunction {
  const familia = isIPv6(ip) ? 6 : 4;
  return (_host, opcoes, callback) => {
    if (opcoes.all) callback(null, [{ address: ip, family: familia }]);
    else callback(null, ip, familia);
  };
}

function corpoDe(init: RequestInit): Buffer | undefined {
  const b = init.body;
  if (b === undefined || b === null) return undefined;
  if (typeof b === "string") return Buffer.from(b);
  if (b instanceof Uint8Array) return Buffer.from(b);
  throw new Error("unsafe_url:body_nao_suportado");
}

function requisitarPorHttps(req: RequisicaoFixada): Promise<Response> {
  return new Promise((resolve, reject) => {
    const cabecalhos: Record<string, string> = {};
    new Headers(req.init.headers).forEach((v, k) => {
      cabecalhos[k] = v;
    });
    const corpo = corpoDe(req.init);
    if (corpo) cabecalhos["content-length"] = String(corpo.length);

    const r = httpsRequest(
      {
        protocol: "https:",
        hostname: req.url.hostname.replace(/^\[|\]$/g, ""),
        port: req.url.port || 443,
        path: `${req.url.pathname}${req.url.search}`,
        method: req.init.method ?? "GET",
        headers: cabecalhos,
        servername: req.servername,
        lookup: lookupFixado(req.ip),
        signal: req.init.signal ?? undefined,
      },
      (res) => {
        const h = new Headers();
        for (const [k, v] of Object.entries(res.headers)) {
          if (Array.isArray(v)) v.forEach((x) => h.append(k, x));
          else if (v !== undefined) h.set(k, v);
        }
        const status = res.statusCode ?? 502;
        const semCorpo = status === 204 || status === 304 || (status >= 300 && status < 400);
        // Corpo descartado precisa ser drenado, senão o socket fica preso.
        if (semCorpo) res.resume();
        resolve(
          new Response(semCorpo ? null : (Readable.toWeb(res) as ReadableStream<Uint8Array>), {
            status,
            headers: h,
          }),
        );
      },
    );
    r.on("error", reject);
    if (corpo) r.write(corpo);
    r.end();
  });
}

const CABECALHOS_DE_CREDENCIAL = ["authorization", "cookie", "proxy-authorization"];

/** Host e Content-Length são do executor: o chamador não os controla. */
function semCabecalhosDoExecutor(init: RequestInit): RequestInit {
  const h = new Headers(init.headers);
  h.delete("host");
  h.delete("content-length");
  return { ...init, headers: h };
}

/** Lê o corpo até `maxBytes`; acima disso cancela e rejeita. */
export async function lerCorpoComTeto(res: Response, maxBytes: number): Promise<string> {
  const declarado = Number(res.headers.get("content-length"));
  if (Number.isFinite(declarado) && declarado > maxBytes) {
    await res.body?.cancel().catch(() => undefined);
    throw new Error("unsafe_url:response_too_large");
  }
  if (!res.body) return "";
  const leitor = res.body.getReader();
  const pedacos: Uint8Array[] = [];
  let total = 0;
  for (;;) {
    const { done, value } = await leitor.read();
    if (done) break;
    total += value.length;
    if (total > maxBytes) {
      await leitor.cancel().catch(() => undefined);
      throw new Error("unsafe_url:response_too_large");
    }
    pedacos.push(value);
  }
  return Buffer.concat(pedacos).toString("utf8");
}

/** Embrulha o corpo: destrói o stream acima do teto e avisa ao terminar. */
function limitarCorpo(res: Response, maxBytes: number, aoTerminar: () => void): Response {
  const declarado = Number(res.headers.get("content-length"));
  if (Number.isFinite(declarado) && declarado > maxBytes) {
    void res.body?.cancel().catch(() => undefined);
    aoTerminar();
    throw new Error("unsafe_url:response_too_large");
  }
  if (!res.body) {
    aoTerminar();
    return res;
  }
  const leitor = res.body.getReader();
  let total = 0;
  const corpo = new ReadableStream<Uint8Array>({
    async pull(c) {
      try {
        const { done, value } = await leitor.read();
        if (done) {
          aoTerminar();
          c.close();
          return;
        }
        total += value.length;
        if (total > maxBytes) {
          await leitor.cancel().catch(() => undefined);
          aoTerminar();
          c.error(new Error("unsafe_url:response_too_large"));
          return;
        }
        c.enqueue(value);
      } catch (e) {
        aoTerminar();
        c.error(e);
      }
    },
    cancel(motivo) {
      aoTerminar();
      return leitor.cancel(motivo);
    },
  });
  return new Response(corpo, { status: res.status, statusText: res.statusText, headers: res.headers });
}

/**
 * `fetch` que valida o destino e conecta no IP validado. Redirecionamento so e
 * seguido (ate 3 vezes) quando o novo destino tambem passa por validacao;
 * senao lanca `unsafe_url:redirect_not_followed`. Ao mudar de origem, as
 * credenciais (Authorization, Cookie) saem; 301/302/303 viram GET sem corpo.
 *
 * Limites: prazo total (padrao 30 s) e teto de bytes da resposta (padrao 2 MB).
 *
 * Sem fallback: so o PRIMEIRO IP aprovado e tentado. Se ele falhar, a chamada
 * falha, em vez de tentar outro endereco do mesmo nome.
 */
export async function fetchComIpFixado(
  url: string,
  init: RequestInit = {},
  deps: DepsDeFetch = {},
): Promise<Response> {
  const requisitar = deps.requisitar ?? requisitarPorHttps;
  const maxBytes = deps.maxBytes ?? MAX_BYTES_PADRAO;
  const ctrl = new AbortController();
  if (init.signal) {
    if (init.signal.aborted) ctrl.abort();
    else init.signal.addEventListener("abort", () => ctrl.abort(), { once: true });
  }
  let temporizador: ReturnType<typeof setTimeout> | undefined;
  const limpar = () => clearTimeout(temporizador);
  const estouro = new Promise<never>((_, rejeita) => {
    temporizador = setTimeout(() => {
      ctrl.abort();
      rejeita(new Error("unsafe_url:timeout"));
    }, deps.timeoutMs ?? TIMEOUT_PADRAO_MS);
  });
  estouro.catch(() => undefined);

  try {
    let atual = url;
    let proximo: RequestInit = { ...semCabecalhosDoExecutor(init), signal: ctrl.signal };
    for (let salto = 0; salto <= MAX_REDIRECIONAMENTOS; salto++) {
      const destino = await Promise.race([resolverDestinoSeguro(atual, deps), estouro]);
      if (!destino.ok) {
        throw new Error(salto === 0 ? `unsafe_url:${destino.motivo}` : "unsafe_url:redirect_not_followed");
      }
      const res = await Promise.race([
        requisitar({ url: new URL(atual), ip: destino.ip, servername: destino.servername, init: proximo }),
        estouro,
      ]);
      const ehRedirect = res.status >= 300 && res.status < 400;
      const local = res.headers.get("location");
      // Quem pede `redirect: "manual"` decide sozinho o que fazer com o 3xx.
      if (!ehRedirect || init.redirect === "manual" || !local) {
        return limitarCorpo(res, maxBytes, limpar);
      }
      await res.body?.cancel().catch(() => undefined);
      const anterior = new URL(atual);
      atual = new URL(local, atual).href;
      const h = new Headers(proximo.headers);
      if (new URL(atual).origin !== anterior.origin) {
        for (const c of CABECALHOS_DE_CREDENCIAL) h.delete(c);
      }
      proximo = { ...proximo, headers: h };
      if ([301, 302, 303].includes(res.status)) {
        h.delete("content-type");
        const { body: _corpo, ...resto } = proximo;
        void _corpo;
        proximo = { ...resto, method: "GET", headers: h };
      }
    }
    throw new Error("unsafe_url:redirect_not_followed");
  } catch (e) {
    limpar();
    throw e;
  }
}
