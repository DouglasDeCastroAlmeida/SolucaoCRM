import { beforeEach, describe, expect, it, vi } from "vitest";

import { MARCA_PADRAO_EMBUTIDA, type Brand } from "@/lib/brands/tipos";

/**
 * Conta que só tem organização na marca B abre o host da marca A. Sem isto, o
 * vínculo de B contava como "já tem organização": o callback mandava para /app (casca
 * vazia, porque a lista é filtrada) e a recuperação tratava "não provisionou" como
 * sucesso, num loop.
 */

const h = vi.hoisted(() => ({
  vinculos: [] as Array<{ organization_id: string; organizations: { brand_id: string | null } }>,
  admin: false,
  orgInsert: vi.fn(),
}));

vi.mock("@/lib/supabase/admin", () => ({
  createAdminClient: () => ({
    from: (tabela: string) => {
      const c: Record<string, unknown> = {};
      for (const m of ["select", "eq", "is", "limit"]) c[m] = () => c;
      if (tabela === "user_organizations") {
        c.insert = async () => ({ error: null });
        c.then = (res: (v: unknown) => unknown) => res({ data: h.vinculos, error: null });
        c.maybeSingle = async () => ({ data: h.vinculos[0] ?? null, error: null });
        return c;
      }
      if (tabela === "platform_admins") {
        c.maybeSingle = async () => ({ data: h.admin ? { user_id: "u" } : null, error: null });
        return c;
      }
      return {
        insert: (linha: unknown) => {
          h.orgInsert(linha);
          return { select: () => ({ single: async () => ({ data: { id: "org-nova", slug: "x" }, error: null }) }) };
        },
      };
    },
  }),
}));
vi.mock("@/lib/audit", () => ({ audit: vi.fn() }));
vi.mock("@/lib/brands/pacote", () => ({ copiarPacoteParaOrganizacao: vi.fn(async () => true) }));

import { ensureTenantForUser, vinculoAtivo } from "@/lib/auth/provision";

const marca = (id: string, extra: Partial<Brand> = {}): Brand => ({
  ...MARCA_PADRAO_EMBUTIDA,
  id,
  slug: id,
  is_default: false,
  cadastro_aberto: true,
  ...extra,
});
const marcaA = marca("marca-a");

beforeEach(() => {
  vi.clearAllMocks();
  h.admin = false;
  h.vinculos = [{ organization_id: "org-b", organizations: { brand_id: "marca-b" } }];
});

describe("AC-004.1: conta só com organização na marca B, no host da marca A", () => {
  it("AC-004.1: vinculoAtivo não conta a organização de outra marca", async () => {
    expect(await vinculoAtivo("u1", marcaA)).toBeNull();
  });

  it("AC-004.1: vinculoAtivo devolve a organização da própria marca", async () => {
    h.vinculos = [
      { organization_id: "org-b", organizations: { brand_id: "marca-b" } },
      { organization_id: "org-a", organizations: { brand_id: "marca-a" } },
    ];
    expect(await vinculoAtivo("u1", marcaA)).toBe("org-a");
  });

  it("AC-004.1: admin da plataforma enxerga o vínculo de qualquer marca", async () => {
    h.admin = true;
    expect(await vinculoAtivo("u1", marcaA)).toBe("org-b");
  });

  it("AC-004.1: sem marca (ou marca embutida) vale o vínculo de antes", async () => {
    expect(await vinculoAtivo("u1")).toBe("org-b");
    expect(await vinculoAtivo("u1", MARCA_PADRAO_EMBUTIDA)).toBe("org-b");
  });
});

describe("AC-005.3: marca aberta provisiona organização nova para a conta que só tinha a de outra marca", () => {
  it("AC-005.3: ensureTenantForUser cria a organização na marca do host", async () => {
    const r = await ensureTenantForUser(
      { id: "u1", email: "a@exemplo.test", user_metadata: { org_name: "Alfa" } },
      { source: "recovery", brand: marcaA },
    );
    expect(r).toEqual({ provisioned: true, organizationId: "org-nova" });
    expect(h.orgInsert).toHaveBeenCalledWith(expect.objectContaining({ brand_id: "marca-a" }));
  });
});
