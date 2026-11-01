import { beforeEach, describe, expect, it, vi } from "vitest";

import { argumentos, bancoFalso, filtros, operacao, type BancoFalso, type Cadeia, type Resposta } from "@/tests/helpers/banco-falso-da-cobranca";

vi.mock("@/lib/logger", () => ({ logger: { warn: vi.fn(), error: vi.fn(), info: vi.fn() } }));

import { PRAZO_DA_REVISAO_DE_EXCLUSAO_DIAS, TIPO_DO_AVISO_DE_EXCLUSAO, avisarContasParaRevisarExclusao } from "./exclusao-pendente";

/** 01/02/2027 09:00 em São Paulo. */
const AGORA = new Date("2027-02-01T12:00:00Z");
const ha = (dias: number, hora = 12) => new Date(Date.UTC(2027, 1, 1 - dias, hora)).toISOString();

interface Assinatura {
  organization_id: string;
  estado: string;
  proximo_vencimento: string | null;
  vencida_desde: string | null;
  trial_ate: string | null;
}
const base = (org: string, p: Partial<Assinatura>): Assinatura => ({
  organization_id: org, estado: "cancelada", proximo_vencimento: null, vencida_desde: null, trial_ate: null, ...p,
});

interface Mundo {
  assinaturas: Assinatura[];
  orgs: Array<{ id: string; status: string }>;
  jaAvisadas: string[];
  falhaNoInsert: boolean;
}
let m: Mundo;
let banco: BancoFalso;

function responder(c: Cadeia): Resposta {
  if (c.tabela === "cobranca_assinaturas") return { data: m.assinaturas };
  if (c.tabela === "organizations") return { data: m.orgs };
  if (c.tabela === "incidents") {
    if (operacao(c) === "insert") return m.falhaNoInsert ? { error: { code: "XX000", message: "x" } } : { data: null };
    return { data: m.jaAvisadas.map((organization_id) => ({ organization_id })) };
  }
  return {};
}
const inserts = () => banco.cadeias.filter((c) => c.tabela === "incidents" && operacao(c) === "insert");
const gravados = () => inserts().flatMap((c) => argumentos(c, "insert")?.[0] as Array<Record<string, unknown>>);
const rodar = () => avisarContasParaRevisarExclusao(banco.cliente as never, () => AGORA);

beforeEach(() => {
  m = { assinaturas: [], orgs: [], jaAvisadas: [], falhaNoInsert: false };
  banco = bancoFalso(responder);
});
const ativas = (...ids: string[]) => (m.orgs = ids.map((id) => ({ id, status: "suspended" })));

describe("aviso para revisar a exclusão da conta cancelada (AC-005.6)", () => {
  it("AC-005.6: o prazo é de 90 dias", () => {
    expect(PRAZO_DA_REVISAO_DE_EXCLUSAO_DIAS).toBe(90);
  });

  it("AC-005.6: ⭐ cancelou depois de pagar: 90 dias depois do fim do período pago, a plataforma é avisada, uma vez", async () => {
    m.assinaturas = [base("org-pagou", { proximo_vencimento: ha(90) })];
    ativas("org-pagou");
    expect(await rodar()).toBe(1);
    expect(gravados()).toEqual([
      expect.objectContaining({
        organization_id: "org-pagou",
        type: TIPO_DO_AVISO_DE_EXCLUSAO,
        severity: "info",
        payload: expect.objectContaining({ acao: "revisar_exclusao", desde: ha(90), dias: 90 }),
      }),
    ]);
  });

  it("AC-005.6: ⭐ cancelou no trial: conta os 90 dias do fim do trial (a dívida nasce em trial_ate)", async () => {
    m.assinaturas = [base("org-trial", { vencida_desde: ha(90), trial_ate: ha(90) })];
    ativas("org-trial");
    expect(await rodar()).toBe(1);
    expect(gravados()[0]).toMatchObject({ organization_id: "org-trial", payload: { desde: ha(90) } });
  });

  it("AC-005.6: com 89 dias ainda não avisa", async () => {
    m.assinaturas = [base("org-cedo", { proximo_vencimento: ha(89) })];
    ativas("org-cedo");
    expect(await rodar()).toBe(0);
    expect(inserts()).toEqual([]);
  });

  it("AC-005.6: a data é civil de São Paulo: fim às 23:00 locais de 03/11 (02:00 UTC de 04/11) já completa 90 dias em 01/02", async () => {
    m.assinaturas = [base("org-noite", { proximo_vencimento: "2026-11-04T02:00:00Z" })];
    ativas("org-noite");
    expect(await rodar()).toBe(1);
  });

  it("AC-005.6: ⭐ nunca repete: quem já foi avisado (qualquer situação do aviso) fica de fora", async () => {
    m.assinaturas = [base("org-velha", { proximo_vencimento: ha(200) })];
    ativas("org-velha");
    m.jaAvisadas = ["org-velha"];
    expect(await rodar()).toBe(0);
    expect(inserts()).toEqual([]);
  });

  it("AC-005.6: só conta cancelada: ativa, em atraso e trial não geram aviso", async () => {
    m.assinaturas = [base("a", { estado: "ativa", proximo_vencimento: ha(200) })];
    await rodar();
    const leitura = banco.cadeias.find((c) => c.tabela === "cobranca_assinaturas")!;
    expect(filtros(leitura)).toContainEqual(["eq", "estado", "cancelada"]);
  });

  it("AC-005.6: organização já redigida ou arquivada não é avisada de novo", async () => {
    m.assinaturas = [base("org-redigida", { proximo_vencimento: ha(120) })];
    m.orgs = [{ id: "org-redigida", status: "redacted" }];
    expect(await rodar()).toBe(0);
  });

  it("AC-005.6: sem nenhuma data de fim conhecida não há como contar: não avisa", async () => {
    m.assinaturas = [base("org-sem-data", {})];
    ativas("org-sem-data");
    expect(await rodar()).toBe(0);
  });

  it("AC-005.6: nada destrutivo: só lê e insere o aviso, nunca atualiza nem apaga", async () => {
    m.assinaturas = [base("org-pagou", { proximo_vencimento: ha(95) })];
    ativas("org-pagou");
    await rodar();
    expect(banco.cadeias.map(operacao).filter((o) => o !== "select" && o !== "insert")).toEqual([]);
    expect(banco.rpcs).toEqual([]);
  });

  it("falha ao gravar o aviso: não lança e não conta (a próxima rodada tenta de novo)", async () => {
    m.assinaturas = [base("org-pagou", { proximo_vencimento: ha(95) })];
    ativas("org-pagou");
    m.falhaNoInsert = true;
    expect(await rodar()).toBe(0);
  });
});
