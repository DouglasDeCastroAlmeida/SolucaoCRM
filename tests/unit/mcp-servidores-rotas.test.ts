/**
 * T-034: rotas /api/v1/mcp-servidores (mudança 006, Fatia 7).
 * AC-007.1, 007.2, 007.4 e AC-008.1 a 008.4: Zod, papel, requireSupportWrite antes do efeito,
 * auditoria, isolamento entre organizações e credencial nunca em resposta, log ou auditoria.
 *
 * O banco é um fake em memória na fronteira (PostgREST); a rede (destino seguro e listagem MCP) são
 * as fronteiras mockadas. O repositório, a cifra e as funções de ferramenta por agente são os reais.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

vi.hoisted(() => {
  process.env.AI_CRED_AES_KEY = "iBc1Z2gYaAH4rEHs1dHQ2dvNQ6t4OfrdE1/Y6OSvtZY=";
});

import { audit } from "@/lib/audit";
import { requireSupportWrite } from "@/lib/impersonate/support";
import { exigirAdminDeServidoresMcp } from "@/lib/mcp/servidor-externo/quem-administra";
import { listarFerramentasDoServidor } from "@/lib/mcp/servidor-externo/chamada";
import { cifrarChaveMcpExterno } from "@/lib/mcp/servidor-externo/segredo";

vi.mock("@/lib/mcp/servidor-externo/quem-administra", () => ({
  exigirAdminDeServidoresMcp: vi.fn(),
  RECURSO_DOS_SERVIDORES_MCP: "mcp_servidores",
}));
vi.mock("@/lib/audit", () => ({ audit: vi.fn(async () => undefined) }));
vi.mock("@/lib/impersonate/support", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/impersonate/support")>()),
  requireSupportWrite: vi.fn(async () => null),
}));
vi.mock("@/lib/net/destino-seguro", () => ({
  resolverDestinoSeguro: vi.fn(async (url: string) => {
    const u = new URL(url);
    if (u.protocol !== "https:") return { ok: false, motivo: "http" };
    if (u.hostname === "localhost" || u.hostname.startsWith("169.254.")) return { ok: false, motivo: "ip_especial" };
    return { ok: true, ip: "93.184.216.34", servername: u.hostname };
  }),
}));
vi.mock("@/lib/mcp/servidor-externo/chamada", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/mcp/servidor-externo/chamada")>()),
  listarFerramentasDoServidor: vi.fn(),
}));

// ─── Fake do PostgREST ──────────────────────────────────────────────────────

type Linha = Record<string, unknown>;
const tabelas: Record<string, Linha[]> = {};
let seq = 0;

/** Cada tabela consultada, na ordem: prova que uma recusa não leu nada. */
const consultas: string[] = [];

function construtor(nome: string) {
  consultas.push(nome);
  const linhas = (tabelas[nome] ??= []);
  const filtros: Array<(l: Linha) => boolean> = [];
  let tipo: "select" | "insert" | "update" = "select";
  let payload: Linha = {};
  let max = Infinity;
  const executar = (): { data: Linha[] | null; error: { code: string; message: string } | null } => {
    const alvo = () => linhas.filter((l) => filtros.every((f) => f(l))).slice(0, max);
    if (tipo === "insert") {
      if (nome === "mcp_servidores_externos" && linhas.some((l) => l.organization_id === payload.organization_id && l.slug === payload.slug)) {
        return { data: null, error: { code: "23505", message: "duplicate key" } };
      }
      seq += 1;
      const nova: Linha = {
        id: `00000000-0000-4000-8000-${String(seq).padStart(12, "0")}`,
        ativo: true,
        created_at: "2026-10-28T00:00:00Z",
        ...payload,
      };
      linhas.push(nova);
      return { data: [nova], error: null };
    }
    if (tipo === "update") {
      const a = alvo();
      a.forEach((l) => Object.assign(l, payload));
      return { data: a, error: null };
    }
    return { data: alvo(), error: null };
  };
  const api = {
    select: () => api,
    insert: (p: Linha) => ((tipo = "insert"), (payload = p), api),
    update: (p: Linha) => ((tipo = "update"), (payload = p), api),
    eq: (k: string, v: unknown) => (filtros.push((l) => l[k] === v), api),
    order: () => api,
    limit: (n: number) => ((max = n), api),
    single: async () => {
      const r = executar();
      return { data: r.data?.[0] ?? null, error: r.error };
    },
    maybeSingle: async () => {
      const r = executar();
      return { data: r.data?.[0] ?? null, error: r.error };
    },
    then: (ok: (v: unknown) => unknown, ko?: (e: unknown) => unknown) => Promise.resolve(executar()).then(ok, ko),
  };
  return api;
}
vi.mock("@/lib/supabase/admin", () => ({ createAdminClient: () => ({ from: construtor }) }));

// ─── Cenário ────────────────────────────────────────────────────────────────

const ORG = "22222222-2222-4222-8222-222222222222";
const OUTRA_ORG = "33333333-3333-4333-8333-333333333333";
const USUARIO = "11111111-1111-4111-8111-111111111111";
const AGENTE = "44444444-4444-4444-8444-444444444444";
const AGENTE_DE_FORA = "55555555-5555-4555-8555-555555555555";
const RASCUNHO = "66666666-6666-4666-8666-666666666666";
const CHAVE = "chave-secreta-do-erp-9999";

