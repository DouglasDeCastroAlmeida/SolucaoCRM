import { NextRequest, NextResponse } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const h = vi.hoisted(() => ({
  role: vi.fn(),
  support: vi.fn(),
  audit: vi.fn(),
  listar: vi.fn(),
  promover: vi.fn(),
  naoCliente: vi.fn(),
  rodar: vi.fn(),
  autoriza: vi.fn(),
  ligado: vi.fn(),
}));

vi.mock("@/lib/auth/require-role", () => ({ requireRole: h.role }));
vi.mock("@/lib/impersonate/support", () => ({ requireSupportWrite: h.support }));
vi.mock("@/lib/supabase/admin", () => ({ createAdminClient: () => ({}) }));
vi.mock("@/lib/audit", () => ({ audit: h.audit }));
vi.mock("@/lib/auth/cron-auth", () => ({ autorizaCron: h.autoriza }));
vi.mock("@/lib/channels/email/chave", () => ({ emailCanalLigado: h.ligado }));
vi.mock("@/lib/channels/email/ignorados", () => ({
  listarIgnorados: h.listar,
  promoverIgnorado: h.promover,
  marcarNaoCliente: h.naoCliente,
}));
vi.mock("@/lib/channels/email/rodada", () => ({ rodarRodada: h.rodar }));

import { GET as ROTA_LISTAR } from "@/app/api/v1/channels/email/ignorados/route";
import { POST as ROTA_PROMOVER } from "@/app/api/v1/channels/email/ignorados/[id]/promover/route";
import { POST as ROTA_REMETENTES } from "@/app/api/v1/channels/email/remetentes/route";
import { GET as ROTA_CRON } from "@/app/api/v1/cron/email-rodada/route";

const ORG = "org-confiavel";
const ID = "9c1b7a52-3d4e-4f60-8a71-0b2c3d4e5f60";
const CONV = "1c1b7a52-3d4e-4f60-8a71-0b2c3d4e5f60";
const req = (metodo: string, caminho: string, body?: unknown) =>
  new NextRequest(`https://crm.test/api/v1/${caminho}`, { method: metodo, body: body === undefined ? undefined : JSON.stringify(body) });
const ctx = (id = ID) => ({ params: Promise.resolve({ id }) });

beforeEach(() => {
  vi.clearAllMocks();
  h.role.mockResolvedValue({ ok: true, org: { orgId: ORG }, user: { id: "u-1", idioma: "pt-BR" } });
  h.support.mockResolvedValue(null);
  h.listar.mockResolvedValue([]);
  h.promover.mockResolvedValue({ resultado: "promovido", conversationId: CONV });
  h.naoCliente.mockResolvedValue({ resultado: "marcado", endereco: "joao@exemplo.com", conversasArquivadas: 1 });
  h.autoriza.mockReturnValue(true);
  h.ligado.mockReturnValue(true);
});

describe("AC-003.3: lista e promoção de ignorados", () => {
  it("lista com a organização do login, nunca a do corpo ou da URL", async () => {
    const r = await ROTA_LISTAR(req("GET", "channels/email/ignorados"));
    expect(r.status).toBe(200);
    expect(h.role).toHaveBeenCalledWith("admin", expect.anything());
    expect(h.listar).toHaveBeenCalledWith(expect.anything(), ORG, { caixaId: undefined });
  });

  it("recusa quem nao e admin", async () => {
    h.role.mockResolvedValue({ ok: false, response: NextResponse.json({ error: { code: "forbidden_role" } }, { status: 403 }) });
    expect((await ROTA_LISTAR(req("GET", "channels/email/ignorados"))).status).toBe(403);
    expect((await ROTA_PROMOVER(req("POST", "x"), ctx())).status).toBe(403);
    expect(h.listar).not.toHaveBeenCalled();
    expect(h.promover).not.toHaveBeenCalled();
  });

  it("AC-007.5: promover declara a guarda de suporte antes do efeito e gera 1 auditoria", async () => {
    const r = await ROTA_PROMOVER(req("POST", "x"), ctx());
    expect(r.status).toBe(200);
    expect(h.support.mock.invocationCallOrder[0]).toBeLessThan(h.promover.mock.invocationCallOrder[0]!);
    expect(h.audit).toHaveBeenCalledTimes(1);
    expect(h.audit.mock.calls[0]![0]).toMatchObject({ action: "channel.email_ignored_promoted", organizationId: ORG, resourceId: ID });
  });

  it("promover com a guarda de suporte barrando nao faz nada", async () => {
    h.support.mockResolvedValue(NextResponse.json({ error: { code: "forbidden_scope" } }, { status: 403 }));
    expect((await ROTA_PROMOVER(req("POST", "x"), ctx())).status).toBe(403);
    expect(h.promover).not.toHaveBeenCalled();
    expect(h.audit).not.toHaveBeenCalled();
  });

  it("ignorado de outra organizacao (ou inexistente) e 404, sem auditoria", async () => {
    h.promover.mockResolvedValue({ resultado: "nao_encontrado" });
    expect((await ROTA_PROMOVER(req("POST", "x"), ctx())).status).toBe(404);
    expect((await ROTA_PROMOVER(req("POST", "x"), ctx("nao-e-uuid"))).status).toBe(404);
    expect(h.audit).not.toHaveBeenCalled();
  });

  it("AC-008.3: com EMAIL_CANAL desligado a promocao nao le a caixa", async () => {
    h.ligado.mockReturnValue(false);
    expect((await ROTA_PROMOVER(req("POST", "x"), ctx())).status).toBe(503);
    expect(h.promover).not.toHaveBeenCalled();
  });

  it("e-mail que nao pode ser relido responde 502 sem auditar", async () => {
    h.promover.mockResolvedValue({ resultado: "indisponivel" });
    expect((await ROTA_PROMOVER(req("POST", "x"), ctx())).status).toBe(502);
    expect(h.audit).not.toHaveBeenCalled();
  });
});

