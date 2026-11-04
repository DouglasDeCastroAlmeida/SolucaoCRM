import { NextRequest, NextResponse } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const SENHA = "Senh4-Canario-Que-Nunca-Vaza";

const h = vi.hoisted(() => ({
  role: vi.fn(),
  support: vi.fn(),
  audit: vi.fn(),
  limite: vi.fn(),
  verificar: vi.fn(),
  gravarSenha: vi.fn(),
  encrypt: vi.fn(),
  listar: vi.fn(),
  achar: vi.fn(),
  acharPorEndereco: vi.fn(),
  salvar: vi.fn(),
  cursor: vi.fn(),
  atualizar: vi.fn(),
  descartar: vi.fn(),
  lerEstado: vi.fn(),
  retomar: vi.fn(),
  pausar: vi.fn(),
  pausas: vi.fn(),
  resolverAviso: vi.fn(),
  log: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));

vi.mock("@/lib/auth/require-role", () => ({ requireRole: h.role }));
vi.mock("@/lib/impersonate/support", () => ({ requireSupportWrite: h.support }));
vi.mock("@/lib/supabase/admin", () => ({ createAdminClient: () => ({}) }));
vi.mock("@/lib/audit", () => ({ audit: h.audit }));
vi.mock("@/lib/logger", () => ({ logger: h.log }));
vi.mock("@/lib/ai/dispatcher/rate-limit", () => ({ checkRateLimit: h.limite }));
vi.mock("@/lib/webhooks/secrets", () => ({ encryptWebhookSecret: h.encrypt }));
vi.mock("@/lib/channels/email/conexao", async () => ({
  ...(await vi.importActual<Record<string, unknown>>("@/lib/channels/email/conexao")),
  verificarCaixa: h.verificar,
}));
vi.mock("@/lib/channels/email/segredo", async () => ({
  ...(await vi.importActual<Record<string, unknown>>("@/lib/channels/email/segredo")),
  gravarSenhaDaCaixa: h.gravarSenha,
}));
vi.mock("@/lib/channels/email/caixa", async () => ({
  ...(await vi.importActual<Record<string, unknown>>("@/lib/channels/email/caixa")),
  listarCaixas: h.listar,
  acharCaixa: h.achar,
  acharCaixaPorEndereco: h.acharPorEndereco,
  salvarCaixa: h.salvar,
  iniciarCursor: h.cursor,
  atualizarConfigDaCaixa: h.atualizar,
  descartarCaixa: h.descartar,
}));

vi.mock("@/lib/channels/email/estado", async () => ({
  ...(await vi.importActual<Record<string, unknown>>("@/lib/channels/email/estado")),
  lerEstado: h.lerEstado,
  retomar: h.retomar,
  pausar: h.pausar,
  listarPausas: h.pausas,
}));
vi.mock("@/lib/channels/email/avisos", async () => ({
  ...(await vi.importActual<Record<string, unknown>>("@/lib/channels/email/avisos")),
  resolverAvisoSenhaRecusada: h.resolverAviso,
}));

import { GET, POST } from "@/app/api/v1/channels/email/route";
import { PATCH } from "@/app/api/v1/channels/email/[id]/route";
import { POST as TESTAR } from "@/app/api/v1/channels/email/testar/route";

const ORG = "org-confiavel";
const URL_ = "https://crm.test/api/v1/channels/email";

const corpo = (extra: Record<string, unknown> = {}) => ({
  endereco: "Atendimento@Exemplo.com",
  usuario: "atendimento@exemplo.com",
  senha: SENHA,
  imap: { host: "imap.exemplo.com", porta: 993, seguranca: "ssl" },
  smtp: { host: "smtp.exemplo.com", porta: 465, seguranca: "ssl" },
  ...extra,
});

const req = (metodo: string, caminho: string, body?: unknown) =>
  new NextRequest(`${URL_}${caminho}`, { method: metodo, body: body === undefined ? undefined : JSON.stringify(body) });

const CAIXA = {
  id: "9c1b7a52-3d4e-4f60-8a71-0b2c3d4e5f60",
  endereco: "atendimento@exemplo.com",
  status: "WORKING",
  archivedAt: null,
  config: {
    usuario: "atendimento@exemplo.com",
    imap: { host: "imap.exemplo.com", porta: 993, seguranca: "ssl" as const },
    smtp: { host: "smtp.exemplo.com", porta: 465, seguranca: "ssl" as const },
    senha_ultimos4: "Vaza",
    assinatura: null,
    teto_diario: 200,
    intervalo_segundos: 30,
  },
};

const contexto = (id = "9c1b7a52-3d4e-4f60-8a71-0b2c3d4e5f60") => ({ params: Promise.resolve({ id }) });

beforeEach(() => {
  vi.clearAllMocks();
  h.role.mockResolvedValue({ ok: true, org: { orgId: ORG }, user: { id: "admin-1", idioma: "pt-BR" } });
  h.support.mockResolvedValue(null);
  h.limite.mockResolvedValue({ allowed: true });
  h.verificar.mockResolvedValue({ ok: true, uidValidity: "1700", uidNext: 42, testeEnviado: true });
  h.encrypt.mockImplementation(async (_: unknown, v: string) => `\\x${Buffer.from(v).toString("hex")}`);
  h.gravarSenha.mockResolvedValue({ ok: true });
  h.listar.mockResolvedValue([CAIXA]);
  h.achar.mockResolvedValue(CAIXA);
  h.acharPorEndereco.mockResolvedValue(null);
  h.salvar.mockResolvedValue({ error: null, channelSessionId: "9c1b7a52-3d4e-4f60-8a71-0b2c3d4e5f60" });
  h.cursor.mockResolvedValue({ error: null });
  h.atualizar.mockResolvedValue({ error: null });
  h.descartar.mockResolvedValue(undefined);
  h.pausas.mockResolvedValue(new Map());
  h.lerEstado.mockResolvedValue({ pausaMotivo: null });
  h.pausar.mockResolvedValue(undefined);
  h.retomar.mockResolvedValue(undefined);
});

const semEfeitos = () => {
  expect(h.verificar).not.toHaveBeenCalled();
  expect(h.salvar).not.toHaveBeenCalled();
  expect(h.gravarSenha).not.toHaveBeenCalled();
  expect(h.atualizar).not.toHaveBeenCalled();
  expect(h.cursor).not.toHaveBeenCalled();
  expect(h.audit).not.toHaveBeenCalled();
};

describe("AC-001.6: só o admin conecta ou altera uma caixa", () => {
  const negado = NextResponse.json({ error: { code: "forbidden_role", message: "x" } }, { status: 403 });

  it.each([
    ["testar", () => TESTAR(req("POST", "/testar", corpo()))],
    ["conectar", () => POST(req("POST", "", corpo()))],
    ["alterar", () => PATCH(req("PATCH", "/9c1b7a52-3d4e-4f60-8a71-0b2c3d4e5f60", { assinatura: "Abraço" }), contexto())],
    ["listar", () => GET(req("GET", ""))],
  ])("recusa %s para quem não é admin, sem nenhum efeito", async (_nome, chamar) => {
    h.role.mockResolvedValue({ ok: false, response: negado });
    const r = await chamar();

    expect(r.status).toBe(403);
    expect(h.role).toHaveBeenCalledWith("admin", expect.objectContaining({ resource: expect.any(String) }));
    semEfeitos();
  });
});

describe("AC-007.5: guarda de suporte antes do efeito, Zod e auditoria", () => {
  it.each([
    ["testar", () => TESTAR(req("POST", "/testar", corpo()))],
    ["conectar", () => POST(req("POST", "", corpo()))],
    ["alterar", () => PATCH(req("PATCH", "/9c1b7a52-3d4e-4f60-8a71-0b2c3d4e5f60", { assinatura: "Abraço" }), contexto())],
  ])("%s: a guarda de suporte roda primeiro e, se barra, nada acontece", async (_nome, chamar) => {
    h.support.mockResolvedValue(NextResponse.json({ error: { code: "forbidden_scope" } }, { status: 403 }));
    const r = await chamar();

    expect(r.status).toBe(403);
    expect(h.support).toHaveBeenCalled();
    expect(h.role).not.toHaveBeenCalled();
    semEfeitos();
  });

  it("a guarda de suporte é chamada antes da verificação com a rede", async () => {
    await TESTAR(req("POST", "/testar", corpo()));
    const guarda = h.support.mock.invocationCallOrder[0] ?? Infinity;
    const rede = h.verificar.mock.invocationCallOrder[0] ?? 0;
    expect(guarda).toBeLessThan(rede);
  });

  it.each([
    ["e-mail inválido", corpo({ endereco: "nao-e-email" })],
    ["porta fora do intervalo", corpo({ imap: { host: "imap.exemplo.com", porta: 70000, seguranca: "ssl" } })],
    ["segurança desconhecida", corpo({ smtp: { host: "smtp.exemplo.com", porta: 465, seguranca: "nenhuma" } })],
    ["senha vazia", corpo({ senha: "" })],
    ["campo desconhecido (organization_id no corpo)", corpo({ organization_id: "outra-org" })],
    ["teto diário absurdo", corpo({ teto_diario: 1_000_000 })],
  ])("valida com Zod e recusa: %s", async (_nome, body) => {
    const t = await TESTAR(req("POST", "/testar", body));
    const c = await POST(req("POST", "", body));

    expect(t.status).toBe(422);
    expect(c.status).toBe(422);
    semEfeitos();
  });

  it("PATCH sem nenhum campo, ou com campo desconhecido, é recusado", async () => {
    const vazio = await PATCH(req("PATCH", "/9c1b7a52-3d4e-4f60-8a71-0b2c3d4e5f60", {}), contexto());
    const extra = await PATCH(req("PATCH", "/9c1b7a52-3d4e-4f60-8a71-0b2c3d4e5f60", { provider: "x" }), contexto());
    expect(vazio.status).toBe(422);
    expect(extra.status).toBe(422);
    semEfeitos();
  });

  it("conectar gera 1 auditoria, com a organização do login e sem a senha", async () => {
    await POST(req("POST", "", corpo({ organization_id: undefined })));

    expect(h.audit).toHaveBeenCalledTimes(1);
    const a = h.audit.mock.calls[0]?.[0];
    expect(a).toMatchObject({
      action: "channel.email_connected",
      organizationId: ORG,
      actorUserId: "admin-1",
      resourceType: "channel_session",
      resourceId: "9c1b7a52-3d4e-4f60-8a71-0b2c3d4e5f60",
    });
    expect(JSON.stringify(a)).not.toContain(SENHA);
  });

  it("alterar gera 1 auditoria", async () => {
    await PATCH(req("PATCH", "/9c1b7a52-3d4e-4f60-8a71-0b2c3d4e5f60", { teto_diario: 100 }), contexto());
    expect(h.audit).toHaveBeenCalledTimes(1);
    expect(h.audit.mock.calls[0]?.[0]).toMatchObject({
      action: "channel.email_updated",
      organizationId: ORG,
      resourceId: "9c1b7a52-3d4e-4f60-8a71-0b2c3d4e5f60",
    });
  });

  it("limite de tentativas: testar acima do teto responde 429 sem tocar a rede", async () => {
    h.limite.mockResolvedValue({ allowed: false });
    const r = await TESTAR(req("POST", "/testar", corpo()));
    expect(r.status).toBe(429);
    expect(r.headers.get("Retry-After")).toBeTruthy();
    expect(h.verificar).not.toHaveBeenCalled();
  });
});

describe("AC-001.3 e AC-001.4: testar", () => {
  it("entra, manda o e-mail de teste e devolve ok, sem gravar nada", async () => {
    const r = await TESTAR(req("POST", "/testar", corpo()));
    const json = await r.json();

    expect(r.status).toBe(200);
    expect(json.data).toEqual({ ok: true, teste_enviado: true });
    expect(h.verificar).toHaveBeenCalledWith(
      expect.objectContaining({ endereco: "atendimento@exemplo.com", senha: SENHA }),
      { enviarTeste: true },
    );
    expect(h.salvar).not.toHaveBeenCalled();
    expect(h.gravarSenha).not.toHaveBeenCalled();
  });

  it("falha com a causa em português e o código de erro canônico", async () => {
    h.verificar.mockResolvedValue({
      ok: false,
      causa: "senha_recusada",
      etapa: "leitura",
      mensagem: "O servidor recusou o usuário ou a senha.",
    });
    const r = await TESTAR(req("POST", "/testar", corpo()));
    const json = await r.json();

    expect(r.status).toBe(422);
    expect(json.error).toMatchObject({
      code: "email_conexao_recusada",
      message: "O servidor recusou o usuário ou a senha.",
      details: { causa: "senha_recusada", etapa: "leitura" },
    });
  });

  it("destino proibido usa o código próprio", async () => {
    h.verificar.mockResolvedValue({ ok: false, causa: "destino_proibido", etapa: "leitura", mensagem: "x" });
    const r = await TESTAR(req("POST", "/testar", corpo()));
    expect((await r.json()).error.code).toBe("email_destino_proibido");
  });
});

describe("AC-001.5: conectar", () => {
  it("confere a caixa de novo no servidor, grava a senha cifrada e nada do passado é importado", async () => {
    const r = await POST(req("POST", "", corpo({ assinatura: "Abraço, Equipe", teto_diario: 150 })));
    const json = await r.json();

    expect(r.status).toBe(201);
    expect(h.verificar).toHaveBeenCalledWith(expect.objectContaining({ senha: SENHA }), { enviarTeste: false });
    expect(h.salvar).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        organizationId: ORG,
        endereco: "atendimento@exemplo.com",
        config: expect.objectContaining({ assinatura: "Abraço, Equipe", teto_diario: 150, senha_ultimos4: "Vaza" }),
      }),
    );
    expect(h.gravarSenha).toHaveBeenCalledWith(
      expect.anything(),
      { organizationId: ORG, channelSessionId: "9c1b7a52-3d4e-4f60-8a71-0b2c3d4e5f60", senha: SENHA },
    );
    // O cursor nasce no fim da caixa: só chega depois da conexão.
    expect(h.cursor).toHaveBeenCalledWith(
      expect.anything(),
      { organizationId: ORG, channelSessionId: "9c1b7a52-3d4e-4f60-8a71-0b2c3d4e5f60", uidValidity: "1700", ultimoUid: 41 },
    );
    expect(json.data).toMatchObject({ id: "9c1b7a52-3d4e-4f60-8a71-0b2c3d4e5f60", endereco: "atendimento@exemplo.com" });
  });

  it("não grava nada quando a caixa não responde", async () => {
    h.verificar.mockResolvedValue({ ok: false, causa: "porta_fechada", etapa: "leitura", mensagem: "x" });
    const r = await POST(req("POST", "", corpo()));

    expect(r.status).toBe(422);
    expect(h.salvar).not.toHaveBeenCalled();
    expect(h.gravarSenha).not.toHaveBeenCalled();
  });

  it("recusa conectar o mesmo endereço duas vezes na organização", async () => {
    h.acharPorEndereco.mockResolvedValue(CAIXA);
    const r = await POST(req("POST", "", corpo()));

    expect(r.status).toBe(409);
    expect(h.salvar).not.toHaveBeenCalled();
  });

  it("sem a chave de cifra recusa, e não deixa caixa sem senha para trás", async () => {
    h.gravarSenha.mockResolvedValue({ ok: false, motivo: "cifra_indisponivel" });
    const r = await POST(req("POST", "", corpo()));

    expect(r.status).toBe(422);
    expect(h.descartar).toHaveBeenCalledWith(expect.anything(), ORG, "9c1b7a52-3d4e-4f60-8a71-0b2c3d4e5f60");
    expect(h.audit).not.toHaveBeenCalled();
  });

  it("a organização vem do login: o filtro da busca por endereço usa a do login", async () => {
    await POST(req("POST", "", corpo()));
    expect(h.acharPorEndereco).toHaveBeenCalledWith(expect.anything(), ORG, "atendimento@exemplo.com");
  });
});

