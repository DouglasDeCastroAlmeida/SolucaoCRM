/**
 * GET /api/v1/mcp-acoes — lista as ações PENDENTES de servidor MCP externo da organização da
 * sessão (mudança 006, AC-007.3): é por ela que a Central sabe o id de cada ação a aprovar.
 * Nunca devolve os argumentos.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

import { requireRole } from "@/lib/auth/require-role";

vi.mock("@/lib/auth/require-role", () => ({ requireRole: vi.fn() }));
vi.mock("@/lib/supabase/server", () => ({ createClient: vi.fn() }));

const ORG = "22222222-2222-4222-8222-222222222222";
const OUTRA = "33333333-3333-4333-8333-333333333333";
const CONVERSA = "44444444-4444-4444-8444-444444444444";
const USUARIO = "11111111-1111-4111-8111-111111111111";

interface Linha {
  id: string;
  organization_id: string;
  conversa_id: string | null;
  ferramenta: string;
  estado: string;
  criado_em: string;
  argumentos: unknown;
  argumentos_hash: string;
  mcp_servidores_externos: { nome: string; slug: string } | null;
}

const BANCO: Linha[] = [
  {
    id: "a1",
    organization_id: ORG,
    conversa_id: CONVERSA,
    ferramenta: "cancelar_pedido",
    estado: "pendente",
    criado_em: "2026-10-28T10:00:00Z",
    argumentos: { cpf: "00000000000" },
    argumentos_hash: "h1",
    mcp_servidores_externos: { nome: "Loja", slug: "loja" },
  },
  {
    id: "a2",
    organization_id: ORG,
    conversa_id: null,
    ferramenta: "criar_pedido",
    estado: "pendente",
    criado_em: "2026-10-28T11:00:00Z",
    argumentos: { x: 1 },
    argumentos_hash: "h2",
    mcp_servidores_externos: { nome: "Loja", slug: "loja" },
  },
  {
    id: "a3",
    organization_id: OUTRA,
    conversa_id: CONVERSA,
    ferramenta: "outra",
    estado: "pendente",
    criado_em: "2026-10-28T12:00:00Z",
    argumentos: {},
    argumentos_hash: "h3",
    mcp_servidores_externos: { nome: "De outra org", slug: "x" },
  },
  {
    id: "a4",
    organization_id: ORG,
    conversa_id: CONVERSA,
    ferramenta: "ja_feita",
    estado: "executada",
    criado_em: "2026-10-28T09:00:00Z",
    argumentos: {},
    argumentos_hash: "h4",
    mcp_servidores_externos: { nome: "Loja", slug: "loja" },
  },
];

const consultas: { colunas: string; filtros: Array<[string, unknown]>; limite?: number }[] = [];

/** Um banco de mentira que APLICA os filtros pedidos: o que não for filtrado, vaza. */
function fakeAdmin() {
  return {
    from(tabela: string) {
      expect(tabela).toBe("mcp_acoes_pendentes");
      const registro = { colunas: "", filtros: [] as Array<[string, unknown]>, limite: undefined as number | undefined };
      consultas.push(registro);
      const builder = {
        select(colunas: string) {
          registro.colunas = colunas;
          return builder;
        },
        eq(coluna: string, valor: unknown) {
          registro.filtros.push([coluna, valor]);
          return builder;
        },
        order() {
          return builder;
        },
        limit(n: number) {
          registro.limite = n;
          return builder;
        },
        then(resolve: (v: unknown) => void) {
          let linhas = BANCO.filter((l) =>
            registro.filtros.every(([c, v]) => (l as unknown as Record<string, unknown>)[c] === v),
          );
          linhas = [...linhas].sort((a, b) => (a.criado_em < b.criado_em ? 1 : -1));
          resolve({ data: linhas, error: null });
        },
      };
      return builder;
    },
  };
}
vi.mock("@/lib/supabase/admin", () => ({ createAdminClient: vi.fn(() => fakeAdmin()) }));

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

async function get(query = "") {
  const { GET } = await import("@/app/api/v1/mcp-acoes/route");
  const res = await GET(new NextRequest(`http://localhost/api/v1/mcp-acoes${query}`));
  return { status: res.status, corpo: (await res.json()) as { data: Array<Record<string, unknown>>; error?: { code: string } }, res };
}

beforeEach(() => {
  consultas.length = 0;
  comPapel("manager");
});

describe("AC-007.3: GET /api/v1/mcp-acoes", () => {
  it("AC-007.3: papel abaixo de gerente recebe 403 e nada é lido", async () => {
    comPapel("agent");
    const r = await get();
    expect(r.status).toBe(403);
    expect(consultas).toHaveLength(0);
  });

  it("AC-007.3: lista só as pendentes da organização da SESSÃO, sem ver a de outra organização", async () => {
    const r = await get();
    expect(r.status).toBe(200);
    expect(r.corpo.data.map((a) => a.id)).toEqual(["a2", "a1"]);
    expect(consultas[0]!.filtros).toContainEqual(["organization_id", ORG]);
    expect(consultas[0]!.filtros).toContainEqual(["estado", "pendente"]);
    expect(consultas[0]!.limite).toBe(50);
    expect(r.res.headers.get("X-Request-Id")).toBeTruthy();
  });

  it("AC-007.3: devolve só id, servidor, ferramenta, criado_em, conversa_id e estado, nunca os argumentos", async () => {
    const r = await get();
    expect(r.corpo.data[1]).toEqual({
      id: "a1",
      servidor: { nome: "Loja", slug: "loja" },
      ferramenta: "cancelar_pedido",
      criado_em: "2026-10-28T10:00:00Z",
      conversa_id: CONVERSA,
      estado: "pendente",
    });
    const texto = JSON.stringify(r.corpo);
    expect(texto).not.toContain("argumentos");
    expect(texto).not.toContain("00000000000");
    expect(consultas[0]!.colunas).not.toMatch(/argumentos/);
  });

  it("AC-007.3: filtra por conversa", async () => {
    const r = await get(`?conversa_id=${CONVERSA}`);
    expect(r.corpo.data.map((a) => a.id)).toEqual(["a1"]);
    expect(consultas[0]!.filtros).toContainEqual(["conversa_id", CONVERSA]);
  });

  it("AC-007.3: conversa_id que não é uuid é recusado", async () => {
    const r = await get("?conversa_id=nao-e-uuid");
    expect(r.status).toBe(422);
    expect(consultas).toHaveLength(0);
  });
});
