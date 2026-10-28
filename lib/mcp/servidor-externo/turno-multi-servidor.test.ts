/**
 * Fatia 7, parte 2a: o TURNO do agente usa o repositório de vários servidores
 * (AC-007.8, AC-007.9) e a escrita externa passa pela aprovação (AC-007.3, AC-007.4).
 *
 * Fim a fim em unitário: banco em memória na fronteira, `pickToolsFromMcp` e
 * `wrapMcpTool` de verdade. A rede é a fronteira (`listar` e a junta `fetch`).
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.hoisted(() => {
  process.env.AI_CRED_AES_KEY = "iBc1Z2gYaAH4rEHs1dHQ2dvNQ6t4OfrdE1/Y6OSvtZY=";
});
vi.mock("@/lib/audit", () => ({ audit: vi.fn() }));

import type { SupabaseClient } from "@supabase/supabase-js";

import { pickToolsFromMcp } from "@/lib/ai/runtime/tools";
import type { McpAuthResult } from "@/lib/mcp/auth";
import type { McpContext } from "@/lib/mcp/types";

import { carregarFerramentasExternasDoTurno } from "./carregar";
import { CABECALHOS_DO_CONTATO, type FerramentaRemota } from "./chamada";
import { toolIdRemoto } from "./ids";
import { cifrarChaveMcpExterno } from "./segredo";

const ORG = "bcc12320-f555-4fef-8d90-38a0ac5950e0";
const OUTRA_ORG = "11111111-2222-4333-8444-555555555555";
const CONTATO = "11111111-1111-4111-8111-111111111111";
const CONVERSA = "cccccccc-cccc-4ccc-8ccc-cccccccccccc";
const AGENTE = "dddddddd-dddd-4ddd-8ddd-dddddddddddd";
const CHAVE = "chave-secreta-do-erp-9999";

type Linha = Record<string, unknown>;

function bancoFalso() {
  const tabelas: Record<string, Linha[]> = {
    mcp_servidores_externos: [],
    mcp_acoes_pendentes: [],
    agent_inbox_items: [],
    contacts: [{ id: CONTATO, organization_id: ORG, phone_number: "+5511987654321" }],
    conversations: [{ id: CONVERSA, organization_id: ORG, contact_id: CONTATO, channel: "whatsapp" }],
  };
  const consultas: string[] = [];
  let seq = 0;

  function construtor(nome: string) {
    consultas.push(nome);
    const linhas = tabelas[nome];
    if (!linhas) throw new Error(`tabela inesperada: ${nome}`);
    const filtros: Array<(l: Linha) => boolean> = [];
    let tipo: "select" | "insert" | "update" = "select";
    let payload: Linha = {};
    const executar = () => {
      const alvo = () => linhas.filter((l) => filtros.every((f) => f(l)));
      if (tipo === "insert") {
        seq += 1;
        const nova = { id: `00000000-0000-4000-8000-${String(seq).padStart(12, "0")}`, estado: "pendente", ...payload };
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
      is: (k: string, v: unknown) => (filtros.push((l) => (l[k] ?? null) === v), api),
      in: (k: string, v: unknown[]) => (filtros.push((l) => v.includes(l[k])), api),
      order: () => api,
      single: async () => ({ data: executar().data[0] ?? null, error: null }),
      maybeSingle: async () => ({ data: executar().data[0] ?? null, error: null }),
      then: (ok: (v: unknown) => unknown, ko?: (e: unknown) => unknown) => Promise.resolve(executar()).then(ok, ko),
    };
    return api;
  }
  return { supabase: { from: construtor } as unknown as SupabaseClient, tabelas, consultas };
}

type Banco = ReturnType<typeof bancoFalso>;

function servidor(banco: Banco, slug: string, org = ORG, ferramentas: FerramentaRemota[] = []) {
  const c = cifrarChaveMcpExterno(CHAVE);
  const linha = {
    id: crypto.randomUUID(),
    organization_id: org,
    slug,
    nome: `Sistema ${slug}`,
    endpoint: `https://${slug}.exemplo/mcp`,
    chave_encrypted: c.mcp_externo_chave_encrypted,
    chave_iv: c.mcp_externo_chave_iv,
    chave_tag: c.mcp_externo_chave_tag,
    chave_last4: c.mcp_externo_chave_last4,
    ferramentas,
    ferramentas_em: ferramentas.length > 0 ? new Date().toISOString() : null,
    ativo: true,
    created_at: "2026-10-28T00:00:00Z",
  };
  banco.tabelas.mcp_servidores_externos!.push(linha);
  return linha;
}

const LER_PEDIDO: FerramentaRemota = { name: "buscar_pedido", somenteLeitura: true };
const CANCELAR: FerramentaRemota = { name: "cancelar_pedido" };
const LISTAR_CLIENTES: FerramentaRemota = { name: "listar_clientes", somenteLeitura: true };

const auth = {
  organizationId: ORG,
  role: "ai_operator",
  actor: { type: "ai_agent", id: "ag-1", role: "ai_operator" },
  apiTokenId: "d7ba0e68-0000-4000-8000-000000000001",
  scopes: ["mcp:read", "mcp:write"],
} as unknown as McpAuthResult;

function contexto(supabase: unknown): McpContext {
  return {
    organizationId: ORG,
    role: auth.role,
    actor: auth.actor,
    apiTokenId: auth.apiTokenId,
    requestId: "3f7c1e50-0000-4000-8800-000000000484",
    supabase,
  } as unknown as McpContext;
}

type Executavel = { execute: (a: unknown) => Promise<unknown> };

async function montarTurno(
  banco: Banco,
  toolIds: string[],
  extra: {
    listar?: (s: { endpoint: string }) => Promise<FerramentaRemota[]>;
    fetch?: typeof fetch;
    contato?: string;
    noAtendimento?: boolean;
    modo?: "assisted" | "automatic";
    liberadas?: string[];
  } = {},
) {
  const junta = extra.fetch ?? vi.fn(async () => new Response("erro", { status: 500 }));
  const ferramentasExternas = await carregarFerramentasExternasDoTurno(banco.supabase, ORG, toolIds, {
    ...(extra.contato ? { contatoDoTurno: extra.contato, conversaDoTurno: CONVERSA } : {}),
    ...(extra.noAtendimento ? { noAtendimento: true } : {}),
    fetch: junta as never,
    deps: { listar: extra.listar ?? (async () => [LER_PEDIDO, CANCELAR, LISTAR_CLIENTES]) },
  });
  const tools = pickToolsFromMcp({
    supabase: banco.supabase,
    ctx: contexto(banco.supabase),
    auth,
    toolIds,
    handoffToolEnabled: false,
    handoffSignal: { triggered: false },
    ...(extra.contato ? { contatoDoTurno: extra.contato } : {}),
    ...(ferramentasExternas ? { ferramentasExternas } : {}),
    aprovacaoMcp: {
      modo: extra.modo ?? "assisted",
      agenteId: AGENTE,
      conversaId: CONVERSA,
      liberadas: extra.liberadas ?? [],
    },
  });
  return { tools, ferramentasExternas, junta };
}

beforeEach(() => vi.clearAllMocks());

describe("AC-007.8: o agente só enxerga as ferramentas LIGADAS para ele, de qualquer servidor", () => {
  it("AC-007.8: ferramenta ligada do servidor A aparece; desligada do servidor B não", async () => {
    const banco = bancoFalso();
    servidor(banco, "loja", ORG, [LER_PEDIDO, CANCELAR]);
    servidor(banco, "crm", ORG, [LISTAR_CLIENTES]);

    const { tools } = await montarTurno(banco, [toolIdRemoto("buscar_pedido", "leitura", "loja")]);

    expect(Object.keys(tools).filter((n) => n.includes("__"))).toEqual(["loja__buscar_pedido"]);
    expect(tools.crm__listar_clientes).toBeUndefined();
    expect(tools.loja__cancelar_pedido).toBeUndefined();
  });

  it("AC-007.8: ligadas em dois servidores aparecem as duas, cada uma com o nome do seu servidor", async () => {
    const banco = bancoFalso();
    servidor(banco, "loja", ORG, [LER_PEDIDO]);
    servidor(banco, "crm", ORG, [LISTAR_CLIENTES]);

    const { tools } = await montarTurno(banco, [
      toolIdRemoto("buscar_pedido", "leitura", "loja"),
      toolIdRemoto("listar_clientes", "leitura", "crm"),
    ]);

    expect(Object.keys(tools).sort()).toEqual(["crm__listar_clientes", "loja__buscar_pedido"]);
  });

  it("AC-008.4: id de ferramenta de servidor de OUTRA organização é ignorado", async () => {
    const banco = bancoFalso();
    servidor(banco, "loja", OUTRA_ORG, [LER_PEDIDO]);

    const { tools, ferramentasExternas } = await montarTurno(banco, [
      toolIdRemoto("buscar_pedido", "leitura", "loja"),
    ]);

    expect(ferramentasExternas).toBeNull();
    expect(tools.loja__buscar_pedido).toBeUndefined();
  });

  it("AC-007.8: sem escolha remota nem banco nem rede são tocados", async () => {
    const banco = bancoFalso();
    servidor(banco, "loja", ORG, [LER_PEDIDO]);
    const listar = vi.fn(async () => [LER_PEDIDO]);

    const { ferramentasExternas } = await montarTurno(banco, ["crm_search_products"], { listar });

    expect(ferramentasExternas).toBeNull();
    expect(banco.consultas).toEqual([]);
    expect(listar).not.toHaveBeenCalled();
  });
});

describe("AC-007.9: quem já usa o servidor atual continua funcionando sem ação do admin", () => {
  it("AC-007.9: o id no formato antigo chega ao servidor `padrao` migrado e mantém o nome cru", async () => {
    const banco = bancoFalso();
    servidor(banco, "padrao", ORG, []); // como a migration deixa: sem lista ainda

    const { tools } = await montarTurno(banco, [toolIdRemoto("buscar_pedido", "leitura")]);

    expect(tools.buscar_pedido).toBeDefined();
    // a lista foi resolvida no primeiro uso e guardada
    const guardada = banco.tabelas.mcp_servidores_externos![0]!.ferramentas as FerramentaRemota[];
    expect(guardada.map((f) => f.name)).toContain("buscar_pedido");
  });

  it("AC-007.9: organização que só tem o registro antigo (sem linha migrada) segue funcionando", async () => {
    const banco = bancoFalso();
    const carregarLegado = vi.fn(async () => ({
      servidor: { endpoint: "https://legado.exemplo/mcp", chave: CHAVE },
      ferramentas: [LER_PEDIDO],
    }));

    const ferramentasExternas = await carregarFerramentasExternasDoTurno(
      banco.supabase,
      ORG,
      [toolIdRemoto("buscar_pedido", "leitura")],
      { deps: { listar: async () => [] }, carregarLegado },
    );

    expect(ferramentasExternas?.ligadas.map((l) => l.nomeExposto)).toEqual(["buscar_pedido"]);
    expect(ferramentasExternas?.ligadas[0]?.servidor.slug).toBe("padrao");
    expect(carregarLegado).toHaveBeenCalledTimes(1);
  });

  it("AC-007.9: com o servidor migrado resolvido, o registro antigo nem é consultado", async () => {
    const banco = bancoFalso();
    servidor(banco, "padrao", ORG, [LER_PEDIDO]);
    const carregarLegado = vi.fn(async () => null);

    await carregarFerramentasExternasDoTurno(banco.supabase, ORG, [toolIdRemoto("buscar_pedido", "leitura")], {
      deps: { listar: async () => [LER_PEDIDO] },
      carregarLegado,
    });

    expect(carregarLegado).not.toHaveBeenCalled();
  });
});

describe("cercas da conversa continuam valendo na carga nova", () => {
  it("turno com contato e sem a opção do agente: nada carrega, nem banco", async () => {
    const banco = bancoFalso();
    servidor(banco, "loja", ORG, [LER_PEDIDO]);

    const { ferramentasExternas } = await montarTurno(banco, [toolIdRemoto("buscar_pedido", "leitura", "loja")], {
      contato: CONTATO,
    });

    expect(ferramentasExternas).toBeNull();
    expect(banco.consultas).toEqual([]);
  });

  it("turno com contato e a opção LIGADA: a identidade do contato vem do BANCO e a leitura monta", async () => {
    const banco = bancoFalso();
    servidor(banco, "loja", ORG, [LER_PEDIDO]);

    const { ferramentasExternas, tools } = await montarTurno(
      banco,
      [toolIdRemoto("buscar_pedido", "leitura", "loja")],
      { contato: CONTATO, noAtendimento: true },
    );

    expect(ferramentasExternas?.contato).toBe(CONTATO);
    expect(ferramentasExternas?.cabecalhos).toEqual({
      [CABECALHOS_DO_CONTATO.id]: CONTATO,
      [CABECALHOS_DO_CONTATO.telefone]: "5511987654321",
      [CABECALHOS_DO_CONTATO.canal]: "whatsapp",
    });
    expect(tools.loja__buscar_pedido).toBeDefined();
  });

  it("escrita remota em turno com contato segue recusada pelo escopo da conversa", async () => {
    const banco = bancoFalso();
    servidor(banco, "loja", ORG, [CANCELAR]);

    const { tools } = await montarTurno(banco, [toolIdRemoto("cancelar_pedido", "escrita", "loja")], {
      contato: CONTATO,
      noAtendimento: true,
    });

    expect(await (tools.loja__cancelar_pedido as unknown as Executavel).execute({ pedido_id: "1" })).toMatchObject({
      permitido: false,
      motivo: "escrita_sem_escopo_do_turno",
    });
    expect(banco.tabelas.mcp_acoes_pendentes).toHaveLength(0);
  });
});

describe("AC-007.3 / AC-007.4: a escrita externa no turno", () => {
  const ESCRITA = toolIdRemoto("cancelar_pedido", "escrita", "loja");

  it("AC-007.3: modo assistido: a escrita não executa, vira ação pendente e abre item na Central", async () => {
    const banco = bancoFalso();
    servidor(banco, "loja", ORG, [CANCELAR]);
    const { tools, junta } = await montarTurno(banco, [ESCRITA], { modo: "assisted" });

    const r = await (tools.loja__cancelar_pedido as unknown as Executavel).execute({ pedido_id: "P-1" });

    expect(r).toMatchObject({ pendente_de_aprovacao: true });
    expect(junta).not.toHaveBeenCalled();
    expect(banco.tabelas.mcp_acoes_pendentes).toHaveLength(1);
    expect(banco.tabelas.mcp_acoes_pendentes![0]).toMatchObject({
      organization_id: ORG,
      agente_id: AGENTE,
      conversa_id: CONVERSA,
      ferramenta: "cancelar_pedido",
      argumentos: { pedido_id: "P-1" },
    });
    expect(banco.tabelas.agent_inbox_items).toHaveLength(1);
    expect(banco.tabelas.agent_inbox_items![0]).toMatchObject({ kind: "acao_mcp_pendente" });
  });

  it("AC-007.3: assistido, mesmo marcada para rodar sem aprovação, a escrita continua pendente", async () => {
    const banco = bancoFalso();
    servidor(banco, "loja", ORG, [CANCELAR]);
    const { tools, junta } = await montarTurno(banco, [ESCRITA], { modo: "assisted", liberadas: ["loja__cancelar_pedido"] });

    const r = await (tools.loja__cancelar_pedido as unknown as Executavel).execute({ pedido_id: "P-1" });

    expect(r).toMatchObject({ pendente_de_aprovacao: true });
    expect(junta).not.toHaveBeenCalled();
  });

  it("AC-007.4: automático sem a marca do admin: escrita fica pendente", async () => {
    const banco = bancoFalso();
    servidor(banco, "loja", ORG, [CANCELAR]);
    const { tools, junta } = await montarTurno(banco, [ESCRITA], { modo: "automatic" });

    const r = await (tools.loja__cancelar_pedido as unknown as Executavel).execute({ pedido_id: "P-1" });

    expect(r).toMatchObject({ pendente_de_aprovacao: true });
    expect(junta).not.toHaveBeenCalled();
  });

  it("AC-007.4: automático com a marca do admin: a escrita é chamada no servidor, sem pendência", async () => {
    const banco = bancoFalso();
    servidor(banco, "loja", ORG, [CANCELAR]);
    const { tools, junta } = await montarTurno(banco, [ESCRITA], {
      modo: "automatic",
      liberadas: ["loja__cancelar_pedido"],
    });

    await (tools.loja__cancelar_pedido as unknown as Executavel).execute({ pedido_id: "P-1" });

    expect(junta).toHaveBeenCalled();
    expect(banco.tabelas.mcp_acoes_pendentes).toHaveLength(0);
  });

  it("AC-007.4: leitura roda sem aprovação no modo assistido", async () => {
    const banco = bancoFalso();
    servidor(banco, "loja", ORG, [LER_PEDIDO]);
    const { tools, junta } = await montarTurno(banco, [toolIdRemoto("buscar_pedido", "leitura", "loja")], {
      modo: "assisted",
    });

    await (tools.loja__buscar_pedido as unknown as Executavel).execute({});

    expect(junta).toHaveBeenCalled();
    expect(banco.tabelas.mcp_acoes_pendentes).toHaveLength(0);
  });
});
