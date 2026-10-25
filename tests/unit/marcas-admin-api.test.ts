/**
 * Rotas /api/v1/admin de marcas, domínios, planos, pacotes e contas: 403 para
 * quem não é admin da plataforma, requireSupportWrite antes do efeito, Zod e
 * auditoria em toda mutação.
 */
import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const h = vi.hoisted(() => {
  class Negada extends Error {
    code = "forbidden_scope";
  }
  return {
    Negada,
    admin: true,
    escrita: true,
    suporte: null as Response | null,
    audit: vi.fn(),
    repo: {
      listarMarcas: vi.fn(),
      criarMarca: vi.fn(),
      editarMarca: vi.fn(),
      desativarMarca: vi.fn(),
      adicionarDominio: vi.fn(),
      removerDominio: vi.fn(),
      listarPlanos: vi.fn(),
      criarPlano: vi.fn(),
      editarPlano: vi.fn(),
      listarPacotes: vi.fn(),
      criarPacote: vi.fn(),
      editarPacote: vi.fn(),
      listarContasComMarca: vi.fn(),
    },
    rpc: vi.fn(),
    ordem: [] as string[],
  };
});

vi.mock("@/lib/audit", () => ({ audit: h.audit }));
vi.mock("@/lib/impersonate/support", () => ({
  requireSupportWrite: async () => (h.ordem.push("suporte"), h.suporte),
}));
vi.mock("@/lib/auth/requirePlatformAdmin", () => ({
  requirePlatformAdmin: async () => {
    if (!h.admin) throw new Error("redirect");
    return { user: { id: "u-admin" }, platformAdmin: { scope: "full" } };
  },
  requirePlatformAdminEscrita: async () => {
    h.ordem.push("papel");
    if (!h.admin) throw new Error("redirect");
    if (!h.escrita) throw new h.Negada("forbidden_scope");
    return { user: { id: "u-admin" }, platformAdmin: { scope: "full" } };
  },
  falhaDaEscritaDePlatformAdmin: (err: unknown) =>
    new Response(JSON.stringify({ error: { code: (err as { code?: string }).code ?? "forbidden" } }), { status: 403 }),
}));
vi.mock("@/lib/brands/admin-repo", async () => {
  class ErroDeMarca extends Error {
    constructor(public code: string, m: string, public status: number) {
      super(m);
    }
  }
  return { ErroDeMarca, ...h.repo };
});
vi.mock("@/lib/supabase/server", () => ({ createClient: async () => ({ rpc: h.rpc }) }));

import { GET as getMarcas, POST as postMarca } from "@/app/api/v1/admin/brands/route";
import { DELETE as delMarca, PATCH as patchMarca } from "@/app/api/v1/admin/brands/[id]/route";
import { DELETE as delDominio, POST as postDominio } from "@/app/api/v1/admin/brands/[id]/domains/route";
import { PATCH as patchPlano, POST as postPlano } from "@/app/api/v1/admin/brands/[id]/plans/route";
import { PATCH as patchPacote, POST as postPacote } from "@/app/api/v1/admin/vertical-packs/route";
import { GET as getContas } from "@/app/api/v1/admin/organizations/route";
import { PATCH as patchOrgMarca } from "@/app/api/v1/admin/organizations/[id]/brand/route";
import { ErroDeMarca } from "@/lib/brands/admin-repo";

const ID = "11111111-1111-4111-8111-111111111111";
const ID2 = "22222222-2222-4222-8222-222222222222";
const ctx = { params: Promise.resolve({ id: ID }) };
const req = (metodo: string, corpo?: unknown, url = "http://localhost/api/v1/admin/x") =>
  new NextRequest(url, {
    method: metodo,
    body: corpo === undefined ? undefined : JSON.stringify(corpo),
    headers: { "content-type": "application/json" },
  });

