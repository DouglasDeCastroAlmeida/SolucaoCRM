/**
 * Repositório admin de marcas + cópia de pacote, contra um banco em memória que
 * imita o que importa do Postgres: UNIQUE (23505) em slug/host e jsonb por valor.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

type Linha = Record<string, unknown>;
const h = vi.hoisted(() => ({
  tabelas: {} as Record<string, Linha[]>,
  unicos: {
    brands: ["slug"],
    brand_domains: ["host"],
    vertical_packs: ["slug"],
  } as Record<string, string[]>,
  invalidar: vi.fn(),
  seq: 0,
  ultimoOr: "",
}));

vi.mock("@/lib/branding/marca-do-host", () => ({ invalidarMarcaDoHost: h.invalidar }));
vi.mock("@/lib/supabase/admin", () => ({
  createAdminClient: () => ({ from: (t: string) => consulta(t), rpc: rpcCopiarPacote }),
}));

/**
 * Emula fn_copiar_pacote_para_org (migration 0718): UM único passo que só grava
 * a chave quando ela ainda não existe. A atomicidade real é provada em
 * tests/invariants/marcas-pacote-atomico.test.ts, contra o Postgres.
 */
async function rpcCopiarPacote(nome: string, args: { p_org_id: string; p_brand_id: string }) {
  if (nome !== "fn_copiar_pacote_para_org") return { data: null, error: { code: "42883" } };
  const marca = (h.tabelas.brands ?? []).find((b) => b.id === args.p_brand_id);
  const pack = (h.tabelas.vertical_packs ?? []).find((p) => p.id === marca?.default_pack_id);
  const org = (h.tabelas.organizations ?? []).find((o) => o.id === args.p_org_id);
  if (!marca || !pack || pack.status !== "active" || !org) return { data: false, error: null };
  const settings = (org.settings ?? {}) as Record<string, unknown>;
  if ("vertical_pack" in settings) return { data: false, error: null };
  org.settings = {
    ...settings,
    vertical_pack: JSON.parse(
      JSON.stringify({ pack_id: pack.id, slug: pack.slug, version: pack.version, seed: pack.seed, copiado_em: "agora" }),
    ),
  };
  return { data: true, error: null };
}

function consulta(tabela: string) {
  let op: "select" | "insert" | "update" | "delete" = "select";
  let payload: Linha = {};
  const filtros: Array<[string, unknown]> = [];
  let limite = Infinity;
  const linhas = () => (h.tabelas[tabela] ??= []);
  const casa = (l: Linha) => filtros.every(([k, v]) => l[k] === v);

  function executar(): { data: Linha[] | null; error: { code: string; message: string } | null } {
    if (op === "insert") {
      for (const col of h.unicos[tabela] ?? []) {
        if (linhas().some((l) => String(l[col]) === String(payload[col]))) {
          return { data: null, error: { code: "23505", message: "duplicate" } };
        }
      }
      const nova = { id: `id-${++h.seq}`, version: 1, status: "active", ...JSON.parse(JSON.stringify(payload)) };
      linhas().push(nova);
      return { data: [nova], error: null };
    }
    const alvo = linhas().filter(casa);
    if (op === "update") {
      for (const l of alvo) Object.assign(l, JSON.parse(JSON.stringify(payload)));
      return { data: alvo, error: null };
    }
    if (op === "delete") {
      h.tabelas[tabela] = linhas().filter((l) => !casa(l));
      return { data: alvo, error: null };
    }
    return { data: alvo.slice(0, limite), error: null };
  }

  const c: Record<string, unknown> = {
    select: () => c,
    insert: (p: Linha) => ((op = "insert"), (payload = p), c),
    update: (p: Linha) => ((op = "update"), (payload = p), c),
    delete: () => ((op = "delete"), c),
    eq: (k: string, v: unknown) => (filtros.push([k, v]), c),
    order: () => c,
    or: (f: string) => ((h.ultimoOr = f), c),
    limit: (n: number) => ((limite = n), c),
    maybeSingle: async () => {
      const r = executar();
      return { data: r.data?.[0] ?? null, error: r.error };
    },
    single: async () => {
      const r = executar();
      return { data: r.data?.[0] ?? null, error: r.error };
    },
    then: (res: (v: unknown) => unknown) => res(executar()),
  };
  return c;
}

