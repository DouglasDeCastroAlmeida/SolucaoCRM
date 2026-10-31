/**
 * Mudança 003, Fatia 5: o cadastro por MARCA com a cobrança ligada. A action
 * lê os planos DA MARCA do endereço e recusa, antes do GoTrue, o que o gatilho
 * da migration 0725 recusaria depois. Marca com a chave desligada: o caminho de
 * antes (planos da instalação, `brand_id` nulo).
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

import { headers } from "next/headers";
import { createClient } from "@/lib/supabase/server";
import { bancoFalso, filtros, type Cadeia, type Resposta } from "@/tests/helpers/banco-falso-da-cobranca";
import { MARCA_PADRAO_EMBUTIDA, type Brand } from "@/lib/brands/tipos";

const h = vi.hoisted(() => ({ marca: null as unknown, banco: null as unknown }));

vi.mock("@/lib/supabase/admin", () => ({ createAdminClient: () => (h.banco as { cliente: unknown }).cliente }));
vi.mock("next/headers", () => ({ headers: vi.fn() }));
vi.mock("@/lib/supabase/server", () => ({ createClient: vi.fn() }));
vi.mock("@/lib/instalacao/modulos", () => ({ moduloLigado: vi.fn(async () => true) }));
vi.mock("@/lib/branding/marca-do-pedido", () => ({ marcaDoPedido: async () => ({ brand: h.marca }) }));
vi.mock("@/lib/auth/cadastro-da-marca", () => ({ modoDeCadastroDaMarca: async () => "aberto" }));
vi.mock("@/lib/auth/rate-limit", () => ({ authRateLimited: async () => false, AUTH_LIMITS: { signup: {} } }));
vi.mock("@/lib/audit", async (orig) => ({ ...(await orig<Record<string, unknown>>()), audit: vi.fn(async () => undefined) }));

import { signUp } from "./signUp";

const MARCA = "7b1c0000-0000-4000-8000-00000000000a";
const DA_MARCA = "11111111-1111-4111-8111-111111111111";
const PADRAO_DA_MARCA = "22222222-2222-4222-8222-222222222222";
const DA_INSTALACAO = "33333333-3333-4333-8333-333333333333";

type Plano = { id: string; brand_id: string | null; oferecido_ao_cliente: boolean; padrao_no_cadastro: boolean };
const plano = (id: string, brand_id: string | null, padrao = false): Plano => ({ id, brand_id, oferecido_ao_cliente: true, padrao_no_cadastro: padrao });

/** Aplica os filtros da cadeia sobre as linhas de verdade: filtro que sumir deixa o teste vermelho. */
function bancoDeMarca(opcoes: { cobra: boolean; planos: Plano[] }) {
  return bancoFalso((c: Cadeia): Resposta => {
    if (c.tabela === "brands") return { data: { id: MARCA, cobranca_ligada: opcoes.cobra } };
    if (c.tabela !== "cobranca_planos") return {};
    let linhas = [...opcoes.planos];
    for (const [metodo, coluna, valor] of filtros(c)) {
      if (metodo === "eq" || metodo === "is") linhas = linhas.filter((p) => ((p as Record<string, unknown>)[coluna as string] ?? null) === valor);
    }
    const unico = c.passos.some((p) => p.metodo === "maybeSingle");
    if (unico) return { data: linhas[0] ? { id: linhas[0].id } : null };
    return { data: linhas.map((p) => ({ id: p.id, nome: "Plano", preco_cents: 4990, intervalo: "mes", trial_dias: 7 })) };
  });
}

const signUpDoProvedor = vi.fn();
let n = 0;
const entrada = (plano?: string) => ({
  org_name: "Plata Iphones",
  email: `marca-${++n}-${Date.now()}@exemplo.test`,
  password: "SenhaForte!2026",
  password_confirm: "SenhaForte!2026",
  ...(plano ? { cobranca_plan_id: plano } : {}),
});
const recusa = (motivo: string) => ({ ok: false, error: "validation_error", details: { cobranca_plan_id: [motivo] } });
const lerPlanos = () =>
  (h.banco as ReturnType<typeof bancoFalso>).cadeias.filter((c) => c.tabela === "cobranca_planos");

