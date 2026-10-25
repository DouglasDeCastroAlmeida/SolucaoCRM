import { describe, expect, it, vi } from "vitest";

import { MARCA_PADRAO_EMBUTIDA, type Brand } from "@/lib/brands/tipos";
import {
  criarMarcaDoHost,
  LIMITE_DO_CACHE,
  marcasPorDominioLigado,
  type Entrada,
} from "@/lib/branding/marca-do-host";
import { normalizarHost } from "@/lib/branding/host";

const marca = (patch: Partial<Brand> = {}): Brand => ({
  ...MARCA_PADRAO_EMBUTIDA,
  id: "11111111-1111-4111-8111-111111111111",
  slug: "corretor",
  name: "Corretor",
  is_default: false,
  app_name: "Corretor Pro",
  accent_hex: "#0a5c36",
  ...patch,
});

type Dominios = Record<string, { brand: Brand; kind: "subdominio" | "proprio"; ativo: boolean }>;

/** Banco falso: tabela de domínios em memória, com contagem de consultas. */
function bancoFalso(dominios: Dominios) {
  return vi.fn(async (host: string) => {
    const d = dominios[host];
    if (!d || !d.ativo || d.brand.status !== "active") {
      return { brand: MARCA_PADRAO_EMBUTIDA, domainKind: "padrao" as const };
    }
    return { brand: d.brand, domainKind: d.kind };
  });
}

function resolvedor(
  buscar: (host: string) => Promise<{ brand: Brand; domainKind: "padrao" | "subdominio" | "proprio" }>,
  extra: { cache?: Map<string, unknown>; timeoutMs?: number } = {},
) {
  const avisos: Array<{ msg: string; ctx: Record<string, unknown> }> = [];
  let agora = 1_000_000;
  const r = criarMarcaDoHost({
    buscar,
    ligado: () => true,
    agora: () => agora,
    avisar: (msg, ctx) => avisos.push({ msg, ctx }),
    cache: (extra.cache ?? new Map()) as Map<string, Entrada>,
    ...(extra.timeoutMs ? { timeoutMs: extra.timeoutMs } : {}),
  });
  return { ...r, avisos, avancar: (ms: number) => (agora += ms) };
}

describe("normalizarHost", () => {
  it("tira porta, caixa, ponto final e espaço", () => {
    expect(normalizarHost(" Corretor.Corretora.IO.:443 ")).toBe("corretor.corretora.io");
  });
  it("devolve vazio para o que não é host", () => {
    expect(normalizarHost("a b/c")).toBe("");
    expect(normalizarHost(null)).toBe("");
  });
});

describe("resolvedor de marca por host", () => {
  it("AC-001.1: domínio ativo de marca ativa devolve a marca do domínio", async () => {
    const r = resolvedor(
      bancoFalso({ "corretor.corretora.io": { brand: marca(), kind: "subdominio", ativo: true } }),
    );
    const out = await r.marcaDoHost("Corretor.Corretora.io:443");
    expect(out.brand.name).toBe("Corretor");
    expect(out.domainKind).toBe("subdominio");
  });

  it("AC-001.2: host desconhecido devolve a marca padrão", async () => {
    const r = resolvedor(bancoFalso({}));
    const out = await r.marcaDoHost("qualquer.com");
    expect(out.brand.is_default).toBe(true);
    expect(out.domainKind).toBe("padrao");
  });

  it("AC-001.3: domínio desativado ou removido devolve a marca padrão", async () => {
    const r = resolvedor(bancoFalso({ "off.x.io": { brand: marca(), kind: "proprio", ativo: false } }));
    expect((await r.marcaDoHost("off.x.io")).brand.is_default).toBe(true);
  });

  it("AC-001.3: domínio ligado a marca inativa devolve a marca padrão", async () => {
    const r = resolvedor(
      bancoFalso({
        "inativa.x.io": { brand: marca({ status: "inactive" }), kind: "proprio", ativo: true },
      }),
    );
    expect((await r.marcaDoHost("inativa.x.io")).brand.is_default).toBe(true);
  });

  it("AC-001.2: host vazio ou inválido devolve a padrão sem consultar o banco", async () => {
    const buscar = bancoFalso({});
    const r = resolvedor(buscar);
    expect((await r.marcaDoHost("")).brand.is_default).toBe(true);
    expect(buscar).not.toHaveBeenCalled();
  });
});