import {
  adicionarDominio,
  criarMarca,
  criarPacote,
  criarPlano,
  desativarMarca,
  editarMarca,
  editarPacote,
  ErroDeMarca,
  listarContasComMarca,
  removerDominio,
} from "@/lib/brands/admin-repo";
import { copiarPacoteParaOrganizacao } from "@/lib/brands/pacote";

beforeEach(() => {
  h.invalidar.mockClear();
  h.seq = 0;
  h.tabelas = {
    partners: [{ id: "p1", slug: "plataforma" }],
    brands: [{ id: "b-padrao", slug: "padrao", is_default: true, status: "active" }],
    brand_domains: [],
    brand_plans: [],
    vertical_packs: [],
    organizations: [],
  };
});

describe("AC-008.1: marcas", () => {
  it("AC-008.1: cria marca (parceiro padrão) e desativa sem apagar; a padrão é protegida; cache invalidado", async () => {
    const m = await criarMarca({ slug: "clinica", name: "Clínica" });
    expect(m).toMatchObject({ slug: "clinica", partner_id: "p1", is_default: false });

    await adicionarDominio(String(m.id), "app.clinica.com.br", "proprio");
    h.invalidar.mockClear();
    const off = await desativarMarca(String(m.id));
    expect(off.status).toBe("inactive");
    expect(h.tabelas.brands).toHaveLength(2);
    expect(h.invalidar).toHaveBeenCalledWith("app.clinica.com.br");

    await expect(desativarMarca("b-padrao")).rejects.toMatchObject({ code: "brand_default_protected" });
  });
});

describe("AC-008.2: domínios", () => {
  it("AC-008.2: domínio duplicado devolve 409 e repetir o clique não duplica", async () => {
    const m = await criarMarca({ slug: "imob", name: "Imob" });
    await adicionarDominio(String(m.id), "imob.exemplo.com.br", "subdominio");
    const erro = await adicionarDominio(String(m.id), "imob.exemplo.com.br", "subdominio").catch((e) => e);
    expect(erro).toBeInstanceOf(ErroDeMarca);
    expect(erro).toMatchObject({ code: "brand_domain_exists", status: 409 });
    expect(h.tabelas.brand_domains).toHaveLength(1);
  });

  it("AC-008.2: remover domínio libera o endereço e invalida o cache", async () => {
    const m = await criarMarca({ slug: "x", name: "X" });
    const d = await adicionarDominio(String(m.id), "x.exemplo.com.br", "proprio");
    await removerDominio(String(m.id), String(d.id));
    expect(h.tabelas.brand_domains).toHaveLength(0);
    expect(h.invalidar).toHaveBeenLastCalledWith("x.exemplo.com.br");
  });
});

describe("AC-008.3: planos", () => {
  it("AC-008.3: salva plano por marca em centavos sem tocar em nada de cobrança", async () => {
    const m = await criarMarca({ slug: "pl", name: "Pl" });
    const plano = await criarPlano(String(m.id), {
      name: "Pro", limits: { usuarios: 5 }, price_cents: 9900, currency: "BRL", cycle: "monthly",
    });
    expect(plano).toMatchObject({ brand_id: m.id, price_cents: 9900 });
    // Só a tabela de planos recebeu escrita: nenhuma tabela de cobrança foi tocada.
    const tocadas = Object.keys(h.tabelas).filter((t) => (h.tabelas[t] ?? []).length > 0);
    expect(tocadas.sort()).toEqual(["brand_plans", "brands", "partners"]);
  });
});

