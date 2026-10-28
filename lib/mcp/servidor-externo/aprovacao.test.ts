/**
 * T-032: ação de escrita de servidor MCP externo e aprovação por uma pessoa.
 * AC-007.3 (assistido: não executa, vira ação pendente com item na Central; aprovar
 * executa com os argumentos GUARDADOS) e AC-007.4 (automático: só sem aprovação se o
 * admin marcou; leitura sempre roda).
 *
 * O banco é um fake em memória na fronteira (PostgREST); a rede é a fronteira `chamar`.
 */
import { beforeEach, describe, expect, it, vi, type Mock } from "vitest";

vi.hoisted(() => {
  process.env.AI_CRED_AES_KEY = "iBc1Z2gYaAH4rEHs1dHQ2dvNQ6t4OfrdE1/Y6OSvtZY=";
});

import type { SupabaseClient } from "@supabase/supabase-js";

import type { ResultadoRemoto } from "./chamada";
import type { ServidorMcpExterno } from "./registro";
import { cifrarChaveMcpExterno } from "./segredo";
import {
  decidirAcaoPendente,
  decidirComoExecutar,
  hashDosArgumentos,
  registrarAcaoPendente,
  textoDaAcaoPendente,
} from "./aprovacao";

const ORG = "bcc12320-f555-4fef-8d90-38a0ac5950e0";
const OUTRA_ORG = "11111111-2222-4333-8444-555555555555";
const SERVIDOR_ID = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const CONVERSA = "cccccccc-cccc-4ccc-8ccc-cccccccccccc";
const AGENTE = "dddddddd-dddd-4ddd-8ddd-dddddddddddd";
const USUARIO = "eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee";
const CHAVE = "chave-secreta-do-erp-9999";

// ─── Fake do PostgREST (várias tabelas) ─────────────────────────────────────

type Linha = Record<string, unknown>;

function bancoFalso() {
  const tabelas: Record<string, Linha[]> = {
    mcp_acoes_pendentes: [],
    mcp_servidores_externos: [],
    agent_inbox_items: [],
  };
  let seq = 0;

  function construtor(nome: string) {
    const linhas = tabelas[nome];
    if (!linhas) throw new Error(`tabela inesperada: ${nome}`);
    const filtros: Array<(l: Linha) => boolean> = [];
    let tipo: "select" | "insert" | "update" = "select";
    let payload: Linha = {};

    const executar = (): { data: Linha[] | null; error: { code: string; message: string } | null } => {
      const alvo = () => linhas.filter((l) => filtros.every((f) => f(l)));
      if (tipo === "insert") {
        if (
          nome === "mcp_acoes_pendentes" &&
          payload.conversa_id != null &&
          linhas.some(
            (l) =>
              l.estado === "pendente" &&
              l.conversa_id === payload.conversa_id &&
              l.ferramenta === payload.ferramenta &&
              l.argumentos_hash === payload.argumentos_hash,
          )
        ) {
          return { data: null, error: { code: "23505", message: "duplicate key" } };
        }
        seq += 1;
        const nova: Linha = {
          id: `00000000-0000-4000-8000-${String(seq).padStart(12, "0")}`,
          estado: "pendente",
          status: "open",
          ...payload,
        };
        linhas.push(nova);
        return { data: [nova], error: null };
      }
      if (tipo === "update") {
        const afetadas = alvo();
        afetadas.forEach((l) => Object.assign(l, payload));
        return { data: afetadas, error: null };
      }
      return { data: alvo(), error: null };
    };

    const api = {
      select: () => api,
      insert: (p: Linha) => {
        tipo = "insert";
        payload = p;
        return api;
      },
      update: (p: Linha) => {
        tipo = "update";
        payload = p;
        return api;
      },
      eq: (k: string, v: unknown) => (filtros.push((l) => l[k] === v), api),
      is: (k: string, v: unknown) => (filtros.push((l) => (l[k] ?? null) === v), api),
      in: (k: string, v: unknown[]) => (filtros.push((l) => v.includes(l[k])), api),
      limit: () => api,
      single: async () => {
        const r = executar();
        return { data: r.data?.[0] ?? null, error: r.error };
      },
      maybeSingle: async () => {
        const r = executar();
        return { data: r.data?.[0] ?? null, error: r.error };
      },
      then: (ok: (v: unknown) => unknown, ko?: (e: unknown) => unknown) =>
        Promise.resolve(executar()).then(ok, ko),
    };
    return api;
  }

  const supabase = { from: construtor } as unknown as SupabaseClient;
  return { supabase, tabelas };
}

