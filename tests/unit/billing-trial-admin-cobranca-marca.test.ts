/**
 * Mudança 003, Fatia 3 (T-009): liga/desliga da cobrança da marca.
 * AC-001.3 recusa sem plano com preço ou sem provedor; AC-001.4 desligar não
 * apaga assinatura; AC-001.5 auditoria; AC-009.4 papel + requireSupportWrite(
 * antes do efeito.
 */
import { NextRequest } from "next/server";
import type * as RepoReal from "@/lib/brands/cobranca-repo";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { argumentos, bancoFalso, operacao, type BancoFalso } from "@/tests/helpers/banco-falso-da-cobranca";

const h = vi.hoisted(() => ({
  admin: true,
  escrita: true,
  suporte: null as Response | null,
  audit: vi.fn(),
  situacao: vi.fn(),
  definir: vi.fn(),
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
  situacaoDaCobranca: h.situacao,
  definirCobranca: h.definir,
}));

// Só para o teste do repositório (AC-001.4): banco falso e cache de marca mudo.
vi.mock("@/lib/supabase/admin", () => ({ createAdminClient: () => h.banco.cliente }));
vi.mock("@/lib/branding/marca-do-host", () => ({ invalidarMarcaDoHost: vi.fn() }));

import { GET, PATCH } from "@/app/api/v1/admin/brands/[id]/cobranca/route";
import { faltasParaLigar } from "@/lib/brands/cobranca-repo";

const { definirCobranca: definirDeVerdade } = await vi.importActual<typeof RepoReal>(
  "@/lib/brands/cobranca-repo",
);

const ID = "11111111-1111-4111-8111-111111111111";
const ctx = { params: Promise.resolve({ id: ID }) };
const req = (metodo: string, corpo?: unknown) =>
  new NextRequest(`http://localhost/api/v1/admin/brands/${ID}/cobranca`, {
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
  h.situacao.mockResolvedValue({ cobranca_ligada: false, faltam: [] });
  h.definir.mockResolvedValue({ anterior: false });
});

const PRONTA = {
  moduloLigado: true,
  planos: [{ preco_cents: 4990, padrao_no_cadastro: true }],
  provedor: "asaas",
  temChave: true,
  provedorFazTrialComCartao: true,
};

describe("AC-001.3: a regra do que falta para ligar", () => {
  it("AC-001.3: tudo no lugar não falta nada", () => {
    expect(faltasParaLigar(PRONTA)).toEqual([]);
  });
  it("AC-001.3: sem nenhum plano com preço falta o plano", () => {
    expect(faltasParaLigar({ ...PRONTA, planos: [] })).toContain("plano");
    expect(faltasParaLigar({ ...PRONTA, planos: [{ preco_cents: 0, padrao_no_cadastro: true }] })).toContain("plano");
  });
  it("AC-001.3: plano com preço mas nenhum do cadastro falta o plano do cadastro", () => {
    expect(faltasParaLigar({ ...PRONTA, planos: [{ preco_cents: 4990, padrao_no_cadastro: false }] })).toEqual(["plano_padrao"]);
  });
  it("AC-001.3: sem provedor, sem chave ou com provedor que não faz teste com cartão", () => {
    expect(faltasParaLigar({ ...PRONTA, provedor: null, temChave: false })).toEqual(["provedor"]);
    expect(faltasParaLigar({ ...PRONTA, temChave: false })).toEqual(["chave"]);
    expect(faltasParaLigar({ ...PRONTA, provedorFazTrialComCartao: false })).toEqual(["provedor_sem_trial"]);
  });
});