const ID_DA_CAIXA = "9c1b7a52-3d4e-4f60-8a71-0b2c3d4e5f60";

describe("AC-008.1 e AC-008.2: estado e pausa por caixa", () => {
  it("a lista traz o estado de CADA caixa: a pausada diz o motivo, a outra segue ativa", async () => {
    const OUTRA = { ...CAIXA, id: "1d2e3f40-5a6b-4c7d-8e9f-a0b1c2d3e4f5", endereco: "vendas@exemplo.com" };
    h.listar.mockResolvedValue([CAIXA, OUTRA]);
    h.pausas.mockResolvedValue(new Map([[CAIXA.id, "pausada_pela_equipe"]]));

    const json = await (await GET(req("GET", ""))).json();

    expect(h.pausas).toHaveBeenCalledWith(expect.anything(), ORG);
    expect(json.data.caixas[0]).toMatchObject({ pausada: true, pausa_motivo: "pausada_pela_equipe" });
    expect(json.data.caixas[1]).toMatchObject({ pausada: false, pausa_motivo: null });
  });

  it("pausar grava o motivo da equipe, audita, e não mexe na configuração nem na rede", async () => {
    const r = await PATCH(req("PATCH", `/${ID_DA_CAIXA}`, { pausada: true }), contexto());

    expect(r.status).toBe(200);
    expect(h.pausar).toHaveBeenCalledWith(expect.anything(), ORG, ID_DA_CAIXA, "pausada_pela_equipe");
    expect(h.atualizar).not.toHaveBeenCalled();
    expect(h.verificar).not.toHaveBeenCalled();
    expect(h.audit).toHaveBeenCalledTimes(1);
    expect(h.audit).toHaveBeenCalledWith(
      expect.objectContaining({ action: "channel.email_paused", organizationId: ORG, resourceId: ID_DA_CAIXA }),
    );
    expect((await r.json()).data).toMatchObject({ pausada: true, pausa_motivo: "pausada_pela_equipe" });
  });

  it("retomar só tira a pausa: o cursor não é tocado e a auditoria é a de retomada", async () => {
    h.lerEstado.mockResolvedValue({ pausaMotivo: "pausada_pela_equipe" });
    const r = await PATCH(req("PATCH", `/${ID_DA_CAIXA}`, { pausada: false }), contexto());

    expect(r.status).toBe(200);
    expect(h.retomar).toHaveBeenCalledWith(expect.anything(), ORG, ID_DA_CAIXA);
    expect(h.cursor).not.toHaveBeenCalled();
    expect(h.audit).toHaveBeenCalledWith(expect.objectContaining({ action: "channel.email_resumed" }));
    expect((await r.json()).data).toMatchObject({ pausada: false, pausa_motivo: null });
  });

  it("caixa pausada por senha recusada NÃO retoma sem senha nova: 422 com o que fazer", async () => {
    h.lerEstado.mockResolvedValue({ pausaMotivo: "senha_recusada" });
    const r = await PATCH(req("PATCH", `/${ID_DA_CAIXA}`, { pausada: false }), contexto());

    expect(r.status).toBe(422);
    expect((await r.json()).error.message).toContain("senha");
    expect(h.retomar).not.toHaveBeenCalled();
    expect(h.audit).not.toHaveBeenCalled();
  });

  it("pausar uma caixa que já está pausada por senha recusada preserva o motivo (não vira 'da equipe')", async () => {
    h.lerEstado.mockResolvedValue({ pausaMotivo: "senha_recusada" });
    await PATCH(req("PATCH", `/${ID_DA_CAIXA}`, { pausada: true }), contexto());
    expect(h.pausar).not.toHaveBeenCalled();
  });
});