describe("degradação e cache do resolvedor", () => {
  it("AC-001.4: banco fora devolve a padrão, não lança e registra o motivo", async () => {
    const r = resolvedor(async () => {
      throw new Error("conexão recusada");
    });
    const out = await r.marcaDoHost("x.io");
    expect(out.brand.is_default).toBe(true);
    expect(r.avisos).toHaveLength(1);
    expect(r.avisos[0]?.ctx.motivo).toBe("consulta_falhou");
  });

  it("AC-001.4: banco lento (estoura o tempo) devolve a padrão com motivo", async () => {
    vi.useFakeTimers();
    try {
      const r = resolvedor(() => new Promise<never>(() => {}), { timeoutMs: 50 });
      const promessa = r.marcaDoHost("lento.io");
      await vi.advanceTimersByTimeAsync(60);
      const out = await promessa;
      expect(out.brand.is_default).toBe(true);
      expect(r.avisos[0]?.ctx.motivo).toBe("consulta_lenta");
    } finally {
      vi.useRealTimers();
    }
  });

  it("AC-001.4: cache corrompido é descartado, a marca é buscada de novo e o motivo registrado", async () => {
    const cache = new Map<string, unknown>();
    cache.set("c.io", { lixo: true });
    const buscar = bancoFalso({ "c.io": { brand: marca(), kind: "proprio", ativo: true } });
    const r = resolvedor(buscar, { cache });
    const out = await r.marcaDoHost("c.io");
    expect(out.brand.name).toBe("Corretor");
    expect(r.avisos.some((a) => a.ctx.motivo === "cache_corrompido")).toBe(true);
  });

  it("AC-001.4: em erro serve a última marca conhecida em vez da padrão", async () => {
    let falhar = false;
    const r = resolvedor(async () => {
      if (falhar) throw new Error("fora");
      return { brand: marca(), domainKind: "proprio" as const };
    });
    await r.marcaDoHost("s.io");
    r.avancar(61_000);
    falhar = true;
    const out = await r.marcaDoHost("s.io");
    expect(out.brand.name).toBe("Corretor");
  });

  it("AC-001.4: o cache tem teto — host variado não enche a memória", async () => {
    const cache = new Map<string, unknown>();
    const r = resolvedor(async () => ({ brand: marca(), domainKind: "proprio" as const }), { cache });
    for (let i = 0; i < LIMITE_DO_CACHE + 50; i++) await r.marcaDoHost(`h${i}.io`);
    expect(cache.size).toBe(LIMITE_DO_CACHE);
    expect(cache.has("h0.io")).toBe(false);
    expect(cache.has(`h${LIMITE_DO_CACHE + 49}.io`)).toBe(true);
  });

  it("AC-001.5: dentro de 60 s o cache responde sem consultar o banco", async () => {
    const buscar = bancoFalso({ "k.io": { brand: marca(), kind: "proprio", ativo: true } });
    const r = resolvedor(buscar);
    await r.marcaDoHost("k.io");
    r.avancar(59_000);
    await r.marcaDoHost("k.io");
    expect(buscar).toHaveBeenCalledTimes(1);
  });

  it("AC-001.5: passados 60 s a mudança do domínio passa a valer", async () => {
    const dominios: Dominios = { "k.io": { brand: marca(), kind: "proprio", ativo: true } };
    const r = resolvedor(bancoFalso(dominios));
    expect((await r.marcaDoHost("k.io")).brand.name).toBe("Corretor");
    dominios["k.io"] = { brand: marca(), kind: "proprio", ativo: false };
    r.avancar(60_001);
    expect((await r.marcaDoHost("k.io")).brand.is_default).toBe(true);
  });

  it("AC-001.5: invalidar (CRUD do painel) reflete na hora", async () => {
    const dominios: Dominios = { "k.io": { brand: marca(), kind: "proprio", ativo: true } };
    const r = resolvedor(bancoFalso(dominios));
    await r.marcaDoHost("k.io");
    dominios["k.io"] = { brand: marca(), kind: "proprio", ativo: false };
    r.invalidar("k.io");
    expect((await r.marcaDoHost("k.io")).brand.is_default).toBe(true);
  });

  it("AC-001.5: invalidar sem host limpa tudo", async () => {
    const buscar = bancoFalso({ "a.io": { brand: marca(), kind: "proprio", ativo: true } });
    const r = resolvedor(buscar);
    await r.marcaDoHost("a.io");
    r.invalidar();
    await r.marcaDoHost("a.io");
    expect(buscar).toHaveBeenCalledTimes(2);
  });
});

describe("chave MARCAS_POR_DOMINIO", () => {
  it("AC-002.1: com a chave em off devolve a padrão sem consultar o banco", async () => {
    const buscar = bancoFalso({ "k.io": { brand: marca(), kind: "proprio", ativo: true } });
    const r = criarMarcaDoHost({ buscar, ligado: () => false, cache: new Map() });
    const out = await r.marcaDoHost("k.io");
    expect(out.brand.is_default).toBe(true);
    expect(buscar).not.toHaveBeenCalled();
  });

  it("AC-002.1: a chave lê off em qualquer caixa; ligada é o padrão", () => {
    expect(marcasPorDominioLigado(" OFF ")).toBe(false);
    expect(marcasPorDominioLigado("off")).toBe(false);
    expect(marcasPorDominioLigado("")).toBe(true);
    expect(marcasPorDominioLigado(undefined)).toBe(true);
    expect(marcasPorDominioLigado("on")).toBe(true);
  });
});
