import { describe, expect, it } from "vitest";

import { camadaDaMarca } from "@/lib/branding/camada-de-marca";
import { razaoDeContraste } from "@/lib/branding/contraste";
import { criarMarcaDoHost, type Entrada } from "@/lib/branding/marca-do-host";
import { REGUA_DO_PRODUTO } from "@/lib/branding/regua-do-produto";
import { resolverMarca } from "@/lib/branding/resolve";
import { MARCA_PADRAO_EMBUTIDA, type Brand } from "@/lib/brands/tipos";

const marca: Brand = { ...MARCA_PADRAO_EMBUTIDA, is_default: false, name: "X", accent_hex: "#0a5c36" };

function p95(medidas: number[]): number {
  const ord = [...medidas].sort((a, b) => a - b);
  return ord[Math.min(ord.length - 1, Math.ceil(ord.length * 0.95) - 1)] ?? 0;
}

function novoResolvedor() {
  return criarMarcaDoHost({
    buscar: async () => ({ brand: marca, domainKind: "proprio" as const }),
    ligado: () => true,
    cache: new Map<string, Entrada>(),
  });
}

describe("desempenho do resolvedor", () => {
  it("AC-010.1: com cache quente o p95 fica abaixo de 30 ms", async () => {
    const r = novoResolvedor();
    await r.marcaDoHost("q.io");
    const medidas: number[] = [];
    for (let i = 0; i < 200; i++) {
      const t = performance.now();
      await r.marcaDoHost("q.io");
      medidas.push(performance.now() - t);
    }
    expect(p95(medidas)).toBeLessThan(30);
  });

  it("AC-010.1: com cache frio (hosts novos) o p95 fica abaixo de 200 ms", async () => {
    const r = novoResolvedor();
    const medidas: number[] = [];
    for (let i = 0; i < 100; i++) {
      const t = performance.now();
      await r.marcaDoHost(`h${i}.io`);
      medidas.push(performance.now() - t);
    }
    expect(p95(medidas)).toBeLessThan(200);
  });
});

describe("contraste da cor da marca", () => {
  it("AC-010.2: cor clara demais é ajustada pela régua e o texto sobre ela passa de 4,5:1", () => {
    const m = resolverMarca([camadaDaMarca({ ...marca, accent_hex: "#ffee00" })], REGUA_DO_PRODUTO);
    const claro = m.cor?.derivada?.claro;
    expect(claro).toBeDefined();
    expect(razaoDeContraste(claro!.accent, claro!.accentFg)).toBeGreaterThanOrEqual(4.5);
  });

  it("AC-010.2: cor acromática não pinta o produto e o motivo fica registrado", () => {
    const m = resolverMarca([camadaDaMarca({ ...marca, accent_hex: "#808080" })], REGUA_DO_PRODUTO);
    expect(m.motivos.map((x) => x.codigo)).toContain("marca_acromatica");
  });
});