describe("AC-001.5 e AC-008.1: listar e alterar", () => {
  it("lista só as caixas da organização do login, com os 4 últimos da senha", async () => {
    const r = await GET(req("GET", ""));
    const json = await r.json();

    expect(h.listar).toHaveBeenCalledWith(expect.anything(), ORG);
    expect(json.data.caixas[0]).toMatchObject({ id: "9c1b7a52-3d4e-4f60-8a71-0b2c3d4e5f60", endereco: "atendimento@exemplo.com", senha_ultimos4: "Vaza" });
  });

  it("alterar assinatura e teto não mexe na senha nem toca a rede", async () => {
    const r = await PATCH(req("PATCH", "/9c1b7a52-3d4e-4f60-8a71-0b2c3d4e5f60", { assinatura: "Novo abraço", teto_diario: 80 }), contexto());

    expect(r.status).toBe(200);
    expect(h.atualizar).toHaveBeenCalledWith(expect.anything(), {
      organizationId: ORG,
      channelSessionId: "9c1b7a52-3d4e-4f60-8a71-0b2c3d4e5f60",
      config: expect.objectContaining({ assinatura: "Novo abraço", teto_diario: 80 }),
    });
    expect(h.verificar).not.toHaveBeenCalled();
    expect(h.gravarSenha).not.toHaveBeenCalled();
  });

  it("id que não é UUID responde 404 sem consultar o banco", async () => {
    const r = await PATCH(req("PATCH", "/xyz", { teto_diario: 10 }), contexto("xyz"));

    expect(r.status).toBe(404);
    expect(h.achar).not.toHaveBeenCalled();
    expect(h.atualizar).not.toHaveBeenCalled();
  });

  it("caixa de outra organização (ou inexistente) responde 404 e nada muda", async () => {
    h.achar.mockResolvedValue(null);
    const r = await PATCH(req("PATCH", "/7e2a6b10-1c2d-4e3f-9a8b-7c6d5e4f3a21", { teto_diario: 10 }), contexto("7e2a6b10-1c2d-4e3f-9a8b-7c6d5e4f3a21"));

    expect(r.status).toBe(404);
    expect(h.achar).toHaveBeenCalledWith(expect.anything(), ORG, "7e2a6b10-1c2d-4e3f-9a8b-7c6d5e4f3a21");
    expect(h.atualizar).not.toHaveBeenCalled();
  });

  it("trocar a senha confere a nova na caixa antes de guardar", async () => {
    await PATCH(req("PATCH", "/9c1b7a52-3d4e-4f60-8a71-0b2c3d4e5f60", { senha: "outra-senha-longa-123" }), contexto());

    expect(h.verificar).toHaveBeenCalledWith(
      expect.objectContaining({ senha: "outra-senha-longa-123", endereco: "atendimento@exemplo.com" }),
      { enviarTeste: false },
    );
    expect(h.gravarSenha).toHaveBeenCalledWith(
      expect.anything(),
      { organizationId: ORG, channelSessionId: "9c1b7a52-3d4e-4f60-8a71-0b2c3d4e5f60", senha: "outra-senha-longa-123" },
    );
    expect(h.atualizar).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ config: expect.objectContaining({ senha_ultimos4: "-123" }) }),
    );
  });

  it("AC-006.1: senha nova numa caixa pausada por senha recusada retoma e fecha o aviso da Central", async () => {
    h.lerEstado.mockResolvedValue({ pausaMotivo: "senha_recusada" });
    await PATCH(req("PATCH", "/9c1b7a52-3d4e-4f60-8a71-0b2c3d4e5f60", { senha: "outra-senha-longa-123" }), contexto());

    expect(h.retomar).toHaveBeenCalledWith(expect.anything(), ORG, "9c1b7a52-3d4e-4f60-8a71-0b2c3d4e5f60");
    expect(h.resolverAviso).toHaveBeenCalledWith(expect.anything(), ORG, "9c1b7a52-3d4e-4f60-8a71-0b2c3d4e5f60");
  });

  it("AC-006.1: caixa que nao estava pausada nao mexe no aviso", async () => {
    h.lerEstado.mockResolvedValue({ pausaMotivo: null });
    await PATCH(req("PATCH", "/9c1b7a52-3d4e-4f60-8a71-0b2c3d4e5f60", { senha: "outra-senha-longa-123" }), contexto());
    expect(h.resolverAviso).not.toHaveBeenCalled();
  });

  it("senha nova recusada pela caixa não é guardada", async () => {
    h.verificar.mockResolvedValue({ ok: false, causa: "senha_recusada", etapa: "leitura", mensagem: "x" });
    const r = await PATCH(req("PATCH", "/9c1b7a52-3d4e-4f60-8a71-0b2c3d4e5f60", { senha: "outra-senha-longa-123" }), contexto());

    expect(r.status).toBe(422);
    expect(h.gravarSenha).not.toHaveBeenCalled();
    expect(h.atualizar).not.toHaveBeenCalled();
  });
});

