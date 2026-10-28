import { describe, expect, it, vi } from "vitest";

import {
  LIMITE_DE_ERROS_SEGUIDOS,
  criarContadorDeErrosDeFerramenta,
  seguidasDepois,
  veredictosDoPasso,
  type VeredictoDaChamada,
} from "@/lib/ai/handoff/falhas-de-ferramenta";

/**
 * AC-005.3 (mudança SDD 006): dois erros de ferramenta SEGUIDOS na MESMA conversa levam a
 * conversa a uma pessoa; um sucesso reinicia a contagem. Erro de infraestrutura (rede, banco,
 * trava do sistema) NÃO é erro do modelo e não conta; erro de VALIDAÇÃO de argumentos conta (AC-006.5).
 */
const ORG = "11111111-1111-4111-8111-111111111111";
const OUTRA_ORG = "99999999-9999-4999-8999-999999999999";
const CONVERSA = "33333333-3333-4333-8333-333333333333";
const OUTRA_CONVERSA = "44444444-4444-4444-8444-444444444444";

const resultado = (output: unknown, toolName = "crm_x") => ({ type: "tool-result", toolName, output });
const erroDoSdk = (name: string) => ({
  type: "tool-error",
  toolName: "crm_x",
  error: Object.assign(new Error("detalhe técnico com segredo sk-abc"), { name }),
});
const passo = (...content: unknown[]) => ({ content });

function bancoFalso(inicial: Record<string, number> = {}, opts: { falha?: boolean } = {}) {
  const linhas = new Map<string, number>(Object.entries(inicial));
  const chamadas: Array<{ sql: string; params: readonly unknown[] }> = [];
  const query = vi.fn(async (sql: string, params: readonly unknown[] = []) => {
    chamadas.push({ sql, params });
    if (opts.falha === true) throw new Error("banco fora");
    if (/^\s*select/i.test(sql)) {
      const v = linhas.get(`${params[0]}|${params[1]}`);
      return { rows: v === undefined ? [] : [{ seguidas: v }], rowCount: v === undefined ? 0 : 1 };
    }
    linhas.set(`${params[0]}|${params[1]}`, Number(params[2]));
    return { rows: [], rowCount: 1 };
  });
  return { pool: { query } as never, linhas, chamadas };
}
const log = () => ({ info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() }) as never;

describe("AC-005.3: o que conta como erro de ferramenta", () => {
  it("AC-005.3: o limite é de dois erros seguidos", () => {
    expect(LIMITE_DE_ERROS_SEGUIDOS).toBe(2);
  });

  it("AC-005.3/AC-006.5: argumento inválido (padrão do SDK e do agente) e ferramenta inexistente contam", () => {
    expect(veredictosDoPasso(passo(erroDoSdk("AI_InvalidToolInputError")))).toEqual(["erro"]);
    expect(veredictosDoPasso(passo(erroDoSdk("AI_NoSuchToolError")))).toEqual(["erro"]);
    expect(veredictosDoPasso(passo(resultado({ ok: false, error: { code: "invalid_payload", message: "x" } })))).toEqual(["erro"]);
    expect(veredictosDoPasso(passo(resultado({ error: "campo start é obrigatório" })))).toEqual(["erro"]);
  });

  it("AC-005.3: resultado sem erro é sucesso", () => {
    expect(veredictosDoPasso(passo(resultado({ ok: true })))).toEqual(["sucesso"]);
    expect(veredictosDoPasso(passo(resultado({ slots: [] })))).toEqual(["sucesso"]);
  });

  it("AC-005.3: falha de infraestrutura NÃO conta (rede, banco, exceção interna, trava do sistema)", () => {
    const ignoradas: unknown[] = [
      erroDoSdk("Error"), // exceção lançada dentro da ferramenta: bug ou infraestrutura, não erro de chamada do modelo
      resultado({ ok: false, error: { code: "internal_error", message: "x" } }),
      resultado({ ok: false, error: { code: "knowledge_unavailable", message: "x" } }),
      resultado({ ok: false, error: { code: "circuit_breaker_exact_failure", message: "x" } }),
      resultado({ ok: false, error: { code: "max_sends_per_turn", message: "x" } }),
      resultado({ error: "fetch failed" }),
      resultado({ error: "connect ECONNRESET 10.0.0.1:5432" }),
      resultado({ error: "timeout de 10000ms" }),
      resultado({ error: "x", resultado_incerto: true }),
      resultado({ permitido: false, motivo: "fora_do_escopo", mensagem: "x" }),
    ];
    for (const parte of ignoradas) {
      expect(veredictosDoPasso(passo(parte)), JSON.stringify(parte)).toEqual(["ignorar"]);
    }
  });

  it("AC-005.3: só partes de ferramenta entram na leitura do passo", () => {
    expect(veredictosDoPasso(passo({ type: "text", text: "oi" }, { type: "tool-call", toolName: "x" }))).toEqual([]);
    expect(veredictosDoPasso({})).toEqual([]);
  });
});

