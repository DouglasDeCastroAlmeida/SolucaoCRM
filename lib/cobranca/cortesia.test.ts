/**
 * Mudança 003, Fatia 7 (T-028): CORTESIA = organização sem linha em
 * `cobranca_assinaturas` (ADR-003). AC-002.2: cron, rodada, régua e webhook não
 * a avisam, atrasam nem suspendem. Usa o código real da rodada, da régua e do
 * handler; só o banco, o e-mail e a auditoria são dublês.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

import { bancoFalso, operacao, type BancoFalso, type Cadeia, type Resposta } from "@/tests/helpers/banco-falso-da-cobranca";

const h = vi.hoisted(() => ({ audit: vi.fn(), email: vi.fn(), banco: undefined as unknown as { cliente: unknown } }));
vi.mock("@/lib/audit", () => ({ audit: h.audit }));
vi.mock("@/lib/cobranca/emails", () => ({ enviarAvisoAosAdmins: h.email }));
vi.mock("@/lib/cobranca/configuracao", () => ({ toleranciaDias: async () => 7, provedorDaInstalacao: async () => "asaas" }));
vi.mock("@/lib/cobranca/exclusao-pendente", () => ({ avisarContasParaRevisarExclusao: async () => 0 }));
vi.mock("@/lib/logger", () => ({ logger: { warn: vi.fn(), error: vi.fn(), info: vi.fn() } }));
vi.mock("@/lib/supabase/admin", () => ({ createAdminClient: () => h.banco.cliente }));

import { cobrancaSinalHandler } from "@/lib/cobranca/sinal.handler";
import { rodadaDaCobranca } from "@/lib/cobranca/rodada";
import { aplicarRegua, sincronizar } from "@/lib/cobranca/sincronizar";

const ORG = "cccccccc-0000-4000-8000-000000000001";
let banco: BancoFalso;

// A org existe (e está operante), mas NÃO tem linha em cobranca_assinaturas.
function responder(c: Cadeia): Resposta {
  if (c.tabela === "organizations") return { data: [{ id: ORG, status: "active", locale: "pt-BR" }] };
  return { data: c.passos.some((p) => p.metodo === "maybeSingle") ? null : [] };
}

beforeEach(() => {
  vi.clearAllMocks();
  banco = bancoFalso(responder, () => ({ data: [] }));
  h.banco = banco;
});

const escritasFeitas = () => banco.cadeias.filter((c) => operacao(c) !== "select");
const rpcsDeEfeito = () => banco.rpcs.map((r) => r.nome).filter((n) => n !== "fn_cobranca_reconciliaveis");

describe("cortesia (organização sem assinatura)", () => {
  it("AC-002.2: a rodada da cobrança não avisa, não atrasa nem suspende", async () => {
    const r = await rodadaDaCobranca(banco.cliente as never);
    expect(r).toMatchObject({ relidas: 0, falhas: 0, avisos: 0, suspensas: 0, reativadas: 0, canceladas: 0 });
    expect(escritasFeitas()).toEqual([]);
    expect(rpcsDeEfeito()).toEqual([]);
    expect(h.email).not.toHaveBeenCalled();
  });

  it("AC-002.2: a régua devolve nada e nada é escrito", async () => {
    expect(await aplicarRegua(banco.cliente as never, ORG)).toBe("nada");
    expect(escritasFeitas()).toEqual([]);
    expect(rpcsDeEfeito()).toEqual([]);
  });

  it("AC-002.2: a rotina de sincronização a trata como isenta", async () => {
    expect(await sincronizar(banco.cliente as never, ORG)).toEqual({ tipo: "isenta" });
    expect(escritasFeitas()).toEqual([]);
  });

  it("AC-002.2: o webhook do provedor é ignorado como org_isenta", async () => {
    const r = await cobrancaSinalHandler.handle({ id: "e1", organization_id: ORG } as never);
    expect(r).toMatchObject({ status: "skipped", detail: "org_isenta" });
    expect(escritasFeitas()).toEqual([]);
  });
});
