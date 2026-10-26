import { beforeEach, describe, expect, it, vi } from "vitest";

const h = vi.hoisted(() => ({
  mfa: vi.fn(),
  user: vi.fn(),
  from: vi.fn(),
  cookieSet: vi.fn(),
  audit: vi.fn(),
}));

vi.mock("@/lib/auth/server", () => ({ mfaEmDivida: h.mfa, loadAuthUser: h.user }));
vi.mock("@/lib/supabase/server", () => ({ createClient: async () => ({ from: h.from }) }));
vi.mock("@/lib/audit", () => ({ audit: h.audit }));
vi.mock("@/lib/supabase/cookie-secure", () => ({ cookieSecure: () => false }));
vi.mock("next/headers", () => ({
  cookies: async () => ({ set: h.cookieSet, get: () => undefined }),
}));

import { setActiveOrg } from "@/app/actions/shell/setActiveOrg";

const ORG_DA_MARCA_A = "a4040000-0000-4000-8000-00000000000a";
const ORG_DA_MARCA_B = "a4040000-0000-4000-8000-00000000000b";

function membroEncontrado() {
  const chain: Record<string, unknown> = {};
  for (const m of ["select", "eq", "is", "not"]) chain[m] = () => chain;
  chain.maybeSingle = async () => ({ data: { organization_id: "x" }, error: null });
  h.from.mockReturnValue(chain);
}

beforeEach(() => {
  vi.resetAllMocks();
  h.mfa.mockResolvedValue(false);
  // `loadAuthUser` já entrega só as organizações da marca do host (A).
  h.user.mockResolvedValue({
    id: "a4040000-0000-4000-8000-0000000000aa",
    support: null,
    is_platform_admin: false,
    organizations: [{ organization_id: ORG_DA_MARCA_A }],
  });
  membroEncontrado();
});

describe("AC-004.2: abrir a organização de outra marca", () => {
  it("AC-004.2: trocar para organização de outra marca é recusado como se ela não existisse", async () => {
    const r = await setActiveOrg(ORG_DA_MARCA_B);
    expect(r).toEqual({ ok: false, error: "forbidden" });
    expect(h.cookieSet).not.toHaveBeenCalled();
  });

  it("AC-004.2: a recusa é idêntica à de um id que não existe", async () => {
    const outraMarca = await setActiveOrg(ORG_DA_MARCA_B);
    const inexistente = await setActiveOrg("a4040000-0000-4000-8000-0000000000ff");
    expect(outraMarca).toEqual(inexistente);
  });

  it("AC-004.1: trocar para organização da própria marca continua funcionando", async () => {
    const r = await setActiveOrg(ORG_DA_MARCA_A);
    expect(r.ok).toBe(true);
    expect(h.cookieSet).toHaveBeenCalledWith("active_org", ORG_DA_MARCA_A, expect.anything());
  });
});