function servidorNoBanco(banco: ReturnType<typeof bancoFalso>, extra: Linha = {}) {
  const c = cifrarChaveMcpExterno(CHAVE);
  banco.tabelas.mcp_servidores_externos!.push({
    id: SERVIDOR_ID,
    organization_id: ORG,
    slug: "loja",
    nome: "ERP da loja",
    endpoint: "https://erp.loja.exemplo/mcp",
    chave_encrypted: c.mcp_externo_chave_encrypted,
    chave_iv: c.mcp_externo_chave_iv,
    chave_tag: c.mcp_externo_chave_tag,
    chave_last4: c.mcp_externo_chave_last4,
    ferramentas: [],
    ferramentas_em: null,
    ativo: true,
    ...extra,
  });
}

const ARGS = { pedido_id: "P-123", motivo: "cliente desistiu" };

function dadosDaAcao(extra: Partial<Parameters<typeof registrarAcaoPendente>[2]> = {}) {
  return {
    agenteId: AGENTE,
    conversaId: CONVERSA,
    servidorId: SERVIDOR_ID,
    servidorNome: "ERP da loja",
    ferramenta: "cancelar_pedido",
    argumentos: ARGS,
    ...extra,
  };
}

let chamar: Mock<(s: ServidorMcpExterno, nome: string, args: Record<string, unknown>) => Promise<ResultadoRemoto>>;
beforeEach(() => {
  chamar = vi.fn(async () => ({ texto: "Pedido P-123 cancelado." }));
});

// ─── AC-007.4: a regra de quando pedir aprovação ────────────────────────────

describe("AC-007.3/007.4: decidirComoExecutar", () => {
  it("AC-007.4: leitura roda sempre, em qualquer modo", () => {
    for (const modo of ["assisted", "automatic", undefined] as const) {
      expect(decidirComoExecutar({ ehLeitura: true, modo, liberadaSemAprovacao: false })).toBe("executar");
    }
  });

  it("AC-007.3: escrita no modo assistido pede aprovação, mesmo marcada como liberada", () => {
    expect(decidirComoExecutar({ ehLeitura: false, modo: "assisted", liberadaSemAprovacao: true })).toBe(
      "pedir_aprovacao",
    );
  });

  it("AC-007.4: escrita no automático só roda se o admin marcou", () => {
    expect(decidirComoExecutar({ ehLeitura: false, modo: "automatic", liberadaSemAprovacao: true })).toBe(
      "executar",
    );
    expect(decidirComoExecutar({ ehLeitura: false, modo: "automatic", liberadaSemAprovacao: false })).toBe(
      "pedir_aprovacao",
    );
  });

  it("AC-007.3: modo desconhecido é tratado como assistido (falha fechada)", () => {
    expect(decidirComoExecutar({ ehLeitura: false, modo: undefined, liberadaSemAprovacao: true })).toBe(
      "pedir_aprovacao",
    );
  });
});

// ─── AC-007.3: virar ação pendente ──────────────────────────────────────────

