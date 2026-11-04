import { NextRequest, NextResponse } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const h = vi.hoisted(() => ({
  role: vi.fn(),
  support: vi.fn(),
  audit: vi.fn(),
  remover: vi.fn(),
}));

vi.mock("@/lib/auth/require-role", () => ({ requireRole: h.role }));
vi.mock("@/lib/impersonate/support", () => ({ requireSupportWrite: h.support }));
vi.mock("@/lib/supabase/admin", () => ({ createAdminClient: () => ({}) }));
vi.mock("@/lib/audit", () => ({ audit: h.audit }));
vi.mock("@/lib/channels/email/remocao", () => ({ removerCaixa: h.remover }));

import { DELETE } from "@/app/api/v1/channels/email/[id]/route";

const ORG = "org-confiavel";
const ID = "9c1b7a52-3d4e-4f60-8a71-0b2c3d4e5f60";
const contexto = (id = ID) => ({ params: Promise.resolve({ id }) });
const req = () => new NextRequest(`https://crm.test/api/v1/channels/email/${ID}`, { method: "DELETE" });

beforeEach(() => {
  vi.clearAllMocks();
  h.role.mockResolvedValue({ ok: true, org: { orgId: ORG }, user: { id: "admin-1", idioma: "pt-BR" } });
  h.support.mockResolvedValue(null);
  h.remover.mockResolvedValue({ resultado: "removida", endereco: "atendimento@exemplo.com" });
});

describe("AC-008.2: remover a caixa de e-mail", () => {
  it("AC-008.2: remove com a organizacao do login e audita 1 vez, sem senha nem conteudo", async () => {
    const r = await DELETE(req(), contexto());
    expect(r.status).toBe(200);
    expect(h.remover).toHaveBeenCalledWith(expect.anything(), ORG, ID);
    expect(h.audit).toHaveBeenCalledTimes(1);
    expect(h.audit.mock.calls[0]![0]).toMatchObject({
      action: "channel.email_removed",
      organizationId: ORG,
      actorUserId: "admin-1",
      resourceType: "channel_session",
      resourceId: ID,
    });
    expect(JSON.stringify(h.audit.mock.calls[0]![0])).not.toMatch(/senha/i);
  });

  it("AC-007.5: a guarda de suporte vem antes de qualquer efeito", async () => {
    h.support.mockResolvedValue(NextResponse.json({ error: { code: "support_readonly" } }, { status: 403 }));
    const r = await DELETE(req(), contexto());
    expect(r.status).toBe(403);
    expect(h.remover).not.toHaveBeenCalled();
    expect(h.audit).not.toHaveBeenCalled();
  });

  it("AC-007.5: so admin remove (papel menor e recusado sem efeito)", async () => {
    h.role.mockResolvedValue({ ok: false, response: NextResponse.json({ error: { code: "forbidden_role" } }, { status: 403 }) });
    const r = await DELETE(req(), contexto());
    expect(r.status).toBe(403);
    expect(h.role).toHaveBeenCalledWith("admin", expect.anything());
    expect(h.remover).not.toHaveBeenCalled();
  });

  it("AC-007.4: caixa de outra organizacao, inexistente ou id invalido responde 404 sem auditar", async () => {
    h.remover.mockResolvedValue({ resultado: "nao_encontrada" });
    const r = await DELETE(req(), contexto());
    expect(r.status).toBe(404);
    expect(h.audit).not.toHaveBeenCalled();
    const invalido = await DELETE(req(), contexto("nao-e-uuid"));
    expect(invalido.status).toBe(404);
    expect(h.remover).toHaveBeenCalledTimes(1);
  });

  it("AC-008.2: falha ao remover responde erro e nao audita", async () => {
    h.remover.mockRejectedValue(new Error("email_caixa_remocao_failed: arquivar"));
    const r = await DELETE(req(), contexto());
    expect(r.status).toBe(500);
    expect(h.audit).not.toHaveBeenCalled();
  });
});
