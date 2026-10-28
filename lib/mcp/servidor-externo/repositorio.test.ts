/**
 * T-028: repositório de servidores MCP externos (vários por organização).
 * AC-007.1, AC-007.2, AC-007.8, AC-007.9 e a parte de segredo do AC-008.1.
 *
 * O banco é um fake em memória na fronteira (PostgREST); a rede é a fronteira
 * `listar`. O que se prova é o comportamento observável do repositório.
 */
import { beforeEach, describe, expect, it, vi, type Mock } from "vitest";

vi.hoisted(() => {
  process.env.AI_CRED_AES_KEY = "iBc1Z2gYaAH4rEHs1dHQ2dvNQ6t4OfrdE1/Y6OSvtZY=";
});

import type { SupabaseClient } from "@supabase/supabase-js";

import type { FerramentaRemota } from "./chamada";
import type { ServidorMcpExterno } from "./registro";
import { escolhasRemotas, lerToolIdRemoto, toolIdAceito, toolIdRemoto } from "./ids";
import {
  cadastrarServidor,
  ErroDeServidorMcp,
  listarServidores,
  obterFerramentasDoServidor,
  resolverFerramentasDoAgente,
  VALIDADE_DAS_FERRAMENTAS_MS,
} from "./repositorio";
import { definirFerramentasDosServidores } from "@/lib/mcp/tools/externo";
import { cifrarChaveMcpExterno } from "./segredo";

const ORG = "bcc12320-f555-4fef-8d90-38a0ac5950e0";
const OUTRA_ORG = "11111111-2222-4333-8444-555555555555";
const CHAVE = "chave-secreta-do-erp-9999";

// ─── Fake do PostgREST ──────────────────────────────────────────────────────

type Linha = Record<string, unknown> & { id: string; organization_id: string; slug: string };

interface Operacao {
  tipo: "select" | "insert" | "update";
  filtros: Record<string, unknown>;
}

function bancoFalso(inicial: Linha[] = []) {
  const linhas: Linha[] = inicial.map((l) => ({ ...l }));
  const operacoes: Operacao[] = [];
  let seq = 0;

  function construtor(tabela: string) {
    if (tabela !== "mcp_servidores_externos") throw new Error(`tabela inesperada: ${tabela}`);
    const filtros: Record<string, unknown> = {};
    let tipo: Operacao["tipo"] = "select";
    let payload: Record<string, unknown> = {};
    let devolveLinha = false;

    const corresponde = (l: Linha) => Object.entries(filtros).every(([k, v]) => l[k] === v);

    const executar = (): { data: unknown; error: { code: string; message: string } | null } => {
      operacoes.push({ tipo, filtros: { ...filtros } });
      if (tipo === "insert") {
        const repetida = linhas.some(
          (l) => l.organization_id === payload.organization_id && l.slug === payload.slug,
        );
        if (repetida) return { data: null, error: { code: "23505", message: "duplicate key" } };
        seq += 1;
        const nova = {
          id: `00000000-0000-4000-8000-${String(seq).padStart(12, "0")}`,
          ativo: true,
          ferramentas: [],
          ferramentas_em: null,
          created_at: "2026-10-28T00:00:00Z",
          ...payload,
        } as unknown as Linha;
        linhas.push(nova);
        return { data: nova, error: null };
      }
      if (tipo === "update") {
        const alvo = linhas.filter(corresponde);
        alvo.forEach((l) => Object.assign(l, payload));
        return { data: alvo[0] ?? null, error: null };
      }
      return { data: linhas.filter(corresponde), error: null };
    };

    const api = {
      select: () => {
        if (tipo !== "select") devolveLinha = true;
        return api;
      },
      insert: (p: Record<string, unknown>) => {
        tipo = "insert";
        payload = p;
        return api;
      },
      update: (p: Record<string, unknown>) => {
        tipo = "update";
        payload = p;
        return api;
      },
      eq: (k: string, v: unknown) => {
        filtros[k] = v;
        return api;
      },
      order: () => api,
      single: async () => executar(),
      maybeSingle: async () => {
        const r = executar();
        const d = Array.isArray(r.data) ? (r.data[0] ?? null) : r.data;
        return { data: d, error: r.error };
      },
      then: (ok: (v: unknown) => unknown, ko?: (e: unknown) => unknown) => {
        void devolveLinha;
        return Promise.resolve(executar()).then(ok, ko);
      },
    };
    return api;
  }

  const supabase = { from: construtor } as unknown as SupabaseClient;
  return { supabase, linhas, operacoes };
}

