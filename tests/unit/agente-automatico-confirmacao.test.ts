/**
 * Confirmação do modo automático — mudança 006, REQ-003 (AC-003.4, AC-003.5, AC-003.6).
 *
 * Trocar o agente para "responder sozinho" é a decisão que custa dinheiro e fala com o cliente
 * sem uma pessoa no meio. A regra mora no SERVIDOR: a tela abre um diálogo, mas quem exige o
 * `confirmar_automatico: true` é a rota (e o PATCH, que não pode ser o atalho).
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

import { audit } from "@/lib/audit";
import { requireRole } from "@/lib/auth/require-role";
import { requireSupportWrite } from "@/lib/impersonate/support";
import { createAdminClient } from "@/lib/supabase/admin";

vi.mock("@/lib/auth/require-role", () => ({ requireRole: vi.fn() }));
vi.mock("@/lib/supabase/server", () => ({ createClient: vi.fn() }));
vi.mock("@/lib/supabase/admin", () => ({ createAdminClient: vi.fn() }));
vi.mock("@/lib/audit", () => ({ audit: vi.fn(async () => undefined) }));
vi.mock("@/lib/impersonate/support", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/impersonate/support")>()),
  requireSupportWrite: vi.fn(async () => null),
}));

const ORG = "22222222-2222-4222-8222-222222222222";
const OUTRA_ORG = "99999999-9999-4999-8999-999999999999";
const AGENTE = "55555555-5555-4555-8555-555555555555";
const USUARIO = "11111111-1111-4111-8111-111111111111";

let gravado: Record<string, unknown> | null;
let filtros: Array<[string, unknown]>;
let linhaAtual: Record<string, unknown> | null;

function linha(modo: "assisted" | "automatic") {
  return {
    id: AGENTE,
    organization_id: ORG,
    name: "Tobias",
    description: null,
    model: "anthropic/claude-sonnet-4-6",
    system_prompt: "Você é o Tobias, atendente da loja.",
    is_active: true,
    is_default: true,
    kind: "rag_bot",
    priority: 0,
    published_version_id: null,
    paused_at: null,
    operation_mode: modo,
    operation_revision: 1,
    archived_at: null,
    config: {},
    guardrails: [],
    active_kb_version_id: null,
    created_at: "2026-08-01T10:00:00Z",
    updated_at: "2026-08-01T10:00:00Z",
  };
}

function admin() {
  const q = (op: "select" | "update", patch?: Record<string, unknown>) => {
    const enc = {
      select: () => enc,
      eq: (col: string, val: unknown) => {
        filtros.push([col, val]);
        return enc;
      },
      is: () => enc,
      maybeSingle: async () => ({ data: linhaAtual, error: null }),
      single: async () => {
        if (op === "update") gravado = patch ?? {};
        return { data: { ...linhaAtual, ...patch }, error: null };
      },
    };
    return enc;
  };
  return {
    from: () => ({
      select: () => q("select"),
      update: (p: Record<string, unknown>) => q("update", p),
    }),
  };
}

function comoPapel(role: "admin" | "manager" | "agent" | "viewer") {
  vi.mocked(requireRole).mockImplementation((async (min: string) => {
    const rank = { viewer: 1, agent: 2, manager: 3, admin: 4 } as const;
    if (rank[role] < rank[min as keyof typeof rank]) {
      return {
        ok: false,
        response: new Response(JSON.stringify({ error: { code: "forbidden_role", message: "x" } }), {
          status: 403,
        }),
      };
    }
    return { ok: true, user: { id: USUARIO }, org: { orgId: ORG, name: "Org", role } };
  }) as never);
}

async function post(corpo: unknown) {
  const { POST } = await import("@/app/api/v1/ai/agents/[id]/automatico/route");
  const res = await POST(
    new NextRequest(`http://localhost/api/v1/ai/agents/${AGENTE}/automatico`, {
      method: "POST",
      body: typeof corpo === "string" ? corpo : JSON.stringify(corpo),
      headers: { "content-type": "application/json" },
    }),
    { params: Promise.resolve({ id: AGENTE }) } as never,
  );
  return { status: res.status, corpo: (await res.json()) as RespostaDaApi, res };
}

/** Só o que estes testes leem da resposta; os campos não se aplicam a todo caso. */
type RespostaDaApi = { error: { code: string }; data: { operation_mode: string } };

