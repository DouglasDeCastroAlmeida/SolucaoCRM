/**
 * T-033: POST /api/v1/mcp-acoes/[id] — aprovar ou recusar uma ação de escrita de servidor
 * MCP externo (mudança 006, AC-007.3). O corpo só traz a decisão: os argumentos executados são
 * os GUARDADOS na ação.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

import { audit } from "@/lib/audit";
import { requireRole } from "@/lib/auth/require-role";
import { requireSupportWrite } from "@/lib/impersonate/support";
import { decidirAcaoPendente } from "@/lib/mcp/servidor-externo/aprovacao";

vi.mock("@/lib/auth/require-role", () => ({ requireRole: vi.fn() }));
vi.mock("@/lib/supabase/server", () => ({ createClient: vi.fn() }));
vi.mock("@/lib/supabase/admin", () => ({ createAdminClient: vi.fn(() => ({ marca: "admin" })) }));
vi.mock("@/lib/audit", () => ({ audit: vi.fn(async () => undefined) }));
vi.mock("@/lib/impersonate/support", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/impersonate/support")>()),
  requireSupportWrite: vi.fn(async () => null),
}));
vi.mock("@/lib/mcp/servidor-externo/aprovacao", () => ({ decidirAcaoPendente: vi.fn() }));

const ORG = "22222222-2222-4222-8222-222222222222";
const ACAO = "77777777-7777-4777-8777-777777777777";
const USUARIO = "11111111-1111-4111-8111-111111111111";

function comPapel(role: "admin" | "manager" | "agent" | "viewer") {
  vi.mocked(requireRole).mockImplementation((async (min: string) => {
    const rank = { viewer: 1, agent: 2, manager: 3, admin: 4 } as const;
    if (rank[role] < rank[min as keyof typeof rank]) {
      return {
        ok: false,
        response: new Response(JSON.stringify({ error: { code: "forbidden_role", message: "x" } }), { status: 403 }),
      };
    }
    return { ok: true, user: { id: USUARIO, idioma: "pt-BR" }, org: { orgId: ORG, name: "Org", role } };
  }) as never);
}

/** Só o que estes testes leem da resposta. */
type RespostaDaApi = { data: { estado: string; mensagem?: string }; error: { code: string } };

async function post(corpo: unknown, id: string = ACAO) {
  const { POST } = await import("@/app/api/v1/mcp-acoes/[id]/route");
  const res = await POST(
    new NextRequest(`http://localhost/api/v1/mcp-acoes/${id}`, {
      method: "POST",
      body: typeof corpo === "string" ? corpo : JSON.stringify(corpo),
      headers: { "content-type": "application/json" },
    }),
    { params: Promise.resolve({ id }) } as never,
  );
  return { status: res.status, corpo: (await res.json()) as RespostaDaApi, res };
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(requireSupportWrite).mockResolvedValue(null);
  comPapel("manager");
});

