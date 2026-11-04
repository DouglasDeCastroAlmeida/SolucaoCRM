import { describe, expect, it, vi } from "vitest";

import { houveEfeito, podarHistorico, TAMANHO_DO_LOTE, type PodaDb } from "@/app/api/v1/cron/data-retention/route";

vi.mock("@/lib/env", () => ({ env: { INTERNAL_CRON_SECRET: "segredo", INTERNAL_SECRET: "" } }));
vi.mock("@/lib/audit", () => ({ audit: vi.fn() }));

function banco(apagarEmailIgnorados?: PodaDb["apagarEmailIgnorados"]): PodaDb {
  return {
    rpc: async () => ({ data: 0, error: null }),
    enfileirarMidia: async () => ({ data: {}, error: null }),
    apagarRascunhos: async () => ({ data: 0, error: null }),
    ...(apagarEmailIgnorados ? { apagarEmailIgnorados } : {}),
  };
}

describe("poda dos e-mails ignorados no data-retention", () => {
  it("AC-003.3: corta aos 30 dias, conta o que apagou e deixa trilha", async () => {
    const apagar = vi.fn().mockResolvedValueOnce({ data: 7, error: null });
    const antes = Date.now();
    const r = await podarHistorico(banco(apagar), {});
    expect(apagar).toHaveBeenCalledTimes(1);
    const corte = new Date(apagar.mock.calls[0]![0] as string).getTime();
    expect(antes - corte).toBeGreaterThanOrEqual(30 * 86_400_000 - 1000);
    expect(antes - corte).toBeLessThan(30 * 86_400_000 + 60_000);
    expect(r.email_ignorados_apagados).toBe(7);
    expect(houveEfeito(r)).toBe(true);
  });

  it("AC-003.3: rodada sem nada vencido nao conta como efeito", async () => {
    const r = await podarHistorico(banco(vi.fn().mockResolvedValue({ data: 0, error: null })), {});
    expect(r.email_ignorados_apagados).toBe(0);
    expect(houveEfeito(r)).toBe(false);
  });

  it("AC-003.3: continua em lotes enquanto vier lote cheio", async () => {
    const apagar = vi
      .fn()
      .mockResolvedValueOnce({ data: TAMANHO_DO_LOTE, error: null })
      .mockResolvedValueOnce({ data: 3, error: null });
    const r = await podarHistorico(banco(apagar), {});
    expect(r.email_ignorados_apagados).toBe(TAMANHO_DO_LOTE + 3);
    expect(r.lotes_email_ignorados).toBe(2);
  });

  it("AC-003.3: falha da poda e nomeada e nao derruba as irmas", async () => {
    const r = await podarHistorico(banco(vi.fn().mockResolvedValue({ data: null, error: { message: "permission denied" } })), {});
    expect(r.falhas.some((f) => f.startsWith("email_ignorados"))).toBe(true);
  });

  it("uma implementacao de PodaDb sem o metodo simplesmente nao poda", async () => {
    const r = await podarHistorico(banco(), {});
    expect(r.email_ignorados_apagados).toBe(0);
    expect(r.falhas).toEqual([]);
  });
});