function linhaDeServidor(
  slug: string,
  extra: Partial<Record<string, unknown>> = {},
  org: string = ORG,
): Linha {
  const cifrada = cifrarChaveMcpExterno(CHAVE);
  return {
    id: crypto.randomUUID(),
    organization_id: org,
    slug,
    nome: `Servidor ${slug}`,
    endpoint: `https://${slug}.erp.exemplo/mcp`,
    chave_encrypted: cifrada.mcp_externo_chave_encrypted,
    chave_iv: cifrada.mcp_externo_chave_iv,
    chave_tag: cifrada.mcp_externo_chave_tag,
    chave_last4: cifrada.mcp_externo_chave_last4,
    ferramentas: [],
    ferramentas_em: null,
    ativo: true,
    created_at: "2026-10-28T00:00:00Z",
    ...extra,
  };
}

const LEITURA: FerramentaRemota = { name: "buscar_pedido", somenteLeitura: true };
const ESCRITA: FerramentaRemota = { name: "cancelar_pedido" };

const resolverPublico = async () => ["93.184.216.34"];

let listar: Mock<(servidor: ServidorMcpExterno) => Promise<FerramentaRemota[]>>;
beforeEach(() => {
  listar = vi.fn(async (_servidor: ServidorMcpExterno) => [LEITURA, ESCRITA]);
});

// ─── ids ────────────────────────────────────────────────────────────────────

describe("AC-007.9: ids de ferramenta, formato novo e antigo", () => {
  it("AC-007.9: o formato antigo continua válido e não aponta servidor", () => {
    expect(lerToolIdRemoto("mcp_externo:leitura:buscar_pedido")).toEqual({
      nome: "buscar_pedido",
      leitura: true,
    });
  });

  it("AC-007.2: o formato novo traz o servidor e é o inverso de toolIdRemoto", () => {
    const id = toolIdRemoto("buscar_pedido", "escrita", "loja-a");
    expect(id).toBe("mcp_externo:loja-a:escrita:buscar_pedido");
    expect(lerToolIdRemoto(id)).toEqual({ servidor: "loja-a", nome: "buscar_pedido", leitura: false });
  });

  it("AC-007.9: toolIdAceito aceita os dois formatos e recusa slug inválido", () => {
    const catalogo = new Set<string>();
    expect(toolIdAceito("mcp_externo:leitura:x", catalogo)).toBe(true);
    expect(toolIdAceito("mcp_externo:loja-a:leitura:x", catalogo)).toBe(true);
    expect(toolIdAceito("mcp_externo:Loja A:leitura:x", catalogo)).toBe(false);
    expect(toolIdAceito("mcp_externo:loja-a:talvez:x", catalogo)).toBe(false);
  });

  it("AC-007.8: o mesmo nome em servidores diferentes são duas escolhas", () => {
    const escolhas = escolhasRemotas([
      "mcp_externo:loja-a:leitura:buscar",
      "mcp_externo:loja-b:leitura:buscar",
    ]);
    expect(escolhas.map((e) => e.servidor)).toEqual(["loja-a", "loja-b"]);
  });
});

// ─── cadastro ───────────────────────────────────────────────────────────────

