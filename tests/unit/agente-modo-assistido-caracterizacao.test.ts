/**
 * Caracterização do modo "aprovar antes de enviar" (modo `assisted`) — mudança 006, REQ-003.
 *
 * O modo já existia (migration 0066-era de `ai_reply_drafts`); a 006 só muda o PADRÃO. Estes
 * testes FIXAM o que ele faz hoje para que a mudança de padrão não o erosione. A parte de
 * comportamento do motor (rascunho em vez de envio, travas) já tem teste próprio:
 * `assistido-respeita-o-gate.test.ts` e `assistido-roda-as-deteccoes.test.ts`. O que o
 * baseline instala (o que o cliente tem) é lido pela ÚLTIMA definição de cada função, nunca
 * pela primeira (CLAUDE.md, Migrations, item 10).
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

import { requireRole } from "@/lib/auth/require-role";
import { createAdminClient } from "@/lib/supabase/admin";

vi.mock("@/lib/auth/require-role", () => ({ requireRole: vi.fn() }));
vi.mock("@/lib/supabase/server", () => ({ createClient: vi.fn() }));
vi.mock("@/lib/supabase/admin", () => ({ createAdminClient: vi.fn() }));
vi.mock("@/lib/audit", () => ({ audit: vi.fn(async () => undefined) }));
vi.mock("@/lib/impersonate/support", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/impersonate/support")>()),
  requireSupportWrite: vi.fn(async () => null),
}));

const RAIZ = process.cwd();
const BASELINE = readFileSync(join(RAIZ, "supabase/baseline.sql"), "utf8");

/** Corpo da ÚLTIMA definição de `public.<nome>` (o apêndice vence o dump). */
function ultimaDefinicao(nome: string): string {
  const i = BASELINE.lastIndexOf(`create or replace function public.${nome}`);
  expect(i, `função ${nome} não encontrada no baseline`).toBeGreaterThan(-1);
  return BASELINE.slice(i, BASELINE.indexOf("$$;", BASELINE.indexOf("$$", i + 40) + 2) + 3);
}

const ORG = "22222222-2222-4222-8222-222222222222";
const AGENTE = "55555555-5555-4555-8555-555555555555";