describe("AC-007.1 e AC-007.2: a senha nunca volta", () => {
  it("não aparece em nenhuma resposta, auditoria ou log, nos caminhos de sucesso e de falha", async () => {
    const respostas: string[] = [];
    const guardar = async (r: Response) => respostas.push(await r.clone().text());

    await guardar(await TESTAR(req("POST", "/testar", corpo())));
    await guardar(await POST(req("POST", "", corpo())));
    await guardar(await GET(req("GET", "")));
    await guardar(await PATCH(req("PATCH", "/9c1b7a52-3d4e-4f60-8a71-0b2c3d4e5f60", { senha: SENHA }), contexto()));
    h.verificar.mockResolvedValue({ ok: false, causa: "senha_recusada", etapa: "leitura", mensagem: "recusada" });
    await guardar(await TESTAR(req("POST", "/testar", corpo())));
    await guardar(await POST(req("POST", "", corpo())));
    await guardar(await PATCH(req("PATCH", "/9c1b7a52-3d4e-4f60-8a71-0b2c3d4e5f60", { senha: SENHA }), contexto()));
    h.salvar.mockResolvedValue({ error: `falhou com ${SENHA}`, channelSessionId: null });
    h.verificar.mockResolvedValue({ ok: true, uidValidity: "1", uidNext: 2, testeEnviado: false });
    await guardar(await POST(req("POST", "", corpo())));

    const auditorias = JSON.stringify(h.audit.mock.calls);
    const logs = JSON.stringify(Object.values(h.log).map((f) => f.mock.calls));
    expect(respostas.length).toBe(8);
    for (const texto of [...respostas, auditorias, logs]) expect(texto).not.toContain(SENHA);
  });
});