type Corpo = Record<string, unknown>;
type Resposta = { data?: Corpo; error?: { code: string; message: string } };

function permitir() {
  vi.mocked(exigirAdminDeServidoresMcp).mockResolvedValue({
    ok: true,
    user: { id: USUARIO, idioma: "pt-BR" },
    org: { orgId: ORG, name: "Org", role: "admin" },
  } as never);
}
function negar(codigo = "forbidden_role") {
  vi.mocked(exigirAdminDeServidoresMcp).mockResolvedValue({
    ok: false,
    response: new Response(JSON.stringify({ error: { code: codigo, message: "x" } }), { status: 403 }),
  } as never);
}

async function chamar(
  rota: "lista" | "item" | "ferramentas" | "atualizar",
  metodo: "GET" | "POST" | "PATCH" | "DELETE",
  opcoes: { id?: string; corpo?: unknown; busca?: string } = {},
) {
  const id = opcoes.id ?? "";
  const base = "http://localhost/api/v1/mcp-servidores";
  const url =
    rota === "lista"
      ? base
      : rota === "item"
        ? `${base}/${id}`
        : `${base}/${id}/${rota === "ferramentas" ? "ferramentas" : "atualizar-ferramentas"}`;
  const modulo =
    rota === "lista"
      ? await import("@/app/api/v1/mcp-servidores/route")
      : rota === "item"
        ? await import("@/app/api/v1/mcp-servidores/[id]/route")
        : rota === "ferramentas"
          ? await import("@/app/api/v1/mcp-servidores/[id]/ferramentas/route")
          : await import("@/app/api/v1/mcp-servidores/[id]/atualizar-ferramentas/route");
  const req = new NextRequest(url + (opcoes.busca ?? ""), {
    method: metodo,
    ...(opcoes.corpo !== undefined
      ? {
          body: typeof opcoes.corpo === "string" ? opcoes.corpo : JSON.stringify(opcoes.corpo),
          headers: { "content-type": "application/json" },
        }
      : {}),
  });
  const handler = (modulo as unknown as Record<string, (r: NextRequest, c: unknown) => Promise<Response>>)[metodo]!;
  const res = await handler(req, { params: Promise.resolve({ id }) });
  const texto = await res.text();
  return { status: res.status, texto, corpo: JSON.parse(texto) as Resposta, res };
}

function servidorNoBanco(extra: Linha = {}, org: string = ORG): Linha {
  const c = cifrarChaveMcpExterno(CHAVE);
  const linha: Linha = {
    id: `aaaaaaaa-aaaa-4aaa-8aaa-${String(++seq).padStart(12, "0")}`,
    organization_id: org,
    slug: "loja",
    nome: "ERP da loja",
    endpoint: "https://erp.loja.exemplo/mcp",
    chave_encrypted: c.mcp_externo_chave_encrypted,
    chave_iv: c.mcp_externo_chave_iv,
    chave_tag: c.mcp_externo_chave_tag,
    chave_last4: c.mcp_externo_chave_last4,
    ferramentas: [
      { name: "buscar_pedido", somenteLeitura: true },
      { name: "cancelar_pedido", description: "Cancela" },
    ],
    ferramentas_em: "2026-10-28T00:00:00Z",
    ativo: true,
    created_at: "2026-10-28T00:00:00Z",
    ...extra,
  };
  (tabelas.mcp_servidores_externos ??= []).push(linha);
  return linha;
}

function agentesNoBanco() {
  tabelas.ai_agents = [
    { id: AGENTE, organization_id: ORG, operation_mode: "automatic", config: { rag_top_k: 7 }, published_version_id: null },
    { id: AGENTE_DE_FORA, organization_id: OUTRA_ORG, operation_mode: "assisted", config: {}, published_version_id: null },
  ];
  tabelas.ai_agent_versions = [
    { id: RASCUNHO, organization_id: ORG, agent_id: AGENTE, status: "draft", version_number: 2, tool_ids: ["crm_search_products"] },
  ];
}

beforeEach(() => {
  vi.clearAllMocks();
  for (const k of Object.keys(tabelas)) delete tabelas[k];
  consultas.length = 0;
  vi.mocked(requireSupportWrite).mockResolvedValue(null);
  vi.mocked(listarFerramentasDoServidor).mockResolvedValue([
    { name: "buscar_pedido", somenteLeitura: true },
    { name: "cancelar_pedido" },
  ]);
  permitir();
});

const NOVO = { slug: "loja", nome: "ERP da loja", endpoint: "https://erp.loja.exemplo/mcp", chave: CHAVE };

// ─── POST /mcp-servidores ───────────────────────────────────────────────────

