import { beforeEach, describe, expect, it, vi } from "vitest";

import { MARCA_PADRAO_EMBUTIDA, type Brand } from "@/lib/brands/tipos";

const h = vi.hoisted(() => ({
  orgInsert: vi.fn(),
  copiar: vi.fn(),
  audit: vi.fn(),
}));

/** Banco falso: sem vínculo ativo; o insert da organização é espiado. */
vi.mock("@/lib/supabase/admin", () => ({
  createAdminClient: () => ({
    from: (tabela: string) => {
      if (tabela === "user_organizations") {
        const c: Record<string, unknown> = {};
        for (const m of ["select", "eq", "is", "limit"]) c[m] = () => c;
        c.maybeSingle = async () => ({ data: null, error: null });
        c.insert = async () => ({ error: null });
        return c;
      }
      return {
        insert: (linha: unknown) => {
          h.orgInsert(linha);
          return {
            select: () => ({ single: async () => ({ data: { id: "org-nova", slug: "x" }, error: null }) }),
          };
        },
      };
    },
  }),
}));
vi.mock("@/lib/audit", () => ({ audit: h.audit }));
vi.mock("@/lib/brands/pacote", () => ({ copiarPacoteParaOrganizacao: h.copiar }));

import { ensureTenantForUser } from "@/lib/auth/provision";

const marcaA: Brand = {
  ...MARCA_PADRAO_EMBUTIDA,
  id: "7b1c0000-0000-4000-8000-00000000000a",
  slug: "corretor",
  name: "Corretor",
  is_default: false,
  cadastro_aberto: true,
  default_pack_id: "pack-1",
};
const usuario = { id: "u-1", email: "a@exemplo.test", user_metadata: { org_name: "Imob Alfa" } };

beforeEach(() => {
  vi.clearAllMocks();
  h.copiar.mockResolvedValue(true);
});

describe("AC-005.3: cadastro aberto liga a organização à marca e copia o pacote", () => {
  it("AC-005.3: a organização nasce com brand_id da marca do host", async () => {
    await ensureTenantForUser(usuario, { source: "signup", brand: marcaA });
    expect(h.orgInsert).toHaveBeenCalledWith(expect.objectContaining({ brand_id: marcaA.id }));
  });

  it("AC-005.3: copia o pacote vertical padrão da marca para a organização criada", async () => {
    await ensureTenantForUser(usuario, { source: "signup", brand: marcaA });
    expect(h.copiar).toHaveBeenCalledWith("org-nova", marcaA.id);
  });

  it("AC-005.3: falha na cópia do pacote não derruba a criação da organização", async () => {
    h.copiar.mockRejectedValue(new Error("boom"));
    const r = await ensureTenantForUser(usuario, { source: "signup", brand: marcaA });
    expect(r).toEqual({ provisioned: true, organizationId: "org-nova" });
  });
});

describe("AC-002.2: sem marca real nada muda", () => {
  it("AC-002.2: marca padrão embutida (chave off ou banco fora) não grava brand_id nem copia pacote", async () => {
    await ensureTenantForUser(usuario, { source: "signup", brand: MARCA_PADRAO_EMBUTIDA });
    const linha = h.orgInsert.mock.calls[0]?.[0] as Record<string, unknown>;
    expect("brand_id" in linha).toBe(false);
    expect(h.copiar).not.toHaveBeenCalled();
  });

  it("AC-002.2: sem opção de marca, o insert é o de antes", async () => {
    await ensureTenantForUser(usuario, { source: "signup" });
    const linha = h.orgInsert.mock.calls[0]?.[0] as Record<string, unknown>;
    expect("brand_id" in linha).toBe(false);
  });
});