async function patch(corpo: Record<string, unknown>) {
  const { PATCH } = await import("@/app/api/v1/ai/agents/[id]/route");
  const res = await PATCH(
    new NextRequest(`http://localhost/api/v1/ai/agents/${AGENTE}`, {
      method: "PATCH",
      body: JSON.stringify(corpo),
      headers: { "content-type": "application/json" },
    }),
    { params: Promise.resolve({ id: AGENTE }) } as never,
  );
  return { status: res.status, corpo: (await res.json()) as RespostaDaApi };
}

beforeEach(() => {
  vi.clearAllMocks();
  gravado = null;
  filtros = [];
  linhaAtual = linha("assisted");
  comoPapel("admin");
  vi.mocked(createAdminClient).mockReturnValue(admin() as never);
});

describe("AC-003.4: o automático só vale com a confirmação no corpo", () => {
  it("AC-003.4: sem confirmar_automatico a rota recusa com ai_confirmacao_exigida e nada é gravado", async () => {
    const r = await post({});
    expect(r.status).toBe(422);
    expect(r.corpo.error.code).toBe("ai_confirmacao_exigida");
    expect(gravado).toBeNull();
    expect(audit).not.toHaveBeenCalled();
  });

  it("AC-003.4: confirmar_automatico:false também recusa", async () => {
    const r = await post({ confirmar_automatico: false });
    expect(r.status).toBe(422);
    expect(r.corpo.error.code).toBe("ai_confirmacao_exigida");
    expect(gravado).toBeNull();
  });

  it("AC-003.4: corpo que não é JSON é 400", async () => {
    const r = await post("isto não é json");
    expect(r.status).toBe(400);
    expect(gravado).toBeNull();
  });

  it("AC-003.4: com a confirmação o agente vai para automatic, filtrado pela organização da SESSÃO", async () => {
    const r = await post({ confirmar_automatico: true, organization_id: OUTRA_ORG });
    expect(r.status).toBe(200);
    expect(r.corpo.data.operation_mode).toBe("automatic");
    expect(gravado).toEqual({ operation_mode: "automatic" });
    expect(filtros).toContainEqual(["organization_id", ORG]);
    expect(filtros).not.toContainEqual(["organization_id", OUTRA_ORG]);
    expect(r.res.headers.get("x-request-id")).toBeTruthy();
  });

  it("AC-003.4: agente de outra organização (ou inexistente) é 404 e nada é gravado", async () => {
    linhaAtual = null;
    const r = await post({ confirmar_automatico: true });
    expect(r.status).toBe(404);
    expect(gravado).toBeNull();
    expect(audit).not.toHaveBeenCalled();
  });

  it("AC-003.4: id que não é UUID é recusado antes de qualquer consulta", async () => {
    const { POST } = await import("@/app/api/v1/ai/agents/[id]/automatico/route");
    const res = await POST(
      new NextRequest("http://localhost/api/v1/ai/agents/x/automatico", {
        method: "POST",
        body: JSON.stringify({ confirmar_automatico: true }),
      }),
      { params: Promise.resolve({ id: "x" }) } as never,
    );
    expect(res.status).toBe(400);
    expect(createAdminClient).not.toHaveBeenCalled();
  });

  it("AC-003.4: o PATCH não é atalho — assisted para automatic sem a confirmação é recusado", async () => {
    const r = await patch({ operation_mode: "automatic" });
    expect(r.status).toBe(422);
    expect(r.corpo.error.code).toBe("ai_confirmacao_exigida");
    expect(gravado).toBeNull();
  });

  it("AC-003.4: o PATCH com confirmar_automatico:true aceita a troca e audita a confirmação", async () => {
    const r = await patch({ operation_mode: "automatic", confirmar_automatico: true });
    expect(r.status).toBe(200);
    expect(gravado).toEqual({ operation_mode: "automatic" });
    expect(vi.mocked(audit).mock.calls.map((c) => c[0].action)).toContain("ai_agent.automatic_confirmed");
  });

  it("AC-003.4: voltar para assistido e reenviar o modo que já vale não pedem confirmação", async () => {
    linhaAtual = linha("automatic");
    expect((await patch({ operation_mode: "assisted" })).status).toBe(200);
    expect(gravado).toEqual({ operation_mode: "assisted" });
    gravado = null;
    expect((await patch({ operation_mode: "automatic" })).status).toBe(200);
  });
});

