/**
 * Mudança 003, Fatia 3 (T-010): rotas e repositório dos planos cobráveis da
 * marca (`cobranca_planos.brand_id`, ADR-002).
 * AC-009.1 ver e editar planos; AC-009.4 papel, requireSupportWrite( e auditoria.
 */
import { NextRequest } from "next/server";
import type * as RepoReal from "@/lib/brands/cobranca-repo";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { argumentos, bancoFalso, filtros, operacao, type BancoFalso, type Cadeia, type Resposta } from "@/tests/helpers/banco-falso-da-cobranca";

const h = vi.hoisted(() => ({
  admin: true,
  escrita: true,
  suporte: null as Response | null,
  audit: vi.fn(),
  repo: { listar: vi.fn(), criar: vi.fn(), editar: vi.fn() },
  ordem: [] as string[],
  banco: undefined as unknown as BancoFalso,
}));

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
    if (!h.escrita) throw Object.assign(new Error("somente leitura"), { code: "forbidden_scope" });
    return { user: { id: "u-admin" }, platformAdmin: { scope: "full" } };
  },
  falhaDaEscritaDePlatformAdmin: (err: unknown) =>
    new Response(JSON.stringify({ error: { code: (err as { code?: string }).code ?? "forbidden" } }), { status: 403 }),
}));
vi.mock("@/lib/brands/cobranca-repo", async (importOriginal) => ({
  ...(await importOriginal<typeof RepoReal>()),
  listarPlanosCobraveis: h.repo.listar,
  criarPlanoCobravel: h.repo.criar,
  editarPlanoCobravel: h.repo.editar,
}));
vi.mock("@/lib/supabase/admin", () => ({ createAdminClient: () => h.banco.cliente }));
vi.mock("@/lib/branding/marca-do-host", () => ({ invalidarMarcaDoHost: vi.fn() }));

import { GET, PATCH, POST } from "@/app/api/v1/admin/brands/[id]/planos-cobranca/route";
import { ErroDeMarca } from "@/lib/brands/admin-repo";
const { criarPlanoCobravel, editarPlanoCobravel, listarPlanosCobraveis } = await vi.importActual<
  typeof RepoReal
>("@/lib/brands/cobranca-repo");

const MARCA = "11111111-1111-4111-8111-111111111111";
const OUTRA = "22222222-2222-4222-8222-222222222222";
const PLANO = "33333333-3333-4333-8333-333333333333";
const ctx = { params: Promise.resolve({ id: MARCA }) };
const req = (metodo: string, corpo?: unknown) =>
  new NextRequest(`http://localhost/api/v1/admin/brands/${MARCA}/planos-cobranca`, {
    method: metodo,
    body: corpo === undefined ? undefined : JSON.stringify(corpo),
    headers: { "content-type": "application/json" },
  });
const CORPO = { nome: "Mensal", preco_cents: 9900, intervalo: "mes", trial_dias: 7, padrao_no_cadastro: true };

beforeEach(() => {
  vi.clearAllMocks();
  h.admin = true;
  h.escrita = true;
  h.suporte = null;
  h.ordem = [];
  h.repo.listar.mockResolvedValue([{ id: PLANO, nome: "Mensal" }]);
  h.repo.criar.mockResolvedValue({ id: PLANO, ...CORPO });
  h.repo.editar.mockResolvedValue({ id: PLANO, ...CORPO });
});

