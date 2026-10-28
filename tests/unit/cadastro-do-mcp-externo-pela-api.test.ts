// @vitest-environment node
/**
 * A cerca `cadastro-do-mcp-externo-e-o-platform-admin`, no desenho novo da ADR-004 (mudança 006):
 * as rotas /api/v1/mcp-servidores são cadastradas pelo administrador da ORGANIZAÇÃO só quando a
 * chave `MCP_EXTERNO_ADMIN_DA_ORG` está ligada; desligada (padrão de fábrica), só o administrador da
 * INSTALAÇÃO, pela mesma regra (`regraPlatformAdmin`) que a Server Action do cadastro antigo.
 *
 * A cerca antiga (`cadastro-do-mcp-externo-e-o-platform-admin.test.ts`) continua valendo, sem
 * mudar uma linha, para a Server Action: o cadastro legado segue só do dono da instalação.
 */
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

import { beforeEach, describe, expect, it, vi } from "vitest";

const estado = vi.hoisted(() => ({
  ligada: false,
  usuario: null as Record<string, unknown> | null,
  regra: { ok: true } as { ok: true } | { ok: false; codigo: "forbidden" | "upstream_unavailable" | "mfa_required" },
}));

vi.mock("@/lib/env", () => ({
  env: {
    get MCP_EXTERNO_ADMIN_DA_ORG() {
      return estado.ligada;
    },
  },
}));
vi.mock("@/lib/auth/server", () => ({ loadAuthUser: vi.fn(async () => estado.usuario) }));
vi.mock("@/lib/extensions/http", () => ({
  regraPlatformAdmin: vi.fn(async (user: unknown) => (estado.regra.ok ? { ok: true, user } : estado.regra)),
}));
vi.mock("@/lib/auth/require-role", () => ({
  requireRole: vi.fn(async () => ({
    ok: true,
    user: estado.usuario,
    org: { orgId: "org-da-sessao", name: "Org", role: "admin" },
  })),
}));

import { requireRole } from "@/lib/auth/require-role";
import { loadAuthUser } from "@/lib/auth/server";
import { exigirAdminDeServidoresMcp } from "@/lib/mcp/servidor-externo/quem-administra";

beforeEach(() => {
  vi.clearAllMocks();
  estado.ligada = false;
  estado.usuario = { id: "u1", idioma: "pt-BR", is_platform_admin: false, support: null };
  estado.regra = { ok: true };
});

async function codigo(r: Awaited<ReturnType<typeof exigirAdminDeServidoresMcp>>) {
  if (r.ok) return null;
  return ((await r.response.json()) as { error: { code: string } }).error.code;
}

describe("chave MCP_EXTERNO_ADMIN_DA_ORG desligada (padrão): só o dono da instalação", () => {
  it("o dono da instalação passa, e o papel da organização continua sendo conferido", async () => {
    const r = await exigirAdminDeServidoresMcp("req-1");
    expect(r.ok).toBe(true);
    expect(requireRole).toHaveBeenCalledWith("admin", expect.objectContaining({ requestId: "req-1", allowPlatformAdmin: true }));
  });

  it("admin de organização que NÃO é dono da instalação é recusado, sem consultar a organização", async () => {
    estado.regra = { ok: false, codigo: "forbidden" };
    const r = await exigirAdminDeServidoresMcp("req-1");
    expect(await codigo(r)).toBe("forbidden_role");
    expect(requireRole).not.toHaveBeenCalled();
  });

  it("sem sessão: 401", async () => {
    estado.usuario = null;
    const r = await exigirAdminDeServidoresMcp("req-1");
    expect(await codigo(r)).toBe("unauthenticated");
  });

  it("a verificação em duas etapas da plataforma e a falha ao conferir viram recusas próprias", async () => {
    estado.regra = { ok: false, codigo: "mfa_required" };
    expect(await codigo(await exigirAdminDeServidoresMcp("r"))).toBe("mfa_required");
    estado.regra = { ok: false, codigo: "upstream_unavailable" };
    expect(await codigo(await exigirAdminDeServidoresMcp("r"))).toBe("upstream_unavailable");
    expect(requireRole).not.toHaveBeenCalled();
  });
});

describe("chave MCP_EXTERNO_ADMIN_DA_ORG ligada: o admin da organização cadastra na própria organização", () => {
  it("passa pelo papel `admin` da organização, sem exigir ser dono da instalação", async () => {
    estado.ligada = true;
    const r = await exigirAdminDeServidoresMcp("req-2");
    expect(r.ok).toBe(true);
    expect(requireRole).toHaveBeenCalledWith(
      "admin",
      expect.objectContaining({ requestId: "req-2", resource: "mcp_servidores", allowPlatformAdmin: true }),
    );
    // Com a chave ligada o dono da instalação não é consultado: o papel da organização decide.
    expect(loadAuthUser).not.toHaveBeenCalled();
    if (r.ok) expect(r.org.orgId).toBe("org-da-sessao");
  });

  it("quem não é admin da organização é recusado pelo mesmo gate de papel", async () => {
    estado.ligada = true;
    vi.mocked(requireRole).mockResolvedValueOnce({
      ok: false,
      response: new Response(JSON.stringify({ error: { code: "forbidden_role" } }), { status: 403 }) as never,
    });
    expect(await codigo(await exigirAdminDeServidoresMcp("r"))).toBe("forbidden_role");
  });
});

// ─── A cerca estrutural: toda rota nova passa pelo guarda ───────────────────

function rotas(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((e) =>
    e.isDirectory() ? rotas(join(dir, e.name)) : e.name === "route.ts" ? [join(dir, e.name)] : [],
  );
}

describe("toda rota /api/v1/mcp-servidores usa o guarda de papel e não confia no corpo", () => {
  const arquivos = rotas("app/api/v1/mcp-servidores");

  it("controle positivo: a varredura enxerga as 4 rotas", () => {
    expect(arquivos).toHaveLength(4);
  });

  it.each(arquivos)("%s: guarda de papel, sem requireRole solto, sem organization_id do corpo", (arquivo) => {
    const fonte = readFileSync(arquivo, "utf8");
    expect(fonte).toContain("exigirAdminDeServidoresMcp(");
    expect(fonte).not.toMatch(/requireRole\(/);
    // A organização é a da sessão: nenhuma rota lê organization_id de corpo ou de query.
    expect(fonte).not.toMatch(/corpo(\.data)?\.organization_id|searchParams\.get\(["']organization_id/);
  });

  it("o guarda existe e a chave está em lib/env.ts desligada de fábrica", () => {
    const env = readFileSync("lib/env.ts", "utf8");
    expect(env).toMatch(/MCP_EXTERNO_ADMIN_DA_ORG:\s*z\s*\.enum\(\["true", "false"\]\)\s*\.optional\(\)\s*\.default\("false"\)/);
    expect(readFileSync(".env.example", "utf8")).toMatch(/^MCP_EXTERNO_ADMIN_DA_ORG=false$/m);
  });
});