describe("AC-003.2: o agente que se liga pela primeira vez nasce em 'aprovar antes de enviar'", () => {
  it("AC-003.2: o padrão de ai_agents.operation_mode no baseline instalado é 'assisted'", () => {
    const todas = [...BASELINE.matchAll(/alter column operation_mode set default '(\w+)'/g)];
    expect(todas.length).toBeGreaterThan(0);
    expect(todas[todas.length - 1]![1]).toBe("assisted");
  });

  it("AC-003.2: o onboarding e a primeira publicação não escolhem 'automatic' por conta própria", () => {
    for (const arq of [
      "app/actions/onboarding/createDefaultAgent.ts",
      "lib/ai/agents/first-publication.ts",
    ]) {
      const fonte = readFileSync(join(RAIZ, arq), "utf8");
      expect(fonte, arq).not.toMatch(/operation_mode\s*:\s*["']automatic["']/);
    }
  });
});

describe("AC-003.3: a resposta redigida fica pendente e só sai depois da aprovação", () => {
  const acao = ultimaDefinicao("fn_reply_action");

  it("AC-003.3: aprovar exige o rascunho pendente na revisão que a pessoa viu (senão, recusa)", () => {
    expect(acao).toMatch(/d\.status<>'pending'/);
    expect(acao).toMatch(/d\.revision::text is distinct from p_revision/);
    expect(acao).toMatch(/raise exception 'reply_stale' using errcode='PT409'/);
  });

  it("AC-003.3: só o ramo 'approve' põe o envio na fila (rejeitar nunca enfileira)", () => {
    const rejeitar = acao.slice(acao.indexOf("p_action='reject'"), acao.indexOf("elsif p_action='approve'"));
    expect(rejeitar).not.toMatch(/job_queue/);
    const aprovar = acao.slice(acao.indexOf("elsif p_action='approve'"));
    expect(aprovar).toMatch(/insert into public\.job_queue[^;]*'approved_reply'/);
  });

  it("AC-003.3: o que sai é o texto APROVADO e ele muda a revisão; texto diferente depois exige nova aprovação", () => {
    const aprovar = acao.slice(acao.indexOf("elsif p_action='approve'"));
    expect(aprovar).toMatch(/approved_body=p_body/);
    expect(aprovar).toMatch(/revision=revision\+1/);
    // Só repetir EXATAMENTE a mesma aprovação (mesma pessoa, mesmo texto) é idempotente;
    // qualquer outro texto cai na checagem de rascunho pendente e é recusado como 'reply_stale'.
    expect(acao).toMatch(
      /d\.status in\('approved','sending','sent'\) and p_action='approve' and d\.approved_by=auth\.uid\(\) and d\.approved_body=p_body then return d\.send_job_id/,
    );
    const entrega = ultimaDefinicao("fn_reply_delivery_policy");
    expect(entrega).toMatch(/'body',d\.approved_body/);
    expect(entrega).not.toMatch(/'body',d\.edited_body/);
  });
});

describe("AC-003.7: desligar o agente para o envio e preserva as respostas pendentes", () => {
  it("AC-003.7: mudar pausa/modo do agente muda a operation_revision, e o rascunho só vale na revisão em que nasceu", () => {
    const gatilho = ultimaDefinicao("fn_reply_agent_revision");
    expect(gatilho).toMatch(/new\.paused_at/);
    expect(gatilho).toMatch(/new\.operation_mode/);
    const atual = ultimaDefinicao("fn_reply_context_current");
    expect(atual).toMatch(/a\.operation_revision=d\.operation_revision/);
    // O envio já aprovado e ainda na fila também confere o contexto antes de sair.
    expect(ultimaDefinicao("fn_reply_delivery_policy")).toMatch(/fn_reply_context_current\(p_org,d\.id\)/);
  });

  it("AC-003.7: nada no gatilho de revisão apaga ou reescreve as respostas pendentes", () => {
    const gatilho = ultimaDefinicao("fn_reply_agent_revision");
    expect(gatilho).not.toMatch(/ai_reply_drafts/);
    expect(gatilho).not.toMatch(/\bdelete\b/i);
  });

  describe("pela rota", () => {
    const tocadas: string[] = [];
    let gravado: Record<string, unknown> | null = null;

    function admin() {
      const linha = {
        id: AGENTE,
        organization_id: ORG,
        operation_mode: "assisted",
        paused_at: null,
        published_version_id: "66666666-6666-4666-8666-666666666666",
        config: {},
      };
      const q = (op: "select" | "update", patch?: Record<string, unknown>) => {
        const enc = {
          select: () => enc,
          eq: () => enc,
          maybeSingle: async () => ({ data: linha, error: null }),
          single: async () => {
            if (op === "update") gravado = patch ?? {};
            return { data: { ...linha, ...patch }, error: null };
          },
        };
        return enc;
      };
      return {
        from: (tabela: string) => {
          tocadas.push(tabela);
          return {
            select: () => q("select"),
            update: (p: Record<string, unknown>) => q("update", p),
            delete: () => {
              throw new Error("a rota não pode apagar nada ao pausar");
            },
          };
        },
      };
    }

    beforeEach(() => {
      vi.clearAllMocks();
      tocadas.length = 0;
      gravado = null;
    });

    it("AC-003.7: pausar grava só paused_at em ai_agents e não toca nas respostas pendentes", async () => {
      vi.mocked(requireRole).mockResolvedValue({
        ok: true,
        user: { id: "11111111-1111-4111-8111-111111111111" },
        org: { orgId: ORG, name: "Org", role: "admin" as const },
      } as never);
      vi.mocked(createAdminClient).mockReturnValue(admin() as never);
      const { PATCH } = await import("@/app/api/v1/ai/agents/[id]/route");
      const agora = new Date().toISOString();
      const res = await PATCH(
        new NextRequest(`http://localhost/api/v1/ai/agents/${AGENTE}`, {
          method: "PATCH",
          body: JSON.stringify({ paused_at: agora }),
          headers: { "content-type": "application/json" },
        }),
        { params: Promise.resolve({ id: AGENTE }) } as never,
      );
      expect(res.status).toBe(200);
      expect(gravado).toEqual({ paused_at: agora });
      expect(new Set(tocadas)).toEqual(new Set(["ai_agents"]));
    });
  });
});