describe("AC-007.1: cadastrar servidor", () => {
  it("valida o destino, testa a conexão, guarda a chave cifrada e devolve só o final dela", async () => {
    const r = await chamar("lista", "POST", { corpo: NOVO });

    expect(r.status).toBe(201);
    expect(r.res.headers.get("X-Request-Id")).toBeTruthy();
    expect(r.corpo.data).toMatchObject({ slug: "loja", host: "erp.loja.exemplo", chave_last4: "9999" });
    expect(listarFerramentasDoServidor).toHaveBeenCalledTimes(1);
    const linha = tabelas.mcp_servidores_externos![0]!;
    expect(linha.organization_id).toBe(ORG);
    expect(JSON.stringify(linha)).not.toContain(CHAVE);
    expect(String(linha.chave_encrypted)).toMatch(/^\\x[0-9a-f]+$/i);
  });

  it("AC-007.2: todas as ferramentas nascem desligadas", async () => {
    const r = await chamar("lista", "POST", { corpo: NOVO });
    const ferramentas = r.corpo.data!.ferramentas as Array<{ nome: string; ligada: boolean }>;
    expect(ferramentas.map((f) => f.nome)).toEqual(["buscar_pedido", "cancelar_pedido"]);
    expect(ferramentas.every((f) => f.ligada === false)).toBe(true);
  });

  it.each([
    ["http", { ...NOVO, endpoint: "http://erp.loja.exemplo/mcp" }, "ai_http_nao_permitido"],
    ["destino interno", { ...NOVO, endpoint: "https://localhost/mcp" }, "ai_destino_proibido"],
    ["usuário e senha na URL", { ...NOVO, endpoint: "https://u:s@erp.loja.exemplo/mcp" }, "mcp_servidor_invalido"],
  ])("recusa %s e não grava nada", async (_c, corpo, codigo) => {
    const r = await chamar("lista", "POST", { corpo });
    expect(r.status).toBe(422);
    expect(r.corpo.error?.code).toBe(codigo);
    expect(tabelas.mcp_servidores_externos ?? []).toHaveLength(0);
    expect(audit).not.toHaveBeenCalled();
  });

  it("conexão que falha: recusa sem gravar e sem repetir a chave na mensagem", async () => {
    vi.mocked(listarFerramentasDoServidor).mockRejectedValueOnce(new Error(`401 com ${CHAVE}`));
    const r = await chamar("lista", "POST", { corpo: NOVO });
    expect(r.status).toBe(422);
    expect(r.texto).not.toContain(CHAVE);
    expect(tabelas.mcp_servidores_externos ?? []).toHaveLength(0);
  });

  it("identificador repetido na mesma organização: 409", async () => {
    servidorNoBanco();
    const r = await chamar("lista", "POST", { corpo: NOVO });
    expect(r.status).toBe(409);
  });
});

describe("AC-008.3: Zod estrito no cadastro", () => {
  it.each([
    ["campo a mais (organization_id)", { ...NOVO, organization_id: OUTRA_ORG }],
    ["sem chave", { slug: "loja", nome: "x", endpoint: "https://a.b/mcp" }],
    ["slug inválido", { ...NOVO, slug: "Loja Grande" }],
    ["slug longo demais", { ...NOVO, slug: "a".repeat(25) }],
    ["tipo errado", { ...NOVO, chave: 123 }],
  ])("%s: 422 e nada gravado", async (_c, corpo) => {
    const r = await chamar("lista", "POST", { corpo });
    expect(r.status).toBe(422);
    expect(r.corpo.error?.code).toBe("validation_failed");
    expect(tabelas.mcp_servidores_externos ?? []).toHaveLength(0);
    expect(r.texto).not.toContain(CHAVE);
  });

  it("JSON inválido: 400", async () => {
    const r = await chamar("lista", "POST", { corpo: "{nao-json" });
    expect(r.status).toBe(400);
  });

  it("a organização vem da sessão, não do corpo", async () => {
    await chamar("lista", "POST", { corpo: NOVO });
    expect(tabelas.mcp_servidores_externos![0]!.organization_id).toBe(ORG);
  });

  it("audita mcp.server_added com o host e a contagem, nunca a chave nem o endereço inteiro", async () => {
    await chamar("lista", "POST", { corpo: NOVO });
    expect(audit).toHaveBeenCalledTimes(1);
    const evento = vi.mocked(audit).mock.calls[0]![0];
    expect(evento).toMatchObject({ action: "mcp.server_added", actorUserId: USUARIO, organizationId: ORG });
    expect(JSON.stringify(evento)).not.toContain(CHAVE);
    expect(JSON.stringify(evento)).not.toContain("https://");
  });
});

// ─── GET /mcp-servidores ────────────────────────────────────────────────────

describe("AC-008.1/008.2/008.4: listar", () => {
  it("lista só os da organização da sessão, com a chave só pelos 4 últimos caracteres", async () => {
    const meu = servidorNoBanco();
    servidorNoBanco({ slug: "alheio" }, OUTRA_ORG);

    const r = await chamar("lista", "GET");

    expect(r.status).toBe(200);
    const itens = r.corpo.data as unknown as Array<Corpo>;
    expect(itens).toHaveLength(1);
    expect(itens[0]).toMatchObject({ id: meu.id, chave_last4: "9999" });
    expect(r.texto).not.toContain(CHAVE);
    expect(r.texto).not.toContain("chave_encrypted");
    expect(r.texto).not.toContain("endpoint");
  });
});

// ─── Papel e suporte ────────────────────────────────────────────────────────

