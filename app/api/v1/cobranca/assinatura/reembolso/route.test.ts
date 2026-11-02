import { beforeEach, describe, expect, it, vi } from "vitest";

import { bancoFalso, type BancoFalso } from "@/tests/helpers/banco-falso-da-cobranca";

const h = vi.hoisted(() => ({
  papel: vi.fn(),
  pedir: vi.fn(),
  audit: vi.fn(),
  taxaOk: true,
  suporte: null as Response | null,
  banco: undefined as unknown as BancoFalso,
}));
vi.mock("@/lib/auth/require-role", () => ({ requireRole: h.papel }));
vi.mock("@/lib/instalacao/modulos", () => ({ moduloLigado: async () => true }));
vi.mock("@/lib/ai/dispatcher/rate-limit", () => ({ checkRateLimit: async () => ({ allowed: h.taxaOk }) }));
vi.mock("@/lib/billing-trial/reembolso", () => ({ pedirReembolso: h.pedir }));
vi.mock("@/lib/audit", () => ({ audit: h.audit }));
vi.mock("@/lib/supabase/admin", () => ({ createAdminClient: () => h.banco.cliente }));
vi.mock("@/lib/impersonate/support", () => ({ requireSupportWrite: async () => h.suporte }));

import { POST } from "./route";

const ORG = "15151515-0000-4000-8000-000000000001";

beforeEach(() => {
  vi.clearAllMocks();
  h.taxaOk = true;
  h.suporte = null;
  h.banco = bancoFalso();
  h.papel.mockResolvedValue({ ok: true, user: { id: "admin-1" }, org: { orgId: ORG } });
  h.pedir.mockResolvedValue({ tipo: "criado", pagamentoRef: "pay_1", cancelou: true });
});

describe("POST /cobranca/assinatura/reembolso", () => {
  it("⭐ AC-006.3: pedido novo responde 201, passa a organização da SESSÃO e audita com o ator", async () => {
    const res = await POST();
    expect(res.status).toBe(201);
    expect((await res.json()).data).toEqual({ changed: true });
    expect(h.pedir).toHaveBeenCalledWith(h.banco.cliente, ORG);
    expect(h.audit).toHaveBeenCalledWith(
      expect.objectContaining({
        action: "cobranca.reembolso_pedido",
        actorUserId: "admin-1",
        organizationId: ORG,
        metadata: { pagamento_ref: "pay_1" },
      }),
    );
  });

  it("⭐ AC-006.5: segundo pedido da mesma cobrança responde 200 sem nova auditoria", async () => {
    h.pedir.mockResolvedValue({ tipo: "ja_pedido", pagamentoRef: "pay_1", cancelou: false });
    const res = await POST();
    expect(res.status).toBe(200);
    expect((await res.json()).data).toEqual({ changed: false });
    expect(h.audit).not.toHaveBeenCalled();
  });

  it("⭐ AC-006.4: fora da janela a chamada direta é recusada com o código canônico", async () => {
    h.pedir.mockResolvedValue({ tipo: "recusado", status: 422, code: "reembolso_fora_da_janela", message: "fora" });
    const res = await POST();
    expect(res.status).toBe(422);
    expect((await res.json()).error.code).toBe("reembolso_fora_da_janela");
    expect(h.audit).not.toHaveBeenCalled();
  });

  it("retry que finalmente cancelou a conta audita o cancelamento (sem repetir o pedido)", async () => {
    h.pedir.mockResolvedValue({ tipo: "ja_pedido", pagamentoRef: "pay_1", cancelou: true });
    await POST();
    expect(h.audit).toHaveBeenCalledTimes(1);
    expect(h.audit).toHaveBeenCalledWith(expect.objectContaining({ action: "cobranca.assinatura_cancelada", metadata: { motivo: "reembolso_pedido", pagamento_ref: "pay_1" } }));
  });

  it("papel abaixo de admin: a resposta do guarda, sem tocar o pedido", async () => {
    h.papel.mockResolvedValue({ ok: false, response: new Response(null, { status: 403 }) });
    expect((await POST()).status).toBe(403);
    expect(h.pedir).not.toHaveBeenCalled();
  });

  it("suporte temporário somente leitura: recusa antes de qualquer efeito", async () => {
    h.suporte = new Response(null, { status: 403 });
    expect((await POST()).status).toBe(403);
    expect(h.papel).not.toHaveBeenCalled();
    expect(h.pedir).not.toHaveBeenCalled();
  });

  it("acima de 10 por minuto da mesma empresa: 429", async () => {
    h.taxaOk = false;
    expect((await POST()).status).toBe(429);
    expect(h.pedir).not.toHaveBeenCalled();
  });
});