beforeEach(() => {
  vi.clearAllMocks();
  h.marca = { ...MARCA_PADRAO_EMBUTIDA, id: MARCA, slug: "corretor", is_default: false, cadastro_aberto: true } satisfies Brand;
  signUpDoProvedor.mockResolvedValue({ data: { user: { id: "u-1" }, session: null }, error: null });
  vi.mocked(headers).mockResolvedValue({ get: () => null } as never);
  vi.mocked(createClient).mockResolvedValue({ auth: { signUp: signUpDoProvedor } } as never);
});

describe("signUp — cadastro por marca com a cobrança ligada", () => {
  it("AC-001.1: marca com a chave desligada lê só os planos da instalação e não enxerga o plano de marca", async () => {
    h.banco = bancoDeMarca({ cobra: false, planos: [plano(DA_INSTALACAO, null, true), plano(DA_MARCA, MARCA, true)] });
    expect(await signUp(entrada(DA_MARCA))).toEqual(recusa("plano_indisponivel"));
    expect(lerPlanos().every((c) => filtros(c).some((f) => f[0] === "is" && f[1] === "brand_id" && f[2] === null))).toBe(true);
    expect(signUpDoProvedor).not.toHaveBeenCalled();
  });

  it("AC-001.1: marca com a chave desligada segue o caminho de antes (plano da instalação passa)", async () => {
    h.banco = bancoDeMarca({ cobra: false, planos: [plano(DA_INSTALACAO, null, true)] });
    expect((await signUp(entrada(DA_INSTALACAO))).ok).toBe(true);
    expect(signUpDoProvedor.mock.calls[0]?.[0]?.options?.data).toMatchObject({ cobranca_plan_id: DA_INSTALACAO, brand_id: MARCA });
  });

  it("AC-001.2: marca que cobra, plano escolhido é da marca: passa e plano e marca atravessam na metadata", async () => {
    h.banco = bancoDeMarca({ cobra: true, planos: [plano(DA_MARCA, MARCA), plano(PADRAO_DA_MARCA, MARCA, true), plano(DA_INSTALACAO, null, true)] });
    expect((await signUp(entrada(DA_MARCA))).ok).toBe(true);
    expect(signUpDoProvedor.mock.calls[0]?.[0]?.options?.data).toMatchObject({ cobranca_plan_id: DA_MARCA, brand_id: MARCA });
    expect(lerPlanos().every((c) => filtros(c).some((f) => f[0] === "eq" && f[1] === "brand_id" && f[2] === MARCA))).toBe(true);
  });

  it("AC-001.2: marca que cobra recusa o plano da instalação como indisponível, sem criar conta", async () => {
    h.banco = bancoDeMarca({ cobra: true, planos: [plano(PADRAO_DA_MARCA, MARCA, true), plano(DA_INSTALACAO, null, true)] });
    expect(await signUp(entrada(DA_INSTALACAO))).toEqual(recusa("plano_indisponivel"));
    expect(signUpDoProvedor).not.toHaveBeenCalled();
  });

  it("AC-001.2: marca que cobra, sem escolha e com padrão da marca: passa sem plano na metadata", async () => {
    h.banco = bancoDeMarca({ cobra: true, planos: [plano(PADRAO_DA_MARCA, MARCA, true)] });
    expect((await signUp(entrada())).ok).toBe(true);
    expect(signUpDoProvedor.mock.calls[0]?.[0]?.options?.data).not.toHaveProperty("cobranca_plan_id");
  });

  it("AC-001.2: marca que cobra, oferecido e sem padrão e sem escolha: plano_obrigatorio", async () => {
    h.banco = bancoDeMarca({ cobra: true, planos: [plano(DA_MARCA, MARCA)] });
    expect(await signUp(entrada())).toEqual(recusa("plano_obrigatorio"));
    expect(signUpDoProvedor).not.toHaveBeenCalled();
  });

  it("AC-001.2: marca que cobra e sem plano nenhum: cobranca_marca_sem_plano (nunca nasce isenta), sem criar conta", async () => {
    h.banco = bancoDeMarca({ cobra: true, planos: [plano(DA_INSTALACAO, null, true)] });
    expect(await signUp(entrada())).toEqual(recusa("cobranca_marca_sem_plano"));
    expect(signUpDoProvedor).not.toHaveBeenCalled();
  });
});