describe("AC-008.3: papel certo e requireSupportWrite antes do efeito", () => {
  const mutantes: Array<[string, () => ReturnType<typeof chamar>]> = [
    ["POST /mcp-servidores", () => chamar("lista", "POST", { corpo: NOVO })],
    ["PATCH /mcp-servidores/[id]", () => chamar("item", "PATCH", { id: "aaaaaaaa-aaaa-4aaa-8aaa-000000000001", corpo: { ativo: false } })],
    ["DELETE /mcp-servidores/[id]", () => chamar("item", "DELETE", { id: "aaaaaaaa-aaaa-4aaa-8aaa-000000000001" })],
    [
      "PATCH /mcp-servidores/[id]/ferramentas",
      () => chamar("ferramentas", "PATCH", { id: "aaaaaaaa-aaaa-4aaa-8aaa-000000000001", corpo: { acao: "desligar", agente_id: AGENTE, ferramenta: "x" } }),
    ],
    ["POST /mcp-servidores/[id]/atualizar-ferramentas", () => chamar("atualizar", "POST", { id: "aaaaaaaa-aaaa-4aaa-8aaa-000000000001", corpo: {} })],
  ];

  it.each(mutantes)("%s: sessão de suporte barra antes de qualquer efeito", async (_n, rodar) => {
    servidorNoBanco({ id: "aaaaaaaa-aaaa-4aaa-8aaa-000000000001" });
    agentesNoBanco();
    vi.mocked(requireSupportWrite).mockResolvedValueOnce(
      new Response(JSON.stringify({ error: { code: "support_read_only", message: "x" } }), { status: 403 }) as never,
    );
    const antes = JSON.stringify(tabelas);

    const r = await rodar();

    expect(r.status).toBe(403);
    expect(exigirAdminDeServidoresMcp).not.toHaveBeenCalled();
    expect(JSON.stringify(tabelas)).toBe(antes);
    expect(listarFerramentasDoServidor).not.toHaveBeenCalled();
    expect(audit).not.toHaveBeenCalled();
  });

  it.each(mutantes)("%s: quem não pode recebe a recusa do guarda e nada acontece", async (_n, rodar) => {
    servidorNoBanco({ id: "aaaaaaaa-aaaa-4aaa-8aaa-000000000001" });
    agentesNoBanco();
    negar();
    const antes = JSON.stringify(tabelas);

    const r = await rodar();

    expect(r.status).toBe(403);
    expect(JSON.stringify(tabelas)).toBe(antes);
    expect(audit).not.toHaveBeenCalled();
  });

  it("a leitura também passa pelo guarda de papel", async () => {
    negar();
    expect((await chamar("lista", "GET")).status).toBe(403);
  });

  it("M3: GET das ferramentas de um agente, sem permissão, dá 403 e não lê nenhuma tabela", async () => {
    const s = servidorNoBanco();
    agentesNoBanco();
    consultas.length = 0;
    negar();

    const r = await chamar("ferramentas", "GET", { id: String(s.id), busca: `?agente_id=${AGENTE}` });

    expect(r.status).toBe(403);
    expect(consultas).toEqual([]);
    expect(r.texto).not.toContain(CHAVE);
  });
});

// ─── PATCH/DELETE servidor ──────────────────────────────────────────────────

describe("AC-008.3/008.4: desativar é lógico e isolado por organização", () => {
  it("DELETE desativa sem apagar a linha e audita mcp.server_removed", async () => {
    const s = servidorNoBanco();
    const r = await chamar("item", "DELETE", { id: String(s.id) });
    expect(r.status).toBe(200);
    expect(tabelas.mcp_servidores_externos).toHaveLength(1);
    expect(tabelas.mcp_servidores_externos![0]).toMatchObject({ ativo: false, chave_last4: "9999" });
    expect(vi.mocked(audit).mock.calls[0]![0]).toMatchObject({ action: "mcp.server_removed", resourceId: s.id });
  });

  it("PATCH {ativo} liga de novo e audita mcp.server_updated", async () => {
    const s = servidorNoBanco({ ativo: false });
    const r = await chamar("item", "PATCH", { id: String(s.id), corpo: { ativo: true } });
    expect(r.status).toBe(200);
    expect(tabelas.mcp_servidores_externos![0]!.ativo).toBe(true);
    expect(vi.mocked(audit).mock.calls[0]![0]).toMatchObject({ action: "mcp.server_updated" });
  });

  it("PATCH com campo desconhecido: 422", async () => {
    const s = servidorNoBanco();
    expect((await chamar("item", "PATCH", { id: String(s.id), corpo: { ativo: true, chave: "nova" } })).status).toBe(422);
  });

  it("servidor de outra organização é 404, igual a um que não existe, e nada muda", async () => {
    const alheio = servidorNoBanco({ slug: "alheio" }, OUTRA_ORG);
    const r1 = await chamar("item", "DELETE", { id: String(alheio.id) });
    const r2 = await chamar("item", "DELETE", { id: "aaaaaaaa-aaaa-4aaa-8aaa-999999999999" });
    expect(r1.status).toBe(404);
    expect(r2.status).toBe(404);
    expect(r1.corpo.error?.message).toBe(r2.corpo.error?.message);
    expect(tabelas.mcp_servidores_externos![0]!.ativo).toBe(true);
    expect(audit).not.toHaveBeenCalled();
  });

  it("id que não é UUID: 400", async () => {
    expect((await chamar("item", "DELETE", { id: "nao-e-uuid" })).status).toBe(400);
  });
});

// ─── Ferramentas por agente ─────────────────────────────────────────────────