beforeEach(() => {
  vi.clearAllMocks();
  h.admin = true;
  h.escrita = true;
  h.suporte = null;
  h.ordem = [];
  h.repo.criarMarca.mockResolvedValue({ id: ID, slug: "nova" });
  h.repo.editarMarca.mockResolvedValue({ id: ID });
  h.repo.desativarMarca.mockResolvedValue({ id: ID, status: "inactive" });
  h.repo.adicionarDominio.mockResolvedValue({ id: ID2 });
  h.repo.removerDominio.mockResolvedValue({ host: "a.b.com" });
  h.repo.criarPlano.mockResolvedValue({ id: ID2 });
  h.repo.editarPlano.mockResolvedValue({ id: ID2 });
  h.repo.criarPacote.mockResolvedValue({ id: ID2, slug: "p" });
  h.repo.editarPacote.mockResolvedValue({ id: ID2 });
  h.repo.listarContasComMarca.mockResolvedValue([]);
  h.rpc.mockResolvedValue({ error: null });
});

const chamadas = {
  "POST brands": () => postMarca(req("POST", { slug: "nova", name: "Nova" })),
  "PATCH brands/id": () => patchMarca(req("PATCH", { name: "N" }), ctx),
  "DELETE brands/id": () => delMarca(req("DELETE"), ctx),
  "POST domains": () => postDominio(req("POST", { host: "a.b.com", kind: "proprio" }), ctx),
  "DELETE domains": () => delDominio(req("DELETE", undefined, `http://localhost/x?domain_id=${ID2}`), ctx),
  "POST plans": () => postPlano(req("POST", { name: "P", price_cents: 100 }), ctx),
  "PATCH plans": () => patchPlano(req("PATCH", { plan_id: ID2, name: "Q" }), ctx),
  "POST packs": () => postPacote(req("POST", { slug: "p", name: "P" })),
  "PATCH packs": () => patchPacote(req("PATCH", { pack_id: ID2, name: "Q" })),
  "PATCH org brand": () => patchOrgMarca(req("PATCH", { brand_id: ID2 }), ctx),
} as const;

describe("AC-008.6: quem não é admin da plataforma", () => {
  it.each(Object.keys(chamadas))("AC-008.6: %s recusa não-admin e não escreve nada", async (nome) => {
    h.admin = false;
    const res = await chamadas[nome as keyof typeof chamadas]();
    expect(res.status).toBe(403);
    for (const f of Object.values(h.repo)) expect(f).not.toHaveBeenCalled();
    expect(h.rpc).not.toHaveBeenCalled();
    expect(h.audit).not.toHaveBeenCalled();
  });

  it("AC-008.6: leituras (marcas, contas) devolvem 403 ao não-admin", async () => {
    h.admin = false;
    expect((await getMarcas()).status).toBe(403);
    expect((await getContas(req("GET"))).status).toBe(403);
  });

  it("AC-008.6: admin sem escopo de escrita (support_readonly) é recusado", async () => {
    h.escrita = false;
    const res = await postMarca(req("POST", { slug: "nova", name: "Nova" }));
    expect(res.status).toBe(403);
    expect(h.repo.criarMarca).not.toHaveBeenCalled();
  });
});

describe("AC-008.7: guarda de efeito e auditoria", () => {
  it.each(Object.keys(chamadas))("AC-008.7: %s respeita requireSupportWrite antes do efeito", async (nome) => {
    h.suporte = new Response(null, { status: 403 });
    const res = await chamadas[nome as keyof typeof chamadas]();
    expect(res.status).toBe(403);
    for (const f of Object.values(h.repo)) expect(f).not.toHaveBeenCalled();
    expect(h.rpc).not.toHaveBeenCalled();
    expect(h.ordem[0]).toBe("suporte");
  });

  it.each([
    ["POST brands", "brand.created"],
    ["PATCH brands/id", "brand.updated"],
    ["DELETE brands/id", "brand.deactivated"],
    ["POST domains", "brand_domain.added"],
    ["DELETE domains", "brand_domain.removed"],
    ["POST plans", "brand_plan.saved"],
    ["PATCH plans", "brand_plan.saved"],
    ["POST packs", "vertical_pack.saved"],
    ["PATCH packs", "vertical_pack.saved"],
  ] as const)("AC-008.7: %s grava uma entrada de auditoria com quem fez", async (nome, acao) => {
    const res = await chamadas[nome]();
    expect(res.status).toBeLessThan(300);
    expect(h.audit).toHaveBeenCalledTimes(1);
    expect(h.audit.mock.calls[0]?.[0]).toMatchObject({ action: acao, actorUserId: "u-admin" });
  });
});