describe("rotas dos planos cobráveis da marca", () => {
  it("AC-009.1: lista os planos da marca do path", async () => {
    const res = await GET(req("GET"), ctx);
    expect(res.status).toBe(200);
    expect(h.repo.listar).toHaveBeenCalledWith(MARCA);
    expect((await res.json()).data).toEqual([{ id: PLANO, nome: "Mensal" }]);
  });

  it("AC-009.1: cria plano com nome, preço, intervalo e limites; a marca vem do path, quem criou vai junto", async () => {
    const res = await POST(req("POST", { ...CORPO, max_assentos: 5, max_canais: 2 }), ctx);
    expect(res.status).toBe(201);
    expect(h.repo.criar).toHaveBeenCalledWith(MARCA, expect.objectContaining({ nome: "Mensal", preco_cents: 9900, intervalo: "mes", max_assentos: 5, max_canais: 2 }), "u-admin");
  });

  it("AC-009.1: edita o plano (preço anual) pelo plan_id", async () => {
    const res = await PATCH(req("PATCH", { plan_id: PLANO, preco_cents: 99000, intervalo: "ano" }), ctx);
    expect(res.status).toBe(200);
    expect(h.repo.editar).toHaveBeenCalledWith(MARCA, PLANO, { preco_cents: 99000, intervalo: "ano" }, "u-admin");
  });

  it("AC-009.4: criar e editar auditam cobranca.plano_salvo com a marca no metadata", async () => {
    await POST(req("POST", CORPO), ctx);
    await PATCH(req("PATCH", { plan_id: PLANO, nome: "Novo" }), ctx);
    expect(h.audit).toHaveBeenCalledTimes(2);
    expect(h.audit).toHaveBeenNthCalledWith(1, expect.objectContaining({ action: "cobranca.plano_salvo", actorUserId: "u-admin", resourceId: PLANO, metadata: expect.objectContaining({ brand_id: MARCA, op: "created" }) }));
    expect(h.audit).toHaveBeenNthCalledWith(2, expect.objectContaining({ action: "cobranca.plano_salvo", metadata: expect.objectContaining({ brand_id: MARCA, op: "updated" }) }));
  });

  it("AC-009.4: arquivar audita cobranca.plano_arquivado", async () => {
    await PATCH(req("PATCH", { plan_id: PLANO, arquivado: true }), ctx);
    expect(h.audit).toHaveBeenCalledWith(expect.objectContaining({ action: "cobranca.plano_arquivado" }));
  });

  it("AC-009.4: requireSupportWrite roda antes do papel nos dois verbos de escrita", async () => {
    await POST(req("POST", CORPO), ctx);
    expect(h.ordem).toEqual(["suporte", "papel"]);
    h.ordem = [];
    await PATCH(req("PATCH", { plan_id: PLANO, nome: "x" }), ctx);
    expect(h.ordem).toEqual(["suporte", "papel"]);
  });

  it("AC-009.4: suporte somente leitura e papel insuficiente barram sem efeito nem auditoria", async () => {
    h.suporte = new Response(JSON.stringify({ error: { code: "support_readonly" } }), { status: 403 });
    expect((await POST(req("POST", CORPO), ctx)).status).toBe(403);
    expect((await PATCH(req("PATCH", { plan_id: PLANO, nome: "x" }), ctx)).status).toBe(403);
    h.suporte = null;
    h.escrita = false;
    expect((await POST(req("POST", CORPO), ctx)).status).toBe(403);
    expect(h.repo.criar).not.toHaveBeenCalled();
    expect(h.repo.editar).not.toHaveBeenCalled();
    expect(h.audit).not.toHaveBeenCalled();
  });

  it("AC-009.4: quem não é administrador da plataforma não lê a lista", async () => {
    h.admin = false;
    expect((await GET(req("GET"), ctx)).status).toBe(403);
  });

  it.each([
    ["preço abaixo de R$ 5", { ...CORPO, preco_cents: 499 }],
    ["intervalo fora do vocabulário", { ...CORPO, intervalo: "semana" }],
    ["teste grátis acima de 90 dias", { ...CORPO, trial_dias: 91 }],
    ["nome em branco", { ...CORPO, nome: " " }],
    ["brand_id no corpo", { ...CORPO, brand_id: OUTRA }],
  ])("AC-009.4: %s → 400 pelo Zod, nada gravado", async (_nome, corpo) => {
    expect((await POST(req("POST", corpo), ctx)).status).toBe(400);
    expect(h.repo.criar).not.toHaveBeenCalled();
    expect(h.audit).not.toHaveBeenCalled();
  });

  it("AC-009.4: PATCH sem plan_id, com plan_id inválido ou sem nada a mudar → 400", async () => {
    expect((await PATCH(req("PATCH", { nome: "x" }), ctx)).status).toBe(400);
    expect((await PATCH(req("PATCH", { plan_id: "x", nome: "x" }), ctx)).status).toBe(400);
    expect((await PATCH(req("PATCH", { plan_id: PLANO }), ctx)).status).toBe(400);
    expect(h.repo.editar).not.toHaveBeenCalled();
  });

  it("AC-009.1: segundo plano do cadastro e plano com assinantes viram 409 com código canônico", async () => {
    h.repo.criar.mockRejectedValueOnce(new ErroDeMarca("state_conflict", "Esta marca já tem um plano do cadastro.", 409));
    const a = await POST(req("POST", CORPO), ctx);
    expect(a.status).toBe(409);
    expect((await a.json()).error.code).toBe("state_conflict");
    h.repo.editar.mockRejectedValueOnce(new ErroDeMarca("plano_com_assinantes", "Este plano tem assinantes.", 409));
    const b = await PATCH(req("PATCH", { plan_id: PLANO, preco_cents: 5000 }), ctx);
    expect((await b.json()).error.code).toBe("plano_com_assinantes");
    expect(h.audit).not.toHaveBeenCalled();
  });
});