describe("AC-003.4: não é cliente", () => {
  it("agent marca pela conversa; 1 auditoria; organizacao do login", async () => {
    const r = await ROTA_REMETENTES(req("POST", "channels/email/remetentes", { conversation_id: CONV }));
    expect(r.status).toBe(200);
    expect(h.role).toHaveBeenCalledWith("agent", expect.anything());
    expect(h.naoCliente).toHaveBeenCalledWith(expect.anything(), { organizationId: ORG, userId: "u-1", conversationId: CONV, endereco: undefined });
    expect(h.audit.mock.calls[0]![0]).toMatchObject({ action: "channel.email_sender_blocked", organizationId: ORG });
    // A auditoria e append-only: o endereco do terceiro nao entra nela.
    expect(JSON.stringify(h.audit.mock.calls[0]![0])).not.toContain("joao@exemplo.com");
  });

  it.each([
    ["corpo vazio", {}],
    ["os dois campos", { conversation_id: CONV, endereco: "a@b.com" }],
    ["campo desconhecido (organization_id)", { conversation_id: CONV, organization_id: "outra" }],
    ["e-mail invalido", { endereco: "nao-e-email" }],
  ])("valida com Zod e recusa: %s", async (_n, body) => {
    expect((await ROTA_REMETENTES(req("POST", "channels/email/remetentes", body))).status).toBe(422);
    expect(h.naoCliente).not.toHaveBeenCalled();
  });

  it("a guarda de suporte barra antes do efeito", async () => {
    h.support.mockResolvedValue(NextResponse.json({ error: { code: "forbidden_scope" } }, { status: 403 }));
    expect((await ROTA_REMETENTES(req("POST", "x", { conversation_id: CONV }))).status).toBe(403);
    expect(h.naoCliente).not.toHaveBeenCalled();
  });

  it("conversa que nao e de e-mail da organizacao e 404", async () => {
    h.naoCliente.mockResolvedValue({ resultado: "nao_encontrada" });
    expect((await ROTA_REMETENTES(req("POST", "x", { conversation_id: CONV }))).status).toBe(404);
    expect(h.audit).not.toHaveBeenCalled();
  });
});

describe("cron email-rodada", () => {
  const resumo = (extra: Record<string, unknown> = {}) => ({
    caixaId: "c1", organizationId: ORG, desfecho: "lida", lidas: 0, ingeridas: 0, duplicadas: 0, ignoradas: 0, puladas: 0, prazoEsgotado: false, ...extra,
  });

  it("recusa chamada sem o segredo do cron", async () => {
    h.autoriza.mockReturnValue(false);
    expect((await ROTA_CRON(req("GET", "cron/email-rodada") as never)).status).toBe(403);
    expect(h.rodar).not.toHaveBeenCalled();
  });

  it("AC-009.4: rodada vazia nao audita", async () => {
    h.rodar.mockResolvedValue({ desligado: false, caixas: [resumo()] });
    expect((await ROTA_CRON(req("GET", "cron/email-rodada") as never)).status).toBe(200);
    expect(h.audit).not.toHaveBeenCalled();
  });

  it("rodada que leu algo audita uma vez por organizacao, so com contagens", async () => {
    h.rodar.mockResolvedValue({
      desligado: false,
      caixas: [resumo({ lidas: 2, ingeridas: 1, ignoradas: 1 }), resumo({ caixaId: "c2", lidas: 1, ingeridas: 1 })],
    });
    await ROTA_CRON(req("GET", "cron/email-rodada") as never);
    expect(h.audit).toHaveBeenCalledTimes(1);
    expect(h.audit.mock.calls[0]![0]).toMatchObject({
      action: "channel.email_round_run",
      organizationId: ORG,
      metadata: { caixas: 2, lidas: 3, ingeridas: 2, ignoradas: 1 },
    });
  });

  it("AC-006.1: caixa pausada por senha recusada deixa trilha mesmo sem ter lido nada", async () => {
    h.rodar.mockResolvedValue({ desligado: false, caixas: [resumo({ desfecho: "senha_recusada" })] });
    await ROTA_CRON(req("GET", "cron/email-rodada") as never);
    expect(h.audit).toHaveBeenCalledTimes(1);
  });

  it("AC-008.3: desligado responde 200 e nao audita", async () => {
    h.rodar.mockResolvedValue({ desligado: true, caixas: [] });
    const r = await ROTA_CRON(req("GET", "cron/email-rodada") as never);
    expect(r.status).toBe(200);
    expect(h.audit).not.toHaveBeenCalled();
  });
});