describe("AC-007.2: ligar e desligar ferramenta por agente", () => {
  it("liga na versão RASCUNHO do agente da própria organização e audita", async () => {
    const s = servidorNoBanco();
    agentesNoBanco();

    const r = await chamar("ferramentas", "PATCH", {
      id: String(s.id),
      corpo: { acao: "ligar", agente_id: AGENTE, ferramenta: "cancelar_pedido" },
    });

    expect(r.status).toBe(200);
    expect(tabelas.ai_agent_versions![0]!.tool_ids).toEqual([
      "crm_search_products",
      "mcp_externo:loja:escrita:cancelar_pedido",
    ]);
    expect(vi.mocked(audit).mock.calls[0]![0]).toMatchObject({
      action: "mcp.tool_enabled",
      organizationId: ORG,
      metadata: expect.objectContaining({ agente_id: AGENTE, ferramenta: "cancelar_pedido", servidor: "loja" }),
    });
  });

  it("só marca como leitura quando o servidor anunciou leitura", async () => {
    const s = servidorNoBanco();
    agentesNoBanco();
    const ruim = await chamar("ferramentas", "PATCH", {
      id: String(s.id),
      corpo: { acao: "ligar", agente_id: AGENTE, ferramenta: "cancelar_pedido", marca: "leitura" },
    });
    expect(ruim.status).toBe(422);
    const boa = await chamar("ferramentas", "PATCH", {
      id: String(s.id),
      corpo: { acao: "ligar", agente_id: AGENTE, ferramenta: "buscar_pedido", marca: "leitura" },
    });
    expect(boa.status).toBe(200);
    expect(tabelas.ai_agent_versions![0]!.tool_ids).toContain("mcp_externo:loja:leitura:buscar_pedido");
  });

  it("ferramenta que não está na lista do servidor: 404, nada grava", async () => {
    const s = servidorNoBanco();
    agentesNoBanco();
    const r = await chamar("ferramentas", "PATCH", {
      id: String(s.id),
      corpo: { acao: "ligar", agente_id: AGENTE, ferramenta: "apagar_tudo" },
    });
    expect(r.status).toBe(404);
    expect(tabelas.ai_agent_versions![0]!.tool_ids).toEqual(["crm_search_products"]);
  });

  it("agente de OUTRA organização é 404 e a versão dele não é tocada", async () => {
    const s = servidorNoBanco();
    agentesNoBanco();
    tabelas.ai_agent_versions!.push({
      id: "77777777-7777-4777-8777-777777777777",
      organization_id: OUTRA_ORG,
      agent_id: AGENTE_DE_FORA,
      status: "draft",
      version_number: 1,
      tool_ids: [],
    });
    const r = await chamar("ferramentas", "PATCH", {
      id: String(s.id),
      corpo: { acao: "ligar", agente_id: AGENTE_DE_FORA, ferramenta: "cancelar_pedido" },
    });
    expect(r.status).toBe(404);
    expect(tabelas.ai_agent_versions![1]!.tool_ids).toEqual([]);
    expect(audit).not.toHaveBeenCalled();
  });

  it("agente sem rascunho: 409 mcp_sem_rascunho", async () => {
    const s = servidorNoBanco();
    agentesNoBanco();
    tabelas.ai_agent_versions = [];
    const r = await chamar("ferramentas", "PATCH", {
      id: String(s.id),
      corpo: { acao: "ligar", agente_id: AGENTE, ferramenta: "cancelar_pedido" },
    });
    expect(r.status).toBe(409);
    expect(r.corpo.error?.code).toBe("mcp_sem_rascunho");
  });

  it("servidor desativado não liga ferramenta nova (409), mas desligar continua possível", async () => {
    const s = servidorNoBanco({ ativo: false });
    agentesNoBanco();
    tabelas.ai_agent_versions![0]!.tool_ids = ["mcp_externo:loja:escrita:cancelar_pedido"];
    const liga = await chamar("ferramentas", "PATCH", {
      id: String(s.id),
      corpo: { acao: "ligar", agente_id: AGENTE, ferramenta: "buscar_pedido" },
    });
    expect(liga.status).toBe(409);
    const desliga = await chamar("ferramentas", "PATCH", {
      id: String(s.id),
      corpo: { acao: "desligar", agente_id: AGENTE, ferramenta: "cancelar_pedido" },
    });
    expect(desliga.status).toBe(200);
    expect(tabelas.ai_agent_versions![0]!.tool_ids).toEqual([]);
    expect(vi.mocked(audit).mock.calls.at(-1)![0]).toMatchObject({ action: "mcp.tool_disabled" });
  });

  it("corpo com campo desconhecido ou ação inválida: 422", async () => {
    const s = servidorNoBanco();
    agentesNoBanco();
    expect(
      (await chamar("ferramentas", "PATCH", { id: String(s.id), corpo: { acao: "ligar", agente_id: AGENTE, ferramenta: "x", organization_id: OUTRA_ORG } })).status,
    ).toBe(422);
    expect((await chamar("ferramentas", "PATCH", { id: String(s.id), corpo: { acao: "explodir" } })).status).toBe(422);
  });

  it("GET mostra o estado por agente: ligada, marca e liberada, sem chave", async () => {
    const s = servidorNoBanco();
    agentesNoBanco();
    tabelas.ai_agent_versions![0]!.tool_ids = ["mcp_externo:loja:escrita:cancelar_pedido"];
    tabelas.ai_agents![0]!.config = { mcp_externo_liberadas: ["mcp_externo:loja:escrita:cancelar_pedido"] };

    const r = await chamar("ferramentas", "GET", { id: String(s.id), busca: `?agente_id=${AGENTE}` });

    expect(r.status).toBe(200);
    expect(r.corpo.data).toMatchObject({ versao: "rascunho", modo_do_agente: "automatic" });
    const itens = r.corpo.data!.ferramentas as Array<Corpo>;
    expect(itens.find((f) => f.nome === "cancelar_pedido")).toMatchObject({ ligada: true, marca: "escrita", liberada_sem_aprovacao: true });
    expect(itens.find((f) => f.nome === "buscar_pedido")).toMatchObject({ ligada: false, liberada_sem_aprovacao: false });
    expect(r.texto).not.toContain(CHAVE);
  });
});

