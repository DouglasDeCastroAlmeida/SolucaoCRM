/** AC-009.3: a leitura de cobranca do painel só toca os ids da página. */
import { describe, expect, it, vi } from "vitest";

const h = vi.hoisted(() => ({ ins: [] as Array<[string, string, string[]]> }));

vi.mock("@/lib/branding/marca-do-host", () => ({ invalidarMarcaDoHost: vi.fn() }));
vi.mock("@/lib/supabase/admin", () => ({
  createAdminClient: () => ({
    from: (tabela: string) => {
      const q: Record<string, unknown> = {};
      const res = () => {
        if (tabela === "organizations") return { data: [{ id: "o1", name: "A", status: "active", suspended_kind: null, brand_id: "b" }, { id: "o2", name: "B", status: "active", suspended_kind: null, brand_id: "b" }], error: null };
        if (tabela === "cobranca_assinaturas") return { data: [{ organization_id: "o1", estado: "ativa", plano_id: "p1", trial_ate: null, proximo_vencimento: null, link_de_pagamento: null }], error: null };
        return { data: [{ id: "p1", nome: "Pro", brand_id: "b" }], error: null };
      };
      for (const m of ["select", "order", "limit", "eq", "or"]) q[m] = () => q;
      q.in = (col: string, vals: string[]) => {
        h.ins.push([tabela, col, vals]);
        return q;
      };
      q.then = (ok: (v: unknown) => unknown) => Promise.resolve(res()).then(ok);
      return q;
    },
  }),
}));

import { listarContasComCobranca } from "@/lib/brands/admin-repo";

describe("AC-009.3: listarContasComCobranca", () => {
  it("AC-009.3: le assinaturas e planos só dos ids da página", async () => {
    const r = await listarContasComCobranca({ limit: 50 });
    expect(h.ins).toEqual([
      ["cobranca_assinaturas", "organization_id", ["o1", "o2"]],
      ["cobranca_planos", "id", ["p1"]],
    ]);
    expect((r[0] as { cobranca: { plano: string } }).cobranca.plano).toBe("Pro");
    expect((r[1] as { cobranca: { estado: string } }).cobranca.estado).toBe("cortesia");
  });
});