describe("AC-007.1: cadastrar valida o destino, testa e lista as ferramentas", () => {
  it("AC-007.1: endereço http é recusado antes de qualquer rede", async () => {
    const { supabase, linhas } = bancoFalso();
    await expect(
      cadastrarServidor(
        supabase,
        ORG,
        { slug: "loja", nome: "Loja", endpoint: "http://erp.exemplo/mcp", chave: CHAVE },
        { resolver: resolverPublico, listar },
      ),
    ).rejects.toMatchObject({ codigo: "ai_http_nao_permitido" });
    expect(listar).not.toHaveBeenCalled();
    expect(linhas).toHaveLength(0);
  });

  it("AC-007.1: endereço que resolve para IP interno é recusado", async () => {
    const { supabase, linhas } = bancoFalso();
    await expect(
      cadastrarServidor(
        supabase,
        ORG,
        { slug: "loja", nome: "Loja", endpoint: "https://erp.exemplo/mcp", chave: CHAVE },
        { resolver: async () => ["10.0.0.5"], listar },
      ),
    ).rejects.toMatchObject({ codigo: "ai_destino_proibido" });
    expect(listar).not.toHaveBeenCalled();
    expect(linhas).toHaveLength(0);
  });

  it("AC-007.1: servidor que não responde ao teste não é gravado", async () => {
    const { supabase, linhas } = bancoFalso();
    listar.mockRejectedValueOnce(new Error("boom"));
    await expect(
      cadastrarServidor(
        supabase,
        ORG,
        { slug: "loja", nome: "Loja", endpoint: "https://erp.exemplo/mcp", chave: CHAVE },
        { resolver: resolverPublico, listar },
      ),
    ).rejects.toBeInstanceOf(ErroDeServidorMcp);
    expect(linhas).toHaveLength(0);
  });

  it("AC-007.1: cadastro válido testa com a chave, guarda a lista e devolve só o final da chave", async () => {
    const { supabase, linhas } = bancoFalso();
    const agora = Date.UTC(2026, 9, 28, 12, 0, 0);

    const publico = await cadastrarServidor(
      supabase,
      ORG,
      { slug: "loja", nome: "Loja", endpoint: "https://erp.exemplo/mcp", chave: CHAVE },
      { resolver: resolverPublico, listar, agora: () => agora },
    );

    expect(listar).toHaveBeenCalledWith({ endpoint: "https://erp.exemplo/mcp", chave: CHAVE });
    expect(publico).toMatchObject({ slug: "loja", chave_last4: "9999", host: "erp.exemplo" });
    expect(publico.ferramentas.map((f) => f.nome)).toEqual(["buscar_pedido", "cancelar_pedido"]);
    expect(linhas[0]).toMatchObject({ organization_id: ORG, slug: "loja" });
    expect(linhas[0]!.ferramentas_em).toBe(new Date(agora).toISOString());
  });

  it("AC-008.1: a chave nunca aparece na resposta e fica cifrada na linha", async () => {
    const { supabase, linhas } = bancoFalso();
    const publico = await cadastrarServidor(
      supabase,
      ORG,
      { slug: "loja", nome: "Loja", endpoint: "https://erp.exemplo/mcp", chave: CHAVE },
      { resolver: resolverPublico, listar },
    );
    expect(JSON.stringify(publico)).not.toContain(CHAVE);
    expect(JSON.stringify(linhas[0])).not.toContain(CHAVE);
    expect(typeof linhas[0]!.chave_encrypted).toBe("string");
  });

  it("AC-007.1: slug repetido na mesma organização vira erro claro", async () => {
    const { supabase } = bancoFalso([linhaDeServidor("loja")]);
    await expect(
      cadastrarServidor(
        supabase,
        ORG,
        { slug: "loja", nome: "Outra", endpoint: "https://erp.exemplo/mcp", chave: CHAVE },
        { resolver: resolverPublico, listar },
      ),
    ).rejects.toMatchObject({ codigo: "mcp_servidor_invalido" });
  });
});

describe("AC-007.2: todas as ferramentas nascem desligadas", () => {
  it("AC-007.2: recém-cadastradas, nenhuma ferramenta chega a agente algum", async () => {
    const { supabase } = bancoFalso();
    const publico = await cadastrarServidor(
      supabase,
      ORG,
      { slug: "loja", nome: "Loja", endpoint: "https://erp.exemplo/mcp", chave: CHAVE },
      { resolver: resolverPublico, listar },
    );
    expect(publico.ferramentas.every((f) => f.ligada === false)).toBe(true);

    const doAgente = await resolverFerramentasDoAgente(supabase, ORG, ["crm_search_products"], {
      listar,
    });
    expect(doAgente).toEqual([]);
  });
});

// ─── visão do agente ────────────────────────────────────────────────────────

