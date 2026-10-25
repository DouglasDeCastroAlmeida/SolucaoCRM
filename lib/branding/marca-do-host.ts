/**
 * host → marca. Roda no servidor Node (nunca no Edge) e NUNCA lança.
 *
 * Qualquer falha (banco fora, banco lento, cache corrompido) devolve a última
 * marca conhecida do host, ou a padrão, e registra o motivo por `avisar`. Um
 * throw aqui seria 500 em toda tela, login incluído (ver `resolve.ts`).
 *
 * Cache em memória por host, 60 s, invalidado pelo CRUD do painel. O cache mora
 * em `globalThis` pelo mesmo motivo do memo de `instalacao.ts`: a rota que grava
 * e a tela que renderiza são duas instâncias do módulo no mesmo processo.
 */
import { buscarMarcaDoHost } from "@/lib/brands/repositorio";
import {
  MARCA_PADRAO_EMBUTIDA,
  MarcaSchema,
  type Brand,
  type TipoDeDominio,
} from "@/lib/brands/tipos";
import { env } from "@/lib/env";
import { logger } from "@/lib/logger";

import { normalizarHost } from "./host";

export type ResultadoDaMarca = {
  readonly brand: Brand;
  readonly domainKind: TipoDeDominio;
};

export type Entrada = {
  readonly valor: ResultadoDaMarca;
  readonly expiraEm: number;
};

export const TTL_DA_MARCA_MS = 60_000;
/** Depois de uma falha, não martela o banco: serve a degradação por pouco tempo. */
export const TTL_DA_FALHA_MS = 5_000;
export const LIMITE_DO_CACHE = 500;
export const TIMEOUT_DA_CONSULTA_MS = 1_500;

const PADRAO_EMBUTIDO: ResultadoDaMarca = {
  brand: MARCA_PADRAO_EMBUTIDA,
  domainKind: "padrao",
};

/** `off` (qualquer caixa) desliga; ausente ou qualquer outro valor = ligado. */
export function marcasPorDominioLigado(valor: string | null | undefined): boolean {
  return (valor ?? "").trim().toLowerCase() !== "off";
}

type Dependencias = {
  buscar: (host: string) => Promise<ResultadoDaMarca>;
  ligado: () => boolean;
  agora?: () => number;
  ttlMs?: number;
  timeoutMs?: number;
  avisar?: (mensagem: string, contexto: Record<string, unknown>) => void;
  cache?: Map<string, Entrada>;
};

class ConsultaLenta extends Error {}

function entradaValida(e: unknown): e is Entrada {
  if (typeof e !== "object" || e === null) return false;
  const { valor, expiraEm } = e as { valor?: unknown; expiraEm?: unknown };
  if (typeof expiraEm !== "number" || typeof valor !== "object" || valor === null) return false;
  const { brand, domainKind } = valor as { brand?: unknown; domainKind?: unknown };
  return (
    (domainKind === "padrao" || domainKind === "subdominio" || domainKind === "proprio") &&
    MarcaSchema.safeParse(brand).success
  );
}

export function criarMarcaDoHost(deps: Dependencias) {
  const agora = deps.agora ?? Date.now;
  const ttl = deps.ttlMs ?? TTL_DA_MARCA_MS;
  const timeoutMs = deps.timeoutMs ?? TIMEOUT_DA_CONSULTA_MS;
  const avisar = deps.avisar ?? ((m, c) => logger.warn(m, c));
  const cache = deps.cache ?? new Map<string, Entrada>();

  // O host vem do cabeçalho, que o cliente controla: sem teto, quem varia o host enche o
  // processo. Ao passar do limite sai a entrada mais antiga (o Map preserva a ordem de inserção).
  function guardar(host: string, entrada: Entrada): void {
    cache.delete(host);
    while (cache.size >= LIMITE_DO_CACHE) {
      const maisAntigo = cache.keys().next();
      if (maisAntigo.done) break;
      cache.delete(maisAntigo.value);
    }
    cache.set(host, entrada);
  }

  function consultaComPrazo(host: string): Promise<ResultadoDaMarca> {
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(new ConsultaLenta("estourou o prazo")), timeoutMs);
      deps.buscar(host).then(
        (v) => {
          clearTimeout(timer);
          resolve(v);
        },
        (e) => {
          clearTimeout(timer);
          reject(e);
        },
      );
    });
  }

  async function marcaDoHost(hostBruto: string | null | undefined): Promise<ResultadoDaMarca> {
    try {
      if (!deps.ligado()) return PADRAO_EMBUTIDO;
      const host = normalizarHost(hostBruto);
      if (host === "") return PADRAO_EMBUTIDO;

      let anterior: Entrada | undefined;
      const guardada: unknown = cache.get(host);
      if (guardada !== undefined) {
        if (entradaValida(guardada)) {
          if (guardada.expiraEm > agora()) return guardada.valor;
          anterior = guardada;
        } else {
          cache.delete(host);
          avisar("marca por host: cache corrompido, descartado", { motivo: "cache_corrompido" });
        }
      }

      try {
        const valor = await consultaComPrazo(host);
        guardar(host, { valor, expiraEm: agora() + ttl });
        return valor;
      } catch (erro) {
        const motivo = erro instanceof ConsultaLenta ? "consulta_lenta" : "consulta_falhou";
        avisar("marca por host: degradou para a última marca conhecida ou a padrão", {
          motivo,
          servida: anterior ? "ultima_conhecida" : "padrao",
          detalhe: erro instanceof Error ? erro.message : String(erro),
        });
        const valor = anterior?.valor ?? PADRAO_EMBUTIDO;
        guardar(host, { valor, expiraEm: agora() + TTL_DA_FALHA_MS });
        return valor;
      }
    } catch (erro) {
      avisar("marca por host: falha inesperada, vale a padrão", {
        motivo: "falha_inesperada",
        detalhe: erro instanceof Error ? erro.message : String(erro),
      });
      return PADRAO_EMBUTIDO;
    }
  }

  function invalidar(host?: string): void {
    try {
      if (host === undefined) cache.clear();
      else cache.delete(normalizarHost(host));
    } catch {
      // Cache inalcançável: a próxima leitura já trata como corrompido.
    }
  }

  return { marcaDoHost, invalidar };
}

declare global {
  var __cacheDeMarcaPorHost: Map<string, Entrada> | undefined;
}

function cacheDoProcesso(): Map<string, Entrada> {
  globalThis.__cacheDeMarcaPorHost ??= new Map();
  return globalThis.__cacheDeMarcaPorHost;
}

const padrao = criarMarcaDoHost({
  buscar: buscarMarcaDoHost,
  ligado: () => marcasPorDominioLigado(env.MARCAS_POR_DOMINIO),
  cache: cacheDoProcesso(),
});

/** host → marca; nunca lança. Com `MARCAS_POR_DOMINIO=off` não consulta o banco. */
export const marcaDoHost = padrao.marcaDoHost;

/** Chamada pelo CRUD de marcas e domínios (fatia 3): a mudança vale na hora. */
export const invalidarMarcaDoHost = padrao.invalidar;
