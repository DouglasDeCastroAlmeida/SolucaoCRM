/**
 * Mudança 003, Fatia 7 (T-029): POST converter cortesia em cobrada.
 * AC-002.3 conversão auditada; AC-009.4 papel + requireSupportWrite( antes do efeito.
 */
import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const h = vi.hoisted(() => ({
  admin: true,
  escrita: true,
  suporte: null as Response | null,
  audit: vi.fn(),
  converter: vi.fn(),
  ordem: [] as string[],
}));

vi.mock("@/lib/audit", () => ({ audit: h.audit }));
vi.mock("@/lib/supabase/admin", () => ({ createAdminClient: () => ({}) }));
vi.mock("@/lib/impersonate/support", () => ({
  requireSupportWrite: async () => (h.ordem.push("suporte"), h.suporte),
}));
vi.mock("@/lib/auth/requirePlatformAdmin", () => ({
  requirePlatformAdminEscrita: async () => {
    h.ordem.push("papel");
    if (!h.admin) throw new Error("redirect");
    if (!h.escrita) throw Object.assign(new Error("somente leitura"), { code: "forbidden_scope" });
    return { user: { id: "u-admin" }, platformAdmin: { scope: "full" } };
  },
  falhaDaEscritaDePlatformAdmin: (err: unknown) =>
    new Response(JSON.stringify({ error: { code: (err as { code?: string }).code ?? "forbidden" } }), { status: 403 }),
}));
vi.mock("@/lib/cobranca/converter", () => ({ converterCortesia: (...a: unknown[]) => (h.ordem.push("efeito"), h.converter(...a)) }));

import { POST } from "./route";

const ORG = "dddddddd-0000-4000-8000-000000000001";
const req = () => new NextRequest(`http://localhost/api/v1/admin/cobranca/organizacoes/${ORG}/converter`, { method: "POST" });
const chamar = (id = ORG) => POST(req(), { params: Promise.resolve({ id }) });

beforeEach(() => {
  vi.clearAllMocks();
  h.admin = true;
  h.escrita = true;
  h.suporte = null;
  h.ordem = [];
  h.converter.mockResolvedValue({ tipo: "convertida", marcaId: "m1", planoId: "p1" });
});

describe("POST /admin/cobranca/organizacoes/[id]/converter", () => {
  it("AC-009.4: quem não é admin da plataforma leva 403 e nada acontece", async () => {
    h.admin = false;
    expect((await chamar()).status).toBe(403);
    expect(h.converter).not.toHaveBeenCalled();
  });

  it("AC-009.4: admin somente leitura leva 403", async () => {
    h.escrita = false;
    expect((await chamar()).status).toBe(403);
    expect(h.converter).not.toHaveBeenCalled();
  });

  it("AC-009.4: requireSupportWrite roda antes do efeito e, se nega, barra", async () => {
    h.suporte = new Response("{}", { status: 403 });
    expect((await chamar()).status).toBe(403);
    expect(h.converter).not.toHaveBeenCalled();
    h.suporte = null;
    h.ordem = [];
    await chamar();
    expect(h.ordem.indexOf("suporte")).toBeLessThan(h.ordem.indexOf("efeito"));
  });

  it("AC-002.3: converte e audita cobranca.org_convertida", async () => {
    const res = await chamar();
    expect(res.status).toBe(200);
    expect(h.audit).toHaveBeenCalledWith(
      expect.objectContaining({
        action: "cobranca.org_convertida",
        actorUserId: "u-admin",
        organizationId: ORG,
        resourceType: "organization",
        resourceId: ORG,
        metadata: expect.objectContaining({ brand_id: "m1", plano_id: "p1" }),
      }),
    );
  });

  it("AC-002.3: id que não é UUID leva 400", async () => {
    expect((await chamar("x")).status).toBe(400);
    expect(h.converter).not.toHaveBeenCalled();
  });

  it.each([
    [{ tipo: "org_inexistente" }, 404, "not_found"],
    [{ tipo: "ja_cobrada" }, 409, "state_conflict"],
    [{ tipo: "marca_nao_cobra" }, 409, "state_conflict"],
    [{ tipo: "marca_sem_plano" }, 422, "cobranca_marca_sem_plano"],
  ])("AC-002.3: %o vira %i e não audita", async (resultado, status, codigo) => {
    h.converter.mockResolvedValue(resultado);
    const res = await chamar();
    expect(res.status).toBe(status);
    expect((await res.json()).error.code).toBe(codigo);
    expect(h.audit).not.toHaveBeenCalled();
  });
});