describe("AC-007.8: o agente só vê as ferramentas ligadas, de qualquer servidor", () => {
  it("AC-007.8: duas lojas, ligadas só duas ferramentas: as demais não aparecem", async () => {
    const agora = Date.UTC(2026, 9, 28, 12, 0, 0);
    const fresco = new Date(agora).toISOString();
    const { supabase } = bancoFalso([
      linhaDeServidor("loja-a", { ferramentas: [LEITURA, ESCRITA], ferramentas_em: fresco }),
      linhaDeServidor("loja-b", { ferramentas: [LEITURA, ESCRITA], ferramentas_em: fresco }),
    ]);

    const visiveis = await resolverFerramentasDoAgente(
      supabase,
      ORG,
      ["mcp_externo:loja-a:leitura:buscar_pedido", "mcp_externo:loja-b:escrita:cancelar_pedido"],
      { listar, agora: () => agora },
    );

    expect(visiveis.map((v) => v.nomeExposto)).toEqual([
      "loja-a__buscar_pedido",
      "loja-b__cancelar_pedido",
    ]);
    expect(visiveis[0]!.servidor).toMatchObject({ slug: "loja-a", chave: CHAVE });
    expect(listar).not.toHaveBeenCalled();
  });

  it("AC-007.8: ferramenta ligada que o servidor deixou de anunciar some em vez de virar fantasma", async () => {
    const agora = Date.UTC(2026, 9, 28, 12, 0, 0);
    const { supabase } = bancoFalso([
      linhaDeServidor("loja-a", { ferramentas: [LEITURA], ferramentas_em: new Date(agora).toISOString() }),
    ]);
    const visiveis = await resolverFerramentasDoAgente(
      supabase,
      ORG,
      ["mcp_externo:loja-a:escrita:cancelar_pedido"],
      { listar, agora: () => agora },
    );
    expect(visiveis).toEqual([]);
  });

  it("AC-008.4: só lê servidores da organização do turno", async () => {
    const agora = Date.UTC(2026, 9, 28, 12, 0, 0);
    const fresco = new Date(agora).toISOString();
    const { supabase, operacoes } = bancoFalso([
      linhaDeServidor("loja-a", { ferramentas: [LEITURA], ferramentas_em: fresco }, OUTRA_ORG),
    ]);
    const visiveis = await resolverFerramentasDoAgente(
      supabase,
      ORG,
      ["mcp_externo:loja-a:leitura:buscar_pedido"],
      { listar, agora: () => agora },
    );
    expect(visiveis).toEqual([]);
    expect(operacoes.every((o) => o.filtros.organization_id === ORG)).toBe(true);
  });

  it("AC-007.8: servidor desativado não entrega ferramenta", async () => {
    const agora = Date.UTC(2026, 9, 28, 12, 0, 0);
    const { supabase } = bancoFalso([
      linhaDeServidor("loja-a", {
        ativo: false,
        ferramentas: [LEITURA],
        ferramentas_em: new Date(agora).toISOString(),
      }),
    ]);
    const visiveis = await resolverFerramentasDoAgente(
      supabase,
      ORG,
      ["mcp_externo:loja-a:leitura:buscar_pedido"],
      { listar, agora: () => agora },
    );
    expect(visiveis).toEqual([]);
  });

  it("AC-007.8: sem escolha remota no agente não toca o banco", async () => {
    const { supabase, operacoes } = bancoFalso();
    await resolverFerramentasDoAgente(supabase, ORG, ["crm_search_products"], { listar });
    expect(operacoes).toEqual([]);
  });
});

// ─── migração (AC-007.9) ────────────────────────────────────────────────────