describe("AC-007.4: 'pode rodar sem aprovação' exige confirmação, só vale para escrita e deixa rastro", () => {
  const liberar = (id: string, extra: Corpo = {}, ferramenta = "cancelar_pedido") =>
    chamar("ferramentas", "PATCH", {
      id,
      corpo: { acao: "liberar_sem_aprovacao", agente_id: AGENTE, ferramenta, ...extra },
    });

  it("sem a confirmação explícita: 422 ai_confirmacao_exigida e nada grava", async () => {
    const s = servidorNoBanco();
    agentesNoBanco();
    const r = await liberar(String(s.id));
    expect(r.status).toBe(422);
    expect(r.corpo.error?.code).toBe("ai_confirmacao_exigida");
    expect(tabelas.ai_agents![0]!.config).toEqual({ rag_top_k: 7 });
    expect(audit).not.toHaveBeenCalled();
  });

  it("confirmação false também não vale", async () => {
    const s = servidorNoBanco();
    agentesNoBanco();
    expect((await liberar(String(s.id), { confirmar_sem_aprovacao: false })).status).toBe(422);
  });

  it("com a confirmação: grava em ai_agents.config sem perder o resto, avisa o modo e audita", async () => {
    const s = servidorNoBanco();
    agentesNoBanco();

    const r = await liberar(String(s.id), { confirmar_sem_aprovacao: true });

    expect(r.status).toBe(200);
    expect(tabelas.ai_agents![0]!.config).toEqual({
      rag_top_k: 7,
      mcp_externo_liberadas: ["mcp_externo:loja:escrita:cancelar_pedido"],
    });
    expect(r.corpo.data).toMatchObject({ liberada_sem_aprovacao: true, modo_do_agente: "automatic" });
    expect(vi.mocked(audit).mock.calls[0]![0]).toMatchObject({
      action: "mcp.tool_released_without_approval",
      actorUserId: USUARIO,
      organizationId: ORG,
      metadata: expect.objectContaining({ agente_id: AGENTE, ferramenta: "cancelar_pedido", servidor: "loja" }),
    });
  });

  it("ferramenta de LEITURA não recebe a marca (422)", async () => {
    const s = servidorNoBanco();
    agentesNoBanco();
    const r = await liberar(String(s.id), { confirmar_sem_aprovacao: true }, "buscar_pedido");
    expect(r.status).toBe(422);
    expect(tabelas.ai_agents![0]!.config).toEqual({ rag_top_k: 7 });
  });

  it("agente de outra organização: 404 e a config dele não muda", async () => {
    const s = servidorNoBanco();
    agentesNoBanco();
    const r = await chamar("ferramentas", "PATCH", {
      id: String(s.id),
      corpo: { acao: "liberar_sem_aprovacao", agente_id: AGENTE_DE_FORA, ferramenta: "cancelar_pedido", confirmar_sem_aprovacao: true },
    });
    expect(r.status).toBe(404);
    expect(tabelas.ai_agents![1]!.config).toEqual({});
  });

  it("voltar a exigir aprovação tira a marca e audita sem pedir confirmação", async () => {
    const s = servidorNoBanco();
    agentesNoBanco();
    tabelas.ai_agents![0]!.config = { rag_top_k: 7, mcp_externo_liberadas: ["mcp_externo:loja:escrita:cancelar_pedido"] };
    const r = await chamar("ferramentas", "PATCH", {
      id: String(s.id),
      corpo: { acao: "exigir_aprovacao", agente_id: AGENTE, ferramenta: "cancelar_pedido" },
    });
    expect(r.status).toBe(200);
    expect(tabelas.ai_agents![0]!.config).toEqual({ rag_top_k: 7, mcp_externo_liberadas: [] });
    expect(vi.mocked(audit).mock.calls[0]![0]).toMatchObject({ action: "mcp.tool_release_revoked" });
  });
});

// ─── Atualizar ferramentas ──────────────────────────────────────────────────