describe("AC-007.3: a escrita vira ação pendente com item na Central", () => {
  it("AC-007.3: grava a ação com os argumentos e abre UM item da Central em português, sem os argumentos", async () => {
    const banco = bancoFalso();
    servidorNoBanco(banco);

    const r = await registrarAcaoPendente(banco.supabase, ORG, dadosDaAcao());

    expect(r).toMatchObject({ nova: true });
    const [acao] = banco.tabelas.mcp_acoes_pendentes!;
    expect(acao).toMatchObject({
      organization_id: ORG,
      agente_id: AGENTE,
      conversa_id: CONVERSA,
      servidor_id: SERVIDOR_ID,
      ferramenta: "cancelar_pedido",
      argumentos: ARGS,
      argumentos_hash: hashDosArgumentos(ARGS),
    });
    expect(acao!.estado ?? "pendente").toBe("pendente");

    expect(banco.tabelas.agent_inbox_items).toHaveLength(1);
    const item = banco.tabelas.agent_inbox_items![0]!;
    expect(item).toMatchObject({
      organization_id: ORG,
      kind: "acao_mcp_pendente",
      ref_kind: "conversation",
      ref_id: CONVERSA,
    });
    expect(item.body).toBe(textoDaAcaoPendente("ERP da loja", "cancelar_pedido").corpo);
    expect(JSON.stringify(item)).not.toContain("P-123");
  });

  it("AC-007.3: o mesmo pedido na mesma conversa não vira duas pendências nem dois itens", async () => {
    const banco = bancoFalso();
    servidorNoBanco(banco);

    const primeira = await registrarAcaoPendente(banco.supabase, ORG, dadosDaAcao());
    const segunda = await registrarAcaoPendente(banco.supabase, ORG, dadosDaAcao());

    expect(segunda).toEqual({ id: primeira?.id, nova: false });
    expect(banco.tabelas.mcp_acoes_pendentes).toHaveLength(1);
    expect(banco.tabelas.agent_inbox_items).toHaveLength(1);
  });

  it("AC-007.3: ordem das chaves dos argumentos não muda o hash", () => {
    expect(hashDosArgumentos({ a: 1, b: { x: 1, y: 2 } })).toBe(hashDosArgumentos({ b: { y: 2, x: 1 }, a: 1 }));
    expect(hashDosArgumentos({ a: 1 })).not.toBe(hashDosArgumentos({ a: 2 }));
  });

  it("AC-007.3: o texto da Central é português simples e não traz código interno", () => {
    const { titulo, corpo } = textoDaAcaoPendente("ERP da loja", "cancelar_pedido");
    expect(titulo).toMatch(/aprova/i);
    expect(corpo).toContain("ERP da loja");
    expect(`${titulo} ${corpo}`).not.toMatch(/acao_mcp_pendente|mcp_|_pendente|assisted|automatic/);
  });
});

// ─── AC-007.3: aprovar e recusar ────────────────────────────────────────────