describe("AC-008.4: pacotes verticais", () => {
  async function marcaComPacote() {
    const pack = await criarPacote({ slug: "clinica", name: "Clínica", seed: { etapas: ["a", "b"] } });
    const marca = await criarMarca({ slug: "m", name: "M", default_pack_id: pack.id });
    h.tabelas.organizations!.push({ id: "o1", settings: { llm: "x" }, brand_id: marca.id });
    h.tabelas.organizations!.push({ id: "o2", settings: {}, brand_id: marca.id });
    return { pack, marca };
  }

  it("AC-008.4: copia o pacote para a organização criada na marca que o usa, sem perder o resto das configurações", async () => {
    const { marca } = await marcaComPacote();
    expect(await copiarPacoteParaOrganizacao("o1", String(marca.id))).toBe(true);
    const settings = h.tabelas.organizations![0]!.settings as Record<string, unknown>;
    expect(settings.llm).toBe("x");
    expect(settings.vertical_pack).toMatchObject({ slug: "clinica", version: 1, seed: { etapas: ["a", "b"] } });
  });

  it("AC-008.4: mudar o pacote depois não afeta a organização (e sobe a versão do pacote)", async () => {
    const { pack, marca } = await marcaComPacote();
    await copiarPacoteParaOrganizacao("o1", String(marca.id));
    await editarPacote(String(pack.id), { seed: { etapas: ["z"] } });
    const copia = (h.tabelas.organizations![0]!.settings as { vertical_pack: { seed: unknown; version: number } }).vertical_pack;
    expect(copia.seed).toEqual({ etapas: ["a", "b"] });
    expect(copia.version).toBe(1);
    expect(h.tabelas.vertical_packs![0]!.version).toBe(2);
  });

  it("AC-008.4: mexer na cópia da organização não afeta o pacote; segunda cópia não sobrescreve", async () => {
    const { pack, marca } = await marcaComPacote();
    await copiarPacoteParaOrganizacao("o1", String(marca.id));
    const copia = (h.tabelas.organizations![0]!.settings as { vertical_pack: { seed: { etapas: string[] } } }).vertical_pack;
    copia.seed.etapas.push("so-da-org");
    expect(h.tabelas.vertical_packs!.find((p) => p.id === pack.id)!.seed).toEqual({ etapas: ["a", "b"] });
    expect(await copiarPacoteParaOrganizacao("o1", String(marca.id))).toBe(false);
  });

  it("AC-008.4: marca sem pacote padrão ou organização sem marca não copia nada", async () => {
    const m = await criarMarca({ slug: "sem", name: "Sem" });
    h.tabelas.organizations!.push({ id: "o9", settings: {}, brand_id: m.id });
    expect(await copiarPacoteParaOrganizacao("o9", String(m.id))).toBe(false);
    expect(await copiarPacoteParaOrganizacao("o9", null)).toBe(false);
  });
});

describe("AC-008.1: pacote padrão inexistente", () => {
  it("AC-008.1: editar ou criar marca com default_pack_id que não existe dá 404, não 500", async () => {
    const m = await criarMarca({ slug: "pk", name: "Pk" });
    await expect(editarMarca(String(m.id), { default_pack_id: "nao-existe" })).rejects.toMatchObject({ code: "not_found", status: 404 });
    await expect(criarMarca({ slug: "pk2", name: "Pk2", default_pack_id: "nao-existe" })).rejects.toMatchObject({ status: 404 });
    const pack = await criarPacote({ slug: "ok", name: "Ok", seed: {} });
    await expect(editarMarca(String(m.id), { default_pack_id: pack.id })).resolves.toMatchObject({ default_pack_id: pack.id });
  });
});

describe("AC-008.5: lista de contas", () => {
  it("AC-008.5: curingas do ilike (_, %, barra) são escapados no filtro q", async () => {
    await listarContasComMarca({ limit: 5, q: "a_b%c\\d,(x)" });
    expect(h.ultimoOr).toBe("name.ilike.%a\\_b\\%c\\\\dx%,slug.ilike.%a\\_b\\%c\\\\dx%");
  });

  it("AC-008.5: devolve contas de todas as marcas com a marca de cada uma", async () => {
    h.tabelas.organizations!.push(
      { id: "o1", name: "A", brand_id: "b-padrao", brands: { name: "padrao" } },
      { id: "o2", name: "B", brand_id: "b2", brands: { name: "Outra" } },
    );
    const lista = await listarContasComMarca({ limit: 50 });
    expect(lista).toHaveLength(2);
    expect(lista.map((l) => l.brand_id)).toEqual(["b-padrao", "b2"]);
    expect((await listarContasComMarca({ limit: 50, brandId: "b2" })).map((l) => l.id)).toEqual(["o2"]);
  });
});