describe("AC-007.9: o servidor migrado resolve as ferramentas no primeiro uso", () => {
  it("AC-007.9: id antigo aponta para o servidor padrao, que vem com ferramentas = [] e é preenchido no primeiro uso", async () => {
    const agora = Date.UTC(2026, 9, 28, 12, 0, 0);
    const { supabase, linhas } = bancoFalso([linhaDeServidor("padrao")]);

    const visiveis = await resolverFerramentasDoAgente(
      supabase,
      ORG,
      ["mcp_externo:leitura:buscar_pedido"],
      { listar, agora: () => agora },
    );

    expect(listar).toHaveBeenCalledTimes(1);
    expect(visiveis.map((v) => v.nomeExposto)).toEqual(["buscar_pedido"]);
    expect(visiveis[0]!.servidor.slug).toBe("padrao");
    expect((linhas[0]!.ferramentas as FerramentaRemota[]).map((f) => f.name)).toEqual([
      "buscar_pedido",
      "cancelar_pedido",
    ]);
    expect(linhas[0]!.ferramentas_em).toBe(new Date(agora).toISOString());
  });

  it("AC-007.9: no segundo uso, dentro de 10 minutos, não repete a rede", async () => {
    const agora = Date.UTC(2026, 9, 28, 12, 0, 0);
    const { supabase } = bancoFalso([linhaDeServidor("padrao")]);
    const ids = ["mcp_externo:leitura:buscar_pedido"];

    await resolverFerramentasDoAgente(supabase, ORG, ids, { listar, agora: () => agora });
    await resolverFerramentasDoAgente(supabase, ORG, ids, {
      listar,
      agora: () => agora + VALIDADE_DAS_FERRAMENTAS_MS - 1,
    });

    expect(listar).toHaveBeenCalledTimes(1);
  });
});

describe("AC-007.2: a lista de ferramentas expira em 10 minutos", () => {
  it("AC-007.2: passados 10 minutos a lista é refeita e regravada", async () => {
    const t0 = Date.UTC(2026, 9, 28, 12, 0, 0);
    const { supabase, linhas } = bancoFalso([
      linhaDeServidor("loja", { ferramentas: [ESCRITA], ferramentas_em: new Date(t0).toISOString() }),
    ]);
    const [linha] = await listarServidores(supabase, ORG);

    const ferramentas = await obterFerramentasDoServidor(supabase, ORG, linha!, {
      listar,
      agora: () => t0 + VALIDADE_DAS_FERRAMENTAS_MS + 1,
    });

    expect(listar).toHaveBeenCalledTimes(1);
    expect(ferramentas.map((f) => f.name)).toEqual(["buscar_pedido", "cancelar_pedido"]);
    expect((linhas[0]!.ferramentas as FerramentaRemota[]).length).toBe(2);
  });

  it("AC-007.2: servidor fora do ar com lista vencida devolve a lista guardada, sem lançar", async () => {
    const t0 = Date.UTC(2026, 9, 28, 12, 0, 0);
    const { supabase } = bancoFalso([
      linhaDeServidor("loja", { ferramentas: [LEITURA], ferramentas_em: new Date(t0).toISOString() }),
    ]);
    const [linha] = await listarServidores(supabase, ORG);
    listar.mockRejectedValueOnce(new Error("fora do ar"));

    const ferramentas = await obterFerramentasDoServidor(supabase, ORG, linha!, {
      listar,
      agora: () => t0 + VALIDADE_DAS_FERRAMENTAS_MS + 1,
    });

    expect(ferramentas.map((f) => f.name)).toEqual(["buscar_pedido"]);
  });
});

describe("AC-007.8: as ligadas viram ferramentas do turno com nome sem colisão", () => {
  it("AC-007.8: formato novo expõe <servidor>__<nome>; formato antigo mantém o nome cru; o compilado vence", async () => {
    const agora = Date.UTC(2026, 9, 28, 12, 0, 0);
    const fresco = new Date(agora).toISOString();
    const { supabase } = bancoFalso([
      linhaDeServidor("padrao", { ferramentas: [LEITURA], ferramentas_em: fresco }),
      linhaDeServidor("loja-b", { ferramentas: [LEITURA], ferramentas_em: fresco }),
    ]);
    const ligadas = await resolverFerramentasDoAgente(
      supabase,
      ORG,
      ["mcp_externo:leitura:buscar_pedido", "mcp_externo:loja-b:leitura:buscar_pedido"],
      { listar, agora: () => agora },
    );

    const nomes = definirFerramentasDosServidores(ligadas, new Set()).map((d) => d.name);
    expect(nomes).toEqual(["buscar_pedido", "loja-b__buscar_pedido"]);

    const comColisao = definirFerramentasDosServidores(ligadas, new Set(["buscar_pedido"])).map((d) => d.name);
    expect(comColisao).toEqual(["loja-b__buscar_pedido"]);
  });
});