describe("AC-003.5: a confirmação deixa rastro com quem, quando e qual agente", () => {
  it("AC-003.5: audita ai_agent.automatic_confirmed com o usuário, o agente, a organização e o X-Request-Id", async () => {
    const r = await post({ confirmar_automatico: true });
    expect(r.status).toBe(200);
    expect(audit).toHaveBeenCalledTimes(1);
    const e = vi.mocked(audit).mock.calls[0]![0];
    expect(e).toMatchObject({
      action: "ai_agent.automatic_confirmed",
      actorUserId: USUARIO,
      organizationId: ORG,
      resourceType: "ai_agent",
      resourceId: AGENTE,
    });
    expect(e.requestId).toBe(r.res.headers.get("x-request-id"));
    // "Quando": o registro do audit carrega o instante; a hora que a pessoa confirmou
    // também vai nos metadados para quem lê a linha sozinha.
    expect(Date.parse(String((e.metadata as Record<string, unknown>).confirmed_at))).not.toBeNaN();
    expect((e.metadata as Record<string, unknown>).previous_mode).toBe("assisted");
  });

  it("AC-003.5: confirmar de novo um agente que já é automático não grava nem audita outra vez", async () => {
    linhaAtual = linha("automatic");
    const r = await post({ confirmar_automatico: true });
    expect(r.status).toBe(200);
    expect(gravado).toBeNull();
    expect(audit).not.toHaveBeenCalled();
  });

  it("AC-003.5: a confirmação recusada não deixa rastro de confirmação", async () => {
    await post({});
    expect(audit).not.toHaveBeenCalled();
  });
});

describe("AC-003.6: só o administrador troca o modo", () => {
  it.each(["viewer", "agent", "manager"] as const)("AC-003.6: %s recebe 403 e nada é gravado", async (papel) => {
    comoPapel(papel);
    const r = await post({ confirmar_automatico: true });
    expect(r.status).toBe(403);
    expect(gravado).toBeNull();
    expect(audit).not.toHaveBeenCalled();
  });

  it("AC-003.6: a rota pede o papel admin ao helper existente", async () => {
    await post({ confirmar_automatico: true });
    expect(vi.mocked(requireRole).mock.calls[0]![0]).toBe("admin");
  });

  it("AC-003.6: a guarda de suporte roda ANTES de qualquer efeito (e do papel)", async () => {
    vi.mocked(requireSupportWrite).mockResolvedValueOnce(
      new Response(JSON.stringify({ error: { code: "support_read_only" } }), { status: 403 }) as never,
    );
    const r = await post({ confirmar_automatico: true });
    expect(r.status).toBe(403);
    expect(requireRole).not.toHaveBeenCalled();
    expect(gravado).toBeNull();
  });

  it("AC-003.6: o PATCH que troca o modo segue exigindo admin", async () => {
    comoPapel("manager");
    const r = await patch({ operation_mode: "automatic", confirmar_automatico: true });
    expect(r.status).toBe(403);
    expect(gravado).toBeNull();
  });
});