describe("AC-007.3: a rota de aprovação", () => {
  it("aprovar executa pela organização da SESSÃO, audita quem aprovou e devolve o X-Request-Id", async () => {
    vi.mocked(decidirAcaoPendente).mockResolvedValueOnce({
      tipo: "executada",
      servidor: "loja",
      ferramenta: "cancelar_pedido",
      resumo: { servidor: "loja", ferramenta: "cancelar_pedido", argumentos: { pedido_id: "P-1" }, resultado: "ok" },
    });

    const r = await post({ decisao: "aprovar" });

    expect(r.status).toBe(200);
    expect(r.corpo.data).toMatchObject({ estado: "executada" });
    expect(r.res.headers.get("X-Request-Id")).toBeTruthy();
    expect(vi.mocked(decidirAcaoPendente).mock.calls[0]![1]).toBe(ORG);
    expect(vi.mocked(decidirAcaoPendente).mock.calls[0]![2]).toEqual({
      acaoId: ACAO,
      decisao: "aprovar",
      usuarioId: USUARIO,
    });
    expect(vi.mocked(audit)).toHaveBeenCalledWith(
      expect.objectContaining({
        action: "mcp.action_approved",
        actorUserId: USUARIO,
        organizationId: ORG,
        resourceId: ACAO,
        metadata: expect.objectContaining({ servidor: "loja", ferramenta: "cancelar_pedido", resultado: "ok" }),
      }),
    );
  });

  it("recusar audita mcp.action_rejected", async () => {
    vi.mocked(decidirAcaoPendente).mockResolvedValueOnce({ tipo: "recusada", servidor: "loja", ferramenta: "cancelar_pedido" });

    const r = await post({ decisao: "recusar" });

    expect(r.status).toBe(200);
    expect(r.corpo.data).toMatchObject({ estado: "recusada" });
    expect(vi.mocked(audit)).toHaveBeenCalledWith(
      expect.objectContaining({ action: "mcp.action_rejected", actorUserId: USUARIO, organizationId: ORG }),
    );
  });

  it("aprovada mas o sistema externo falhou: 200 com o estado e o motivo, e audita a falha", async () => {
    vi.mocked(decidirAcaoPendente).mockResolvedValueOnce({
      tipo: "falhou",
      servidor: "loja",
      ferramenta: "cancelar_pedido",
      motivo: "O sistema externo não concluiu a ação: x",
    });

    const r = await post({ decisao: "aprovar" });

    expect(r.status).toBe(200);
    expect(r.corpo.data).toMatchObject({ estado: "falhou", mensagem: "O sistema externo não concluiu a ação: x" });
    expect(vi.mocked(audit)).toHaveBeenCalledWith(
      expect.objectContaining({ action: "mcp.action_approved", metadata: expect.objectContaining({ sucesso: false }) }),
    );
  });

  it("papel abaixo de gerente: 403 e nada acontece", async () => {
    comPapel("agent");
    const r = await post({ decisao: "aprovar" });
    expect(r.status).toBe(403);
    expect(decidirAcaoPendente).not.toHaveBeenCalled();
    expect(audit).not.toHaveBeenCalled();
  });

  it("modo suporte sem escrita: barra antes do efeito", async () => {
    vi.mocked(requireSupportWrite).mockResolvedValueOnce(
      new Response(JSON.stringify({ error: { code: "support_read_only", message: "x" } }), { status: 403 }) as never,
    );
    const r = await post({ decisao: "aprovar" });
    expect(r.status).toBe(403);
    expect(decidirAcaoPendente).not.toHaveBeenCalled();
  });

  it("corpo com argumentos (ou qualquer campo a mais) é recusado: o que roda é o guardado", async () => {
    const r = await post({ decisao: "aprovar", argumentos: { pedido_id: "OUTRO" } });
    expect(r.status).toBe(400);
    expect(decidirAcaoPendente).not.toHaveBeenCalled();
  });

  it.each([["{}"], [{ decisao: "talvez" }], ["não é json"]])("corpo inválido %j: 400", async (corpo) => {
    const r = await post(corpo);
    expect(r.status).toBe(400);
    expect(decidirAcaoPendente).not.toHaveBeenCalled();
  });

  it("id que não é uuid: 400", async () => {
    const r = await post({ decisao: "aprovar" }, "abc");
    expect(r.status).toBe(400);
    expect(decidirAcaoPendente).not.toHaveBeenCalled();
  });

  it("ação inexistente ou de outra organização: o mesmo 404", async () => {
    vi.mocked(decidirAcaoPendente).mockResolvedValueOnce({ tipo: "nao_encontrada" });
    const r = await post({ decisao: "aprovar" });
    expect(r.status).toBe(404);
    expect(r.corpo.error.code).toBe("not_found");
    expect(audit).not.toHaveBeenCalled();
  });

  it("ação já decidida: 409 e nada é auditado de novo", async () => {
    vi.mocked(decidirAcaoPendente).mockResolvedValueOnce({ tipo: "ja_decidida", estado: "executada" });
    const r = await post({ decisao: "aprovar" });
    expect(r.status).toBe(409);
    expect(r.corpo.error.code).toBe("state_conflict");
    expect(audit).not.toHaveBeenCalled();
  });
});