describe("AC-008.1 / AC-008.2 / AC-008.3: contrato", () => {
  it("AC-008.1: cria marca com 201 e recusa campo desconhecido, cor inválida e is_default", async () => {
    expect((await postMarca(req("POST", { slug: "nova", name: "Nova" }))).status).toBe(201);
    for (const ruim of [
      { slug: "nova", name: "N", is_default: true },
      { slug: "nova", name: "N", accent_hex: "#FFF" },
      { slug: "Nova Marca", name: "N" },
    ]) {
      expect((await postMarca(req("POST", ruim))).status).toBe(400);
    }
    expect(h.repo.criarMarca).toHaveBeenCalledTimes(1);
  });

  it("AC-008.1: marca padrão não se desativa (409)", async () => {
    h.repo.desativarMarca.mockRejectedValue(new ErroDeMarca("brand_default_protected", "x", 409));
    const res = await delMarca(req("DELETE"), ctx);
    expect(res.status).toBe(409);
    expect((await res.json()).error.code).toBe("brand_default_protected");
    expect(h.audit).not.toHaveBeenCalled();
  });

  it("AC-008.2: domínio duplicado volta 409 brand_domain_exists, sem auditar sucesso", async () => {
    h.repo.adicionarDominio.mockRejectedValue(new ErroDeMarca("brand_domain_exists", "Este endereço já está cadastrado.", 409));
    const res = await postDominio(req("POST", { host: "A.B.com", kind: "proprio" }), ctx);
    expect(res.status).toBe(409);
    expect((await res.json()).error.code).toBe("brand_domain_exists");
    expect(h.audit).not.toHaveBeenCalled();
    // o endereço é normalizado para minúsculas antes de chegar ao repositório
    expect(h.repo.adicionarDominio).toHaveBeenCalledWith(ID, "a.b.com", "proprio");
  });

  it("AC-008.2: endereço inválido é recusado antes do banco", async () => {
    expect((await postDominio(req("POST", { host: "sem ponto", kind: "proprio" }), ctx)).status).toBe(400);
    expect(h.repo.adicionarDominio).not.toHaveBeenCalled();
  });

  it("AC-008.3: plano usa centavos inteiros; preço fracionado ou negativo é recusado", async () => {
    expect((await postPlano(req("POST", { name: "P", price_cents: 99.5 }), ctx)).status).toBe(400);
    expect((await postPlano(req("POST", { name: "P", price_cents: -1 }), ctx)).status).toBe(400);
    expect((await postPlano(req("POST", { name: "P", price_cents: 9900, currency: "brl" }), ctx)).status).toBe(201);
    expect(h.repo.criarPlano).toHaveBeenCalledWith(ID, expect.objectContaining({ price_cents: 9900, currency: "BRL", cycle: "monthly" }));
  });
});

describe("AC-008.5 / AC-003.5: contas e troca de marca", () => {
  it("AC-008.5: lista contas aceitando filtro de marca só pela query", async () => {
    const res = await getContas(req("GET", undefined, `http://localhost/x?brand_id=${ID2}&limit=10`));
    expect(res.status).toBe(200);
    expect(h.repo.listarContasComMarca).toHaveBeenCalledWith({ brandId: ID2, q: undefined, limit: 10 });
    expect((await getContas(req("GET", undefined, "http://localhost/x?brand_id=nao-uuid"))).status).toBe(400);
  });

  it("AC-003.5: troca a marca pela RPC com a sessão do admin (a RPC audita), sem audit() duplicado", async () => {
    const res = await patchOrgMarca(req("PATCH", { brand_id: ID2 }), ctx);
    expect(res.status).toBe(200);
    expect(h.rpc).toHaveBeenCalledWith("fn_set_org_brand", { p_org_id: ID, p_brand_id: ID2 });
    expect(h.audit).not.toHaveBeenCalled();
  });

  it("AC-003.5: erros da RPC viram 403/404", async () => {
    h.rpc.mockResolvedValueOnce({ error: { code: "42501", message: "forbidden" } });
    expect((await patchOrgMarca(req("PATCH", { brand_id: ID2 }), ctx)).status).toBe(403);
    h.rpc.mockResolvedValueOnce({ error: { code: "P0002", message: "organization_not_found" } });
    expect((await patchOrgMarca(req("PATCH", { brand_id: ID2 }), ctx)).status).toBe(404);
  });
});