describe("AC-007.3: aprovar executa com os argumentos GUARDADOS, uma única vez", () => {
  async function comPendente() {
    const banco = bancoFalso();
    servidorNoBanco(banco);
    const r = await registrarAcaoPendente(banco.supabase, ORG, dadosDaAcao());
    return { banco, acaoId: r!.id };
  }

  it("AC-007.3: aprovar chama o servidor com a chave e os argumentos guardados e marca executada", async () => {
    const { banco, acaoId } = await comPendente();

    const r = await decidirAcaoPendente(banco.supabase, ORG, { acaoId, decisao: "aprovar", usuarioId: USUARIO }, { chamar });

    expect(chamar).toHaveBeenCalledTimes(1);
    const [servidor, nome, args] = chamar.mock.calls[0]!;
    expect(servidor.chave).toBe(CHAVE);
    expect(servidor.endpoint).toBe("https://erp.loja.exemplo/mcp");
    expect(nome).toBe("cancelar_pedido");
    expect(args).toEqual(ARGS);
    expect(r).toMatchObject({ tipo: "executada" });
    const acao = banco.tabelas.mcp_acoes_pendentes![0]!;
    expect(acao).toMatchObject({ estado: "executada", decidido_por: USUARIO });
    expect(acao.decidido_em).toBeTruthy();
  });

  it("AC-007.3: o resumo para a auditoria traz servidor, ferramenta, argumentos e resultado, sem a chave", async () => {
    const { banco, acaoId } = await comPendente();
    chamar.mockResolvedValueOnce({ texto: `ok com ${CHAVE} no meio` });

    const r = await decidirAcaoPendente(banco.supabase, ORG, { acaoId, decisao: "aprovar", usuarioId: USUARIO }, { chamar });

    expect(r.tipo).toBe("executada");
    if (r.tipo !== "executada") return;
    expect(r.resumo).toMatchObject({ servidor: "loja", ferramenta: "cancelar_pedido" });
    expect(r.resumo.argumentos).toMatchObject({ pedido_id: "P-123" });
    expect(JSON.stringify(r)).not.toContain(CHAVE);
  });

  it("AC-007.3: aprovar de novo não executa de novo", async () => {
    const { banco, acaoId } = await comPendente();
    await decidirAcaoPendente(banco.supabase, ORG, { acaoId, decisao: "aprovar", usuarioId: USUARIO }, { chamar });

    const r = await decidirAcaoPendente(banco.supabase, ORG, { acaoId, decisao: "aprovar", usuarioId: USUARIO }, { chamar });

    expect(r).toEqual({ tipo: "ja_decidida", estado: "executada" });
    expect(chamar).toHaveBeenCalledTimes(1);
  });

  it("AC-007.3: duas aprovações ao mesmo tempo executam uma só vez", async () => {
    const { banco, acaoId } = await comPendente();

    const [a, b] = await Promise.all([
      decidirAcaoPendente(banco.supabase, ORG, { acaoId, decisao: "aprovar", usuarioId: USUARIO }, { chamar }),
      decidirAcaoPendente(banco.supabase, ORG, { acaoId, decisao: "aprovar", usuarioId: USUARIO }, { chamar }),
    ]);

    expect(chamar).toHaveBeenCalledTimes(1);
    expect([a.tipo, b.tipo].sort()).toEqual(["executada", "ja_decidida"]);
  });

  it("AC-007.3: recusar não chama o servidor e fecha o item da Central", async () => {
    const { banco, acaoId } = await comPendente();

    const r = await decidirAcaoPendente(banco.supabase, ORG, { acaoId, decisao: "recusar", usuarioId: USUARIO }, { chamar });

    expect(r).toMatchObject({ tipo: "recusada" });
    expect(chamar).not.toHaveBeenCalled();
    expect(banco.tabelas.mcp_acoes_pendentes![0]).toMatchObject({ estado: "recusada", decidido_por: USUARIO });
    expect(banco.tabelas.agent_inbox_items![0]).toMatchObject({ status: "resolved" });
  });

  it("AC-007.3: o item da Central só fecha quando não sobra outra ação pendente da conversa", async () => {
    const banco = bancoFalso();
    servidorNoBanco(banco);
    const a = await registrarAcaoPendente(banco.supabase, ORG, dadosDaAcao());
    await registrarAcaoPendente(banco.supabase, ORG, dadosDaAcao({ ferramenta: "reembolsar", argumentos: { v: 1 } }));

    await decidirAcaoPendente(banco.supabase, ORG, { acaoId: a!.id, decisao: "recusar", usuarioId: USUARIO }, { chamar });

    expect(banco.tabelas.agent_inbox_items!.map((i) => i.status)).toEqual(["open", "open"]);
  });

  it("AC-007.3: ação de OUTRA organização é como se não existisse e nada é chamado", async () => {
    const { banco, acaoId } = await comPendente();

    const r = await decidirAcaoPendente(banco.supabase, OUTRA_ORG, { acaoId, decisao: "aprovar", usuarioId: USUARIO }, { chamar });

    expect(r).toEqual({ tipo: "nao_encontrada" });
    expect(chamar).not.toHaveBeenCalled();
    expect(banco.tabelas.mcp_acoes_pendentes![0]!.estado).toBe("pendente");
  });

  it("AC-007.3: o servidor falhou: a ação vira falhou, sem expor a chave", async () => {
    const { banco, acaoId } = await comPendente();
    chamar.mockRejectedValueOnce(new Error(`recusado: ${CHAVE}`));

    const r = await decidirAcaoPendente(banco.supabase, ORG, { acaoId, decisao: "aprovar", usuarioId: USUARIO }, { chamar });

    expect(r.tipo).toBe("falhou");
    expect(JSON.stringify(r)).not.toContain(CHAVE);
    expect(banco.tabelas.mcp_acoes_pendentes![0]!.estado).toBe("falhou");
  });

  it("AC-007.3: servidor desativado depois do pedido: não chama e marca falhou", async () => {
    const { banco, acaoId } = await comPendente();
    banco.tabelas.mcp_servidores_externos![0]!.ativo = false;

    const r = await decidirAcaoPendente(banco.supabase, ORG, { acaoId, decisao: "aprovar", usuarioId: USUARIO }, { chamar });

    expect(r.tipo).toBe("falhou");
    expect(chamar).not.toHaveBeenCalled();
    expect(banco.tabelas.mcp_acoes_pendentes![0]!.estado).toBe("falhou");
  });
});
