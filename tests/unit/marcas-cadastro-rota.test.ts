import { beforeEach, describe, expect, it, vi } from "vitest";

import { MARCA_PADRAO_EMBUTIDA, type Brand } from "@/lib/brands/tipos";

const h = vi.hoisted(() => ({
  marca: { current: null as unknown },
  signUpDoProvedor: vi.fn(),
  audit: vi.fn(),
  admin: vi.fn(),
}));

vi.mock("next/headers", () => ({
  headers: vi.fn(async () => ({
    get: (k: string) => (k === "x-forwarded-for" ? "198.51.100.77" : null),
  })),
}));
vi.mock("@/lib/branding/marca-do-pedido", () => ({
  marcaDoPedido: async () => ({ brand: h.marca.current, domainKind: "subdominio" }),
}));
vi.mock("@/lib/auth/politica-de-cadastro", () => ({ modoDeCadastro: vi.fn(async () => "aberto") }));
vi.mock("@/lib/instalacao/modulos", () => ({ moduloLigado: vi.fn(async () => false) }));
vi.mock("@/lib/supabase/admin", () => ({ createAdminClient: h.admin }));
vi.mock("@/lib/supabase/server", () => ({
  createClient: async () => ({ auth: { signUp: h.signUpDoProvedor } }),
}));
vi.mock("@/lib/audit", async (orig) => ({
  ...(await orig<Record<string, unknown>>()),
  audit: h.audit,
}));

const marca = (extra: Partial<Brand>): Brand => ({
  ...MARCA_PADRAO_EMBUTIDA,
  id: "marca-x",
  slug: "x",
  name: "X",
  is_default: false,
  ...extra,
});

let n = 0;
const entrada = () => ({
  org_name: "Imob Alfa",
  email: `marcas-${++n}-${Date.now()}@exemplo.test`,
  password: "SenhaForte!2026",
  password_confirm: "SenhaForte!2026",
});

beforeEach(() => {
  vi.clearAllMocks();
  h.signUpDoProvedor.mockResolvedValue({ data: { user: { id: "u1" }, session: null }, error: null });
});

describe("AC-005.2: cadastro fechado responde por convite", () => {
  it("AC-005.2: marca com cadastro_aberto=false recusa e não cria conta nenhuma no provedor", async () => {
    h.marca.current = marca({ cadastro_aberto: false });
    const { signUp } = await import("@/app/actions/auth/signUp");
    const res = await signUp(entrada());
    expect(res).toEqual({ ok: false, error: "somente_convite" });
    expect(h.signUpDoProvedor).not.toHaveBeenCalled();
  });

  it("AC-005.2: a recusa fica na trilha de auditoria", async () => {
    h.marca.current = marca({ cadastro_aberto: false });
    const { signUp } = await import("@/app/actions/auth/signUp");
    await signUp(entrada());
    expect(h.audit).toHaveBeenCalledWith(
      expect.objectContaining({ action: "auth.signup_failed" }),
    );
  });
});

describe("AC-005.3: cadastro aberto", () => {
  it("AC-005.3: marca com cadastro_aberto=true deixa o cadastro seguir até o provedor", async () => {
    h.marca.current = marca({ cadastro_aberto: true });
    const { signUp } = await import("@/app/actions/auth/signUp");
    const res = await signUp(entrada());
    expect(res.ok).toBe(true);
    expect(h.signUpDoProvedor).toHaveBeenCalledTimes(1);
  });

  it("AC-005.3: grava a marca de origem nos metadados do cadastro", async () => {
    h.marca.current = marca({ cadastro_aberto: true });
    const { signUp } = await import("@/app/actions/auth/signUp");
    await signUp(entrada());
    expect(h.signUpDoProvedor).toHaveBeenCalledWith(
      expect.objectContaining({ options: expect.objectContaining({ data: expect.objectContaining({ brand_id: "marca-x" }) }) }),
    );
  });
});