describe("AC-007.2/B2: 'atualizar ferramentas' é ação explícita e mostra o que mudou", () => {
  it("adota a lista nova, devolve o que mudou e audita só contagens", async () => {
    const s = servidorNoBanco();
    vi.mocked(listarFerramentasDoServidor).mockResolvedValueOnce([
      { name: "buscar_pedido", somenteLeitura: true },
      { name: "estornar" },
    ]);

    const r = await chamar("atualizar", "POST", { id: String(s.id), corpo: {} });

    expect(r.status).toBe(200);
    expect(r.corpo.data!.mudancas).toEqual({ novas: ["estornar"], removidas: ["cancelar_pedido"], alteradas: [] });
    expect((tabelas.mcp_servidores_externos![0]!.ferramentas as Array<{ name: string }>).map((f) => f.name)).toEqual([
      "buscar_pedido",
      "estornar",
    ]);
    const evento = vi.mocked(audit).mock.calls[0]![0];
    expect(evento).toMatchObject({ action: "mcp.tools_refreshed", metadata: { novas: 1, removidas: 1, alteradas: 0 } });
    expect(r.texto).not.toContain(CHAVE);
  });

  it("servidor fora do ar: 422 e a lista guardada fica", async () => {
    const s = servidorNoBanco();
    vi.mocked(listarFerramentasDoServidor).mockRejectedValueOnce(new Error(`caiu ${CHAVE}`));
    const r = await chamar("atualizar", "POST", { id: String(s.id), corpo: {} });
    expect(r.status).toBe(422);
    expect(r.texto).not.toContain(CHAVE);
    expect(tabelas.mcp_servidores_externos![0]!.ferramentas).toHaveLength(2);
  });

  it("servidor de outra organização: 404 sem chamar a rede", async () => {
    const alheio = servidorNoBanco({ slug: "alheio" }, OUTRA_ORG);
    const r = await chamar("atualizar", "POST", { id: String(alheio.id), corpo: {} });
    expect(r.status).toBe(404);
    expect(listarFerramentasDoServidor).not.toHaveBeenCalled();
  });

  it("corpo com algo além de um objeto vazio: 422", async () => {
    const s = servidorNoBanco();
    const r = await chamar("atualizar", "POST", { id: String(s.id), corpo: { aceitar: true } });
    expect(r.status).toBe(422);
    expect(listarFerramentasDoServidor).not.toHaveBeenCalled();
  });
});

describe("M2: atualizar ferramentas revoga 'sem aprovação' das ferramentas alteradas ou removidas", () => {
  const CANCELAR = "mcp_externo:loja:escrita:cancelar_pedido";
  const ESTORNAR = "mcp_externo:loja:escrita:estornar";
  const servidorComDuasDeEscrita = () =>
    servidorNoBanco({
      ferramentas: [
        { name: "buscar_pedido", somenteLeitura: true },
        { name: "cancelar_pedido", description: "Cancela" },
        { name: "estornar", description: "Estorna" },
      ],
    });
  const rede = (cancelar: Record<string, unknown> | null) =>
    vi.mocked(listarFerramentasDoServidor).mockResolvedValueOnce([
      { name: "buscar_pedido", somenteLeitura: true },
      ...(cancelar ? [{ name: "cancelar_pedido", ...cancelar }] : []),
      { name: "estornar", description: "Estorna" },
    ]);

  it("ferramenta ALTERADA perde a marca em todos os agentes da organização; a NÃO alterada mantém; o resto da config fica", async () => {
    const s = servidorComDuasDeEscrita();
    agentesNoBanco();
    tabelas.ai_agents![0]!.config = { rag_top_k: 7, mcp_externo_liberadas: [CANCELAR, ESTORNAR] };
    tabelas.ai_agents!.push({
      id: "88888888-8888-4888-8888-888888888888",
      organization_id: ORG,
      operation_mode: "automatic",
      config: { mcp_externo_liberadas: [CANCELAR] },
      published_version_id: null,
    });
    rede({ description: "Cancela e apaga o histórico" });

    const r = await chamar("atualizar", "POST", { id: String(s.id), corpo: {} });

    expect(r.status).toBe(200);
    expect(tabelas.ai_agents![0]!.config).toEqual({ rag_top_k: 7, mcp_externo_liberadas: [ESTORNAR] });
    expect(tabelas.ai_agents![2]!.config).toEqual({ mcp_externo_liberadas: [] });
    expect(r.corpo.data!.voltaram_a_pedir_aprovacao).toEqual(["cancelar_pedido"]);
  });

  it("ferramenta REMOVIDA também perde a marca", async () => {
    const s = servidorComDuasDeEscrita();
    agentesNoBanco();
    tabelas.ai_agents![0]!.config = { mcp_externo_liberadas: [CANCELAR, ESTORNAR] };
    rede(null);

    const r = await chamar("atualizar", "POST", { id: String(s.id), corpo: {} });

    expect(r.status).toBe(200);
    expect(tabelas.ai_agents![0]!.config).toEqual({ mcp_externo_liberadas: [ESTORNAR] });
    expect(r.corpo.data!.voltaram_a_pedir_aprovacao).toEqual(["cancelar_pedido"]);
  });

  it("nada mudou: nenhuma marca sai e nada volta a pedir aprovação", async () => {
    const s = servidorComDuasDeEscrita();
    agentesNoBanco();
    tabelas.ai_agents![0]!.config = { mcp_externo_liberadas: [CANCELAR, ESTORNAR] };
    rede({ description: "Cancela" });

    const r = await chamar("atualizar", "POST", { id: String(s.id), corpo: {} });

    expect(tabelas.ai_agents![0]!.config).toEqual({ mcp_externo_liberadas: [CANCELAR, ESTORNAR] });
    expect(r.corpo.data!.voltaram_a_pedir_aprovacao).toEqual([]);
    expect(vi.mocked(audit).mock.calls.map((c) => c[0].action)).toEqual(["mcp.tools_refreshed"]);
  });

  it("agente de OUTRA organização, mesmo com o mesmo identificador de servidor, não é tocado", async () => {
    const s = servidorComDuasDeEscrita();
    agentesNoBanco();
    tabelas.ai_agents![1]!.config = { mcp_externo_liberadas: [CANCELAR] };
    tabelas.ai_agents![0]!.config = { mcp_externo_liberadas: [CANCELAR] };
    rede({ description: "mudou" });

    await chamar("atualizar", "POST", { id: String(s.id), corpo: {} });

    expect(tabelas.ai_agents![1]!.config).toEqual({ mcp_externo_liberadas: [CANCELAR] });
    expect(tabelas.ai_agents![0]!.config).toEqual({ mcp_externo_liberadas: [] });
  });

  it("audita mcp.tool_release_revoked_on_refresh com a contagem e os nomes, sem valores", async () => {
    const s = servidorComDuasDeEscrita();
    agentesNoBanco();
    tabelas.ai_agents![0]!.config = { mcp_externo_liberadas: [CANCELAR] };
    rede({ description: "mudou" });

    await chamar("atualizar", "POST", { id: String(s.id), corpo: {} });

    const revogou = vi.mocked(audit).mock.calls.map((c) => c[0]).find((e) => e.action === "mcp.tool_release_revoked_on_refresh");
    expect(revogou).toMatchObject({
      organizationId: ORG,
      actorUserId: USUARIO,
      resourceId: s.id,
      metadata: { ferramentas: ["cancelar_pedido"], agentes: 1 },
    });
  });
});