describe("AC-005.3: a contagem de erros seguidos", () => {
  const casos: Array<[number, VeredictoDaChamada[], number]> = [
    [0, ["erro"], 1],
    [1, ["erro"], 2],
    [1, ["sucesso"], 0],
    [1, ["ignorar"], 1],
    [1, ["erro", "sucesso"], 0],
    [0, ["sucesso", "erro"], 1],
    [0, ["erro", "erro"], 2],
  ];
  it.each(casos)("AC-005.3: de %i com %j sobra %i", (antes, vereditos, depois) => {
    expect(seguidasDepois(antes, vereditos)).toBe(depois);
  });
});

describe("AC-005.3: o contador por conversa", () => {
  const novo = (pool: never, extra: { conversationId?: string; organizationId?: string } = {}) =>
    criarContadorDeErrosDeFerramenta({
      pool,
      organizationId: extra.organizationId ?? ORG,
      conversationId: extra.conversationId ?? CONVERSA,
      log: log(),
    });
  const erro = passo(erroDoSdk("AI_InvalidToolInputError"));
  const ok = passo(resultado({ ok: true }));

  it("AC-005.3: o segundo erro seguido para o turno e marca o estouro; o primeiro não", async () => {
    const { pool } = bancoFalso();
    const c = novo(pool);
    expect(await c.pararQuando({ steps: [erro] })).toBe(false);
    expect(c.estourou()).toBe(false);
    expect(await c.pararQuando({ steps: [erro, erro] })).toBe(true);
    expect(c.estourou()).toBe(true);
  });

  it("AC-005.3: um sucesso reinicia a contagem", async () => {
    const { pool, linhas } = bancoFalso();
    const c = novo(pool);
    await c.pararQuando({ steps: [erro] });
    await c.pararQuando({ steps: [erro, ok] });
    expect(linhas.get(`${ORG}|${CONVERSA}`)).toBe(0);
    expect(await c.pararQuando({ steps: [erro, ok, erro] })).toBe(false);
    expect(c.estourou()).toBe(false);
  });

  it("AC-005.3: a contagem atravessa turnos da mesma conversa (vem do banco)", async () => {
    const { pool } = bancoFalso({ [`${ORG}|${CONVERSA}`]: 1 });
    const c = novo(pool);
    expect(await c.pararQuando({ steps: [erro] })).toBe(true);
  });

  it("AC-005.3: outra conversa e outra organização não somam", async () => {
    const { pool, linhas } = bancoFalso({ [`${ORG}|${OUTRA_CONVERSA}`]: 1, [`${OUTRA_ORG}|${CONVERSA}`]: 1 });
    const c = novo(pool);
    expect(await c.pararQuando({ steps: [erro] })).toBe(false);
    expect(linhas.get(`${ORG}|${CONVERSA}`)).toBe(1);
    expect(linhas.get(`${ORG}|${OUTRA_CONVERSA}`)).toBe(1);
    expect(linhas.get(`${OUTRA_ORG}|${CONVERSA}`)).toBe(1);
  });

  it("AC-005.3: erro de infraestrutura não soma nem reinicia", async () => {
    const { pool, linhas } = bancoFalso({ [`${ORG}|${CONVERSA}`]: 1 });
    const c = novo(pool);
    expect(await c.pararQuando({ steps: [passo(resultado({ error: "fetch failed" }))] })).toBe(false);
    expect(linhas.get(`${ORG}|${CONVERSA}`)).toBe(1);
  });

  it("AC-005.3: só grava ids e um número, nunca argumento, resultado ou texto de erro", async () => {
    const { pool, chamadas } = bancoFalso();
    const c = novo(pool);
    await c.pararQuando({ steps: [passo(erroDoSdk("AI_InvalidToolInputError"))] });
    for (const { sql, params } of chamadas) {
      expect(params.length).toBeLessThanOrEqual(3);
      expect(params.every((p) => typeof p === "string" || typeof p === "number")).toBe(true);
      expect(JSON.stringify(params)).not.toContain("sk-abc");
      if (!/^\s*select/i.test(sql)) expect(sql).toMatch(/organization_id/);
    }
    // filtro de organização em toda leitura
    expect(chamadas.find((x) => /^\s*select/i.test(x.sql))!.sql).toMatch(/organization_id\s*=\s*\$1/);
  });

  it("AC-005.3: o mesmo passo avaliado duas vezes não conta duas vezes", async () => {
    const { pool } = bancoFalso();
    const c = novo(pool);
    await c.pararQuando({ steps: [erro] });
    expect(await c.pararQuando({ steps: [erro] })).toBe(false);
  });

  it("AC-005.3: banco fora não derruba o turno: a contagem segue na memória", async () => {
    const { pool } = bancoFalso({}, { falha: true });
    const c = novo(pool);
    expect(await c.pararQuando({ steps: [erro] })).toBe(false);
    expect(await c.pararQuando({ steps: [erro, erro] })).toBe(true);
  });

  it("AC-005.3: depois da passagem a contagem volta a zero", async () => {
    const { pool, linhas } = bancoFalso({ [`${ORG}|${CONVERSA}`]: 2 });
    const c = novo(pool);
    await c.zerar();
    expect(linhas.get(`${ORG}|${CONVERSA}`)).toBe(0);
  });
});