describe("PATCH /api/v1/admin/brands/[id]/cobranca", () => {
  it("AC-001.3: ligar sem plano com preço é recusado com cobranca_marca_sem_plano e nada é gravado", async () => {
    h.situacao.mockResolvedValue({ cobranca_ligada: false, faltam: ["plano"] });
    const res = await PATCH(req("PATCH", { cobranca_ligada: true }), ctx);
    expect(res.status).toBe(422);
    const corpo = await res.json();
    expect(corpo.error.code).toBe("cobranca_marca_sem_plano");
    expect(corpo.error.message).toContain("cadastre ao menos um plano");
    expect(corpo.error.details.faltam).toEqual(["plano"]);
    expect(h.definir).not.toHaveBeenCalled();
    expect(h.audit).not.toHaveBeenCalled();
  });

  it("AC-001.3: ligar sem provedor configurado é recusado dizendo o que falta", async () => {
    h.situacao.mockResolvedValue({ cobranca_ligada: false, faltam: ["provedor"] });
    const res = await PATCH(req("PATCH", { cobranca_ligada: true }), ctx);
    expect(res.status).toBe(422);
    const corpo = await res.json();
    expect(corpo.error.code).toBe("cobranca_provedor_indisponivel");
    expect(corpo.error.details.faltam).toEqual(["provedor"]);
    expect(h.definir).not.toHaveBeenCalled();
  });

  it("AC-001.3: com plano e provedor, liga e devolve a situação nova", async () => {
    h.definir.mockResolvedValue({ anterior: false });
    const res = await PATCH(req("PATCH", { cobranca_ligada: true }), ctx);
    expect(res.status).toBe(200);
    expect(h.definir).toHaveBeenCalledWith(ID, true);
    expect((await res.json()).data).toEqual({ cobranca_ligada: true, faltam: [] });
  });

  it("AC-001.4: desligar não confere plano nem provedor e grava", async () => {
    h.situacao.mockResolvedValue({ cobranca_ligada: true, faltam: ["plano", "chave"] });
    h.definir.mockResolvedValue({ anterior: true });
    const res = await PATCH(req("PATCH", { cobranca_ligada: false }), ctx);
    expect(res.status).toBe(200);
    expect(h.definir).toHaveBeenCalledWith(ID, false);
    expect((await res.json()).data.cobranca_ligada).toBe(false);
  });

  it("AC-001.5: ligar audita brand.cobranca_changed com quem, a marca e o valor novo", async () => {
    await PATCH(req("PATCH", { cobranca_ligada: true }), ctx);
    expect(h.audit).toHaveBeenCalledTimes(1);
    expect(h.audit).toHaveBeenCalledWith(
      expect.objectContaining({
        action: "brand.cobranca_changed",
        actorUserId: "u-admin",
        resourceType: "brand",
        resourceId: ID,
        metadata: { brand_id: ID, de: false, para: true },
      }),
    );
  });

  it("AC-001.5: desligar também audita", async () => {
    h.definir.mockResolvedValue({ anterior: true });
    await PATCH(req("PATCH", { cobranca_ligada: false }), ctx);
    expect(h.audit).toHaveBeenCalledWith(
      expect.objectContaining({ action: "brand.cobranca_changed", metadata: { brand_id: ID, de: true, para: false } }),
    );
  });

  it("AC-001.5: repetir o mesmo valor não muda nada e não gera entrada de auditoria", async () => {
    h.definir.mockResolvedValue({ anterior: true });
    const res = await PATCH(req("PATCH", { cobranca_ligada: true }), ctx);
    expect(res.status).toBe(200);
    expect(h.audit).not.toHaveBeenCalled();
  });

  it("AC-009.4: requireSupportWrite roda antes do papel e do efeito", async () => {
    await PATCH(req("PATCH", { cobranca_ligada: true }), ctx);
    expect(h.ordem).toEqual(["suporte", "papel"]);
  });

  it("AC-009.4: suporte somente leitura barra antes de qualquer efeito", async () => {
    h.suporte = new Response(JSON.stringify({ error: { code: "support_readonly" } }), { status: 403 });
    const res = await PATCH(req("PATCH", { cobranca_ligada: true }), ctx);
    expect(res.status).toBe(403);
    expect(h.situacao).not.toHaveBeenCalled();
    expect(h.definir).not.toHaveBeenCalled();
    expect(h.audit).not.toHaveBeenCalled();
  });

  it("AC-009.4: quem não é administrador pleno da plataforma recebe 403 e nada é gravado", async () => {
    h.escrita = false;
    const res = await PATCH(req("PATCH", { cobranca_ligada: true }), ctx);
    expect(res.status).toBe(403);
    expect(h.definir).not.toHaveBeenCalled();
    expect(h.audit).not.toHaveBeenCalled();
  });

  it.each([
    ["corpo vazio", {}],
    ["valor que não é booleano", { cobranca_ligada: "sim" }],
    ["campo a mais (brand_id no corpo)", { cobranca_ligada: true, brand_id: ID }],
  ])("AC-009.4: %s → 400 pelo Zod", async (_nome, corpo) => {
    const res = await PATCH(req("PATCH", corpo), ctx);
    expect(res.status).toBe(400);
    expect(h.definir).not.toHaveBeenCalled();
  });

  it("AC-009.4: marca com id que não é uuid → 400", async () => {
    const res = await PATCH(req("PATCH", { cobranca_ligada: true }), { params: Promise.resolve({ id: "x" }) });
    expect(res.status).toBe(400);
  });
});

describe("GET /api/v1/admin/brands/[id]/cobranca", () => {
  it("AC-001.3: devolve a chave e o que falta para a tela explicar", async () => {
    h.situacao.mockResolvedValue({ cobranca_ligada: false, faltam: ["plano"] });
    const res = await GET(req("GET"), ctx);
    expect(res.status).toBe(200);
    expect((await res.json()).data).toEqual({ cobranca_ligada: false, faltam: ["plano"] });
  });

  it("AC-009.4: só administrador da plataforma lê", async () => {
    h.admin = false;
    expect((await GET(req("GET"), ctx)).status).toBe(403);
  });
});

describe("AC-001.4: o repositório ao desligar", () => {
  it("AC-001.4: desligar só atualiza brands; nenhuma assinatura é lida, apagada ou alterada", async () => {
    h.banco = bancoFalso((c) => (c.tabela === "brands" ? { data: { id: ID, cobranca_ligada: true } } : {}));
    const r = await definirDeVerdade(ID, false);
    expect(r.anterior).toBe(true);
    expect(h.banco.cadeias.some((c) => c.tabela === "cobranca_assinaturas")).toBe(false);
    const escritas = h.banco.cadeias.filter((c) => operacao(c) !== "select");
    expect(escritas.map((c) => c.tabela)).toEqual(["brands"]);
    expect(operacao(escritas[0]!)).toBe("update");
    expect(argumentos(escritas[0]!, "update")?.[0]).toMatchObject({ cobranca_ligada: false });
  });
});