describe("repositório dos planos cobráveis (isolamento por marca)", () => {
  const responder = (extra: (c: Cadeia) => Resposta | undefined) => (c: Cadeia): Resposta =>
    extra(c) ?? (c.tabela === "brands" ? { data: { id: MARCA, cobranca_ligada: false } } : {});

  it("AC-009.1: lista só os planos da marca pedida", async () => {
    h.banco = bancoFalso(responder(() => undefined));
    await listarPlanosCobraveis(MARCA);
    const c = h.banco.cadeias.find((x) => x.tabela === "cobranca_planos")!;
    expect(filtros(c)).toContainEqual(["eq", "brand_id", MARCA]);
  });

  it("AC-009.1: criar grava o brand_id do path, mesmo que o chamador mande outro, e quem criou", async () => {
    h.banco = bancoFalso(responder((c) => (c.tabela === "cobranca_planos" ? { data: { id: PLANO } } : undefined)));
    await criarPlanoCobravel(MARCA, { ...CORPO, brand_id: OUTRA }, "u-admin");
    const ins = h.banco.cadeias.find((x) => x.tabela === "cobranca_planos" && operacao(x) === "insert")!;
    expect(argumentos(ins, "insert")?.[0]).toMatchObject({ brand_id: MARCA, updated_by: "u-admin", nome: "Mensal" });
  });

  it("AC-009.1: editar plano de outra marca (ou da instalação) é 'não encontrado' e nada é gravado", async () => {
    h.banco = bancoFalso(responder((c) => (c.tabela === "cobranca_planos" ? { data: null } : undefined)));
    await expect(editarPlanoCobravel(MARCA, PLANO, { nome: "x" }, "u-admin")).rejects.toMatchObject({ code: "not_found", status: 404 });
    const leitura = h.banco.cadeias.find((x) => x.tabela === "cobranca_planos")!;
    expect(filtros(leitura)).toEqual(expect.arrayContaining([["eq", "id", PLANO], ["eq", "brand_id", MARCA]]));
    expect(h.banco.cadeias.some((x) => operacao(x) === "update")).toBe(false);
  });

  it("AC-009.1: mudar preço de plano com assinantes é recusado", async () => {
    h.banco = bancoFalso((c) => {
      if (c.tabela === "cobranca_planos") return { data: { id: PLANO, preco_cents: 9900, intervalo: "mes", arquivado_em: null } };
      if (c.tabela === "cobranca_assinaturas") return { count: 2 };
      return {};
    });
    await expect(editarPlanoCobravel(MARCA, PLANO, { preco_cents: 5000 }, "u-admin")).rejects.toMatchObject({ code: "plano_com_assinantes" });
    expect(h.banco.cadeias.some((x) => operacao(x) === "update")).toBe(false);
  });

  it("AC-009.1: editar o nome atualiza com o filtro da marca", async () => {
    h.banco = bancoFalso((c) => {
      if (c.tabela === "cobranca_planos") return { data: { id: PLANO, preco_cents: 9900, intervalo: "mes", arquivado_em: null } };
      return {};
    });
    await editarPlanoCobravel(MARCA, PLANO, { nome: "Novo" }, "u-admin");
    const up = h.banco.cadeias.find((x) => operacao(x) === "update")!;
    expect(filtros(up)).toEqual(expect.arrayContaining([["eq", "id", PLANO], ["eq", "brand_id", MARCA]]));
    expect(argumentos(up, "update")?.[0]).toMatchObject({ nome: "Novo", updated_by: "u-admin" });
  });
});