describe("M5: 'sem aprovação' acompanha o ligar", () => {
  it("desligar a ferramenta também tira a marca de 'sem aprovação'", async () => {
    const s = servidorNoBanco();
    agentesNoBanco();
    tabelas.ai_agent_versions![0]!.tool_ids = ["mcp_externo:loja:escrita:cancelar_pedido"];
    tabelas.ai_agents![0]!.config = {
      rag_top_k: 7,
      mcp_externo_liberadas: ["mcp_externo:loja:escrita:cancelar_pedido"],
    };

    const r = await chamar("ferramentas", "PATCH", {
      id: String(s.id),
      corpo: { acao: "desligar", agente_id: AGENTE, ferramenta: "cancelar_pedido" },
    });

    expect(r.status).toBe(200);
    expect(tabelas.ai_agents![0]!.config).toEqual({ rag_top_k: 7, mcp_externo_liberadas: [] });
    expect(r.corpo.data).toMatchObject({ ligada: false, liberada_sem_aprovacao: false });
    expect(vi.mocked(audit).mock.calls.map((c) => c[0].action)).toContain("mcp.tool_release_revoked");
  });

  it("desligar uma ferramenta sem marca não mexe na config do agente", async () => {
    const s = servidorNoBanco();
    agentesNoBanco();
    tabelas.ai_agent_versions![0]!.tool_ids = ["mcp_externo:loja:escrita:cancelar_pedido"];

    await chamar("ferramentas", "PATCH", {
      id: String(s.id),
      corpo: { acao: "desligar", agente_id: AGENTE, ferramenta: "cancelar_pedido" },
    });

    expect(tabelas.ai_agents![0]!.config).toEqual({ rag_top_k: 7 });
  });
});

describe("M7: o id da ferramenta cabe no limite do nome exposto ao modelo", () => {
  it("nome que, somado ao identificador do servidor, passa de 64: 422 e nada grava", async () => {
    const longo = "a".repeat(61); // 'loja' (4) + '__' (2) + 61 = 67
    const s = servidorNoBanco({ ferramentas: [{ name: longo }] });
    agentesNoBanco();

    const r = await chamar("ferramentas", "PATCH", {
      id: String(s.id),
      corpo: { acao: "ligar", agente_id: AGENTE, ferramenta: longo },
    });

    expect(r.status).toBe(422);
    expect(tabelas.ai_agent_versions![0]!.tool_ids).toEqual(["crm_search_products"]);
  });

  it("nome no limite exato (64 no total) liga", async () => {
    const justo = "a".repeat(58); // 4 + 2 + 58 = 64
    const s = servidorNoBanco({ ferramentas: [{ name: justo }] });
    agentesNoBanco();

    const r = await chamar("ferramentas", "PATCH", {
      id: String(s.id),
      corpo: { acao: "ligar", agente_id: AGENTE, ferramenta: justo },
    });

    expect(r.status).toBe(200);
  });
});

// ─── AC-008.2: varredura de segredo ─────────────────────────────────────────

describe("AC-008.2: nenhuma resposta nem auditoria carrega a credencial", () => {
  it("varre as respostas e a auditoria de todo o ciclo", async () => {
    const respostas: string[] = [];
    const criado = await chamar("lista", "POST", { corpo: NOVO });
    respostas.push(criado.texto);
    const id = String(criado.corpo.data!.id);
    agentesNoBanco();
    respostas.push((await chamar("lista", "GET")).texto);
    respostas.push(
      (await chamar("ferramentas", "PATCH", { id, corpo: { acao: "ligar", agente_id: AGENTE, ferramenta: "cancelar_pedido" } })).texto,
    );
    respostas.push(
      (
        await chamar("ferramentas", "PATCH", {
          id,
          corpo: { acao: "liberar_sem_aprovacao", agente_id: AGENTE, ferramenta: "cancelar_pedido", confirmar_sem_aprovacao: true },
        })
      ).texto,
    );
    respostas.push((await chamar("ferramentas", "GET", { id, busca: `?agente_id=${AGENTE}` })).texto);
    respostas.push((await chamar("atualizar", "POST", { id, corpo: {} })).texto);
    respostas.push((await chamar("item", "DELETE", { id })).texto);

    for (const texto of respostas) expect(texto).not.toContain(CHAVE);
    expect(JSON.stringify(vi.mocked(audit).mock.calls)).not.toContain(CHAVE);
    expect(vi.mocked(audit).mock.calls.length).toBe(5);
  });
});
