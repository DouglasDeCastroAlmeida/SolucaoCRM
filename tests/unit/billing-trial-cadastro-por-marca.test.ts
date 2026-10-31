/**
 * Mudança 003, Fatia 5 (T-018/T-021): o provisionamento do cadastro por MARCA.
 * `ensureTenantForUser` repassa marca e plano ao banco, e o plano que chega ao
 * gatilho da 0725 é o da própria marca. Marca com a chave desligada: o insert é
 * o de antes (nenhuma leitura de plano, metadata repassada como veio).
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

import { argumentos, bancoFalso, operacao, type BancoFalso, type Cadeia, type Resposta } from "@/tests/helpers/banco-falso-da-cobranca";
import { MARCA_PADRAO_EMBUTIDA, type Brand } from "@/lib/brands/tipos";

const h = vi.hoisted(() => ({ banco: undefined as unknown as BancoFalso, modulo: true }));
vi.mock("@/lib/supabase/admin", () => ({ createAdminClient: () => h.banco.cliente }));
vi.mock("@/lib/instalacao/modulos", () => ({ moduloLigado: async () => h.modulo }));
vi.mock("@/lib/audit", () => ({ audit: vi.fn() }));
vi.mock("@/lib/brands/pacote", () => ({ copiarPacoteParaOrganizacao: vi.fn(async () => true) }));

import { ensureTenantForUser } from "@/lib/auth/provision";

const MARCA = "7b1c0000-0000-4000-8000-00000000000a";
const DA_MARCA = "11111111-1111-4111-8111-111111111111";
const PADRAO_DA_MARCA = "22222222-2222-4222-8222-222222222222";
const DA_INSTALACAO = "33333333-3333-4333-8333-333333333333";

const marca: Brand = { ...MARCA_PADRAO_EMBUTIDA, id: MARCA, slug: "corretor", name: "Corretor", is_default: false, cadastro_aberto: true };
const usuario = (plano?: string) => ({
  id: "u-1",
  email: "a@exemplo.test",
  user_metadata: { org_name: "Imob Alfa", ...(plano ? { cobranca_plan_id: plano } : {}) },
});

type Plano = { id: string; brand_id: string | null; oferecido_ao_cliente: boolean; padrao_no_cadastro: boolean };
const plano = (id: string, brand_id: string | null, padrao = false): Plano => ({ id, brand_id, oferecido_ao_cliente: true, padrao_no_cadastro: padrao });

function mundo(o: { cobra: boolean; planos?: Plano[]; erroNaMarca?: boolean }) {
  h.banco = bancoFalso((c: Cadeia): Resposta => {
    if (c.tabela === "brands") return o.erroNaMarca ? { error: { code: "57014", message: "x" } } : { data: { id: MARCA, cobranca_ligada: o.cobra } };
    if (c.tabela === "cobranca_planos") {
      let linhas = [...(o.planos ?? [])];
      for (const p of c.passos) {
        if (p.metodo === "eq" || p.metodo === "is") {
          linhas = linhas.filter((l) => ((l as Record<string, unknown>)[p.args[0] as string] ?? null) === p.args[1]);
        }
      }
      if (c.passos.some((p) => p.metodo === "maybeSingle")) return { data: linhas[0] ? { id: linhas[0].id } : null };
      return { data: linhas.map((l) => ({ id: l.id, nome: "P", preco_cents: 4990, intervalo: "mes", trial_dias: 7 })) };
    }
    if (c.tabela === "organizations") return { data: { id: "org-nova", slug: "imob-alfa" } };
    return {};
  });
}
const insertDaOrg = () => {
  const c = h.banco.cadeias.find((x) => x.tabela === "organizations" && operacao(x) === "insert");
  return c ? (argumentos(c, "insert")?.[0] as Record<string, unknown>) : undefined;
};

beforeEach(() => {
  h.modulo = true;
});

describe("ensureTenantForUser — cadastro por marca com a cobrança ligada", () => {
  it("AC-001.2: a organização nasce com a marca e com o plano escolhido DA MARCA", async () => {
    mundo({ cobra: true, planos: [plano(DA_MARCA, MARCA), plano(PADRAO_DA_MARCA, MARCA, true)] });
    await ensureTenantForUser(usuario(DA_MARCA), { source: "signup", brand: marca });
    expect(insertDaOrg()).toMatchObject({ brand_id: MARCA, settings: { cobranca_signup_plan_id: DA_MARCA } });
  });

  it("AC-001.2: plano de outra marca (ou da instalação) cai no padrão da marca", async () => {
    mundo({ cobra: true, planos: [plano(PADRAO_DA_MARCA, MARCA, true), plano(DA_INSTALACAO, null, true)] });
    await ensureTenantForUser(usuario(DA_INSTALACAO), { source: "signup", brand: marca });
    expect(insertDaOrg()).toMatchObject({ settings: { cobranca_signup_plan_id: PADRAO_DA_MARCA } });
  });

  it("AC-001.2: sem escolha, vale o padrão da marca", async () => {
    mundo({ cobra: true, planos: [plano(PADRAO_DA_MARCA, MARCA, true)] });
    await ensureTenantForUser(usuario(), { source: "signup", brand: marca });
    expect(insertDaOrg()).toMatchObject({ brand_id: MARCA, settings: { cobranca_signup_plan_id: PADRAO_DA_MARCA } });
  });

  it("AC-001.2: marca que cobra sem plano nenhum recusa com cobranca_marca_sem_plano, antes de criar a organização", async () => {
    mundo({ cobra: true, planos: [plano(DA_INSTALACAO, null, true)] });
    await expect(ensureTenantForUser(usuario(), { source: "signup", brand: marca })).rejects.toThrow(/cobranca_marca_sem_plano/);
    expect(insertDaOrg()).toBeUndefined();
  });

  it("AC-001.2: marca que cobra com plano oferecido, sem padrão e sem escolha, recusa com plano_obrigatorio", async () => {
    mundo({ cobra: true, planos: [plano(DA_MARCA, MARCA)] });
    await expect(ensureTenantForUser(usuario(), { source: "signup", brand: marca })).rejects.toThrow(/plano_obrigatorio/);
    expect(insertDaOrg()).toBeUndefined();
  });

  it("AC-001.1: marca com a chave desligada: o insert é o de antes (metadata repassada como veio, nenhum plano lido)", async () => {
    mundo({ cobra: false, planos: [plano(PADRAO_DA_MARCA, MARCA, true)] });
    await ensureTenantForUser(usuario(DA_INSTALACAO), { source: "signup", brand: marca });
    expect(insertDaOrg()).toMatchObject({ brand_id: MARCA, settings: { cobranca_signup_plan_id: DA_INSTALACAO } });
    expect(h.banco.cadeias.some((c) => c.tabela === "cobranca_planos")).toBe(false);
  });

  it("AC-001.1: módulo da instalação desligado: igual a chave desligada", async () => {
    h.modulo = false;
    mundo({ cobra: true, planos: [] });
    await ensureTenantForUser(usuario(), { source: "signup", brand: marca });
    expect(insertDaOrg()).toBeDefined();
    expect(h.banco.cadeias.some((c) => c.tabela === "cobranca_planos")).toBe(false);
  });

  it("leitura da marca que falha não derruba o cadastro: o gatilho do banco segue sendo a autoridade", async () => {
    mundo({ cobra: true, erroNaMarca: true });
    await ensureTenantForUser(usuario(DA_MARCA), { source: "signup", brand: marca });
    expect(insertDaOrg()).toMatchObject({ settings: { cobranca_signup_plan_id: DA_MARCA } });
  });
});
