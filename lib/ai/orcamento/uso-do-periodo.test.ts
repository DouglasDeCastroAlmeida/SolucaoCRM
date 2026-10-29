import { describe, expect, it, vi } from "vitest";

import { carregarUsoDoPeriodo } from "./uso-do-periodo";

const ORG = "33333333-3333-4333-8333-333333333333";
const AGORA = new Date("2026-10-28T12:00:00.000Z");

const agregado = (custo: number, entrada: number, saida: number) => ({
  chamadas: 1,
  custo_cents: custo,
  input_tokens: entrada,
  output_tokens: saida,
  cache_read_tokens: 0,
  cache_write_tokens: 0,
  p50_latency_ms: 0,
  p95_latency_ms: 0,
});
const corpo = (custo: number, entrada: number, saida: number) => ({
  totais: { ...agregado(custo, entrada, saida), turnos: 0, custo_dos_turnos_cents: 0 },
  dias: [],
  purposes: [],
  inbounds: {},
  handoffs: {},
});

type Chamada = { agent_id: string; model: string };

function clienteFalso(opcoes: { rpcFalha?: boolean; pagina?: (n: number) => Chamada[] } = {}) {
  const rpc = vi.fn(async (_nome: string, args: Record<string, unknown>) => {
    if (opcoes.rpcFalha) return { data: null, error: { message: "boom" } };
    if (args.p_agent_id === "a1") return { data: corpo(900, 3000, 500), error: null };
    if (args.p_agent_id === "a2") return { data: corpo(300, 1000, 500), error: null };
    return { data: corpo(1200, 4000, 1000), error: null };
  });
  const filtros: Array<[string, unknown]> = [];
  const construtor = (tabela: string) => {
    const b: Record<string, unknown> = {};
    const encadear = () => b;
    b.select = encadear;
    b.eq = (c: string, v: unknown) => (filtros.push([`${tabela}.${c}`, v]), b);
    b.gte = (c: string, v: unknown) => (filtros.push([`${tabela}.${c}`, v]), b);
    b.in = encadear;
    b.order = encadear;
    const padrao = (n: number): Chamada[] =>
      n === 0
        ? [
            { agent_id: "a1", model: "claude-sonnet-5" },
            { agent_id: "a2", model: "modelo-que-ninguem-precifica" },
          ]
        : [];
    const pagina = opcoes.pagina ?? padrao;
    b.limit = async () => (tabela === "llm_calls" ? { data: pagina(0), error: null } : { data: [], error: null });
    b.range = async (de: number) =>
      tabela === "llm_calls" ? { data: pagina(Math.floor(de / 1000)), error: null } : { data: [], error: null };
    b.then = undefined;
    return b;
  };
  return { cliente: { rpc, from: construtor } as never, rpc, filtros };
}

describe("AC-004.4: carregar o uso do mês por agente e total", () => {
  it("AC-004.4: pede ao banco o total e um por agente, todos da organização e desde o dia 1 do mês", async () => {
    const { cliente, rpc } = clienteFalso();

    await carregarUsoDoPeriodo(cliente, {
      organizationId: ORG,
      agentes: [
        { id: "a1", name: "Atendimento" },
        { id: "a2", name: "Vendas" },
      ],
      tetoCents: 5000,
      agora: AGORA,
    });

    expect(rpc).toHaveBeenCalledTimes(3);
    for (const [nome, args] of rpc.mock.calls) {
      expect(nome).toBe("fn_uso_de_ia");
      expect(args.p_org).toBe(ORG);
      expect(args.p_desde).toBe("2026-10-01T00:00:00.000Z");
    }
  });

  it("AC-004.4 e AC-004.6: devolve os números reais e marca estimado só quem usou modelo sem preço", async () => {
    const { cliente } = clienteFalso();

    const uso = await carregarUsoDoPeriodo(cliente, {
      organizationId: ORG,
      agentes: [
        { id: "a1", name: "Atendimento" },
        { id: "a2", name: "Vendas" },
      ],
      tetoCents: 5000,
      agora: AGORA,
    });

    expect(uso?.tetoCents).toBe(5000);
    expect(uso?.total).toMatchObject({ tokens: 5000, custoCents: 1200, estimado: true });
    expect(uso?.porAgente.map((a) => [a.nome, a.custoCents, a.estimado])).toEqual([
      ["Atendimento", 900, false],
      ["Vendas", 300, true],
    ]);
  });

  it("AC-004.4: se o banco falhar, devolve null (a tela não inventa número)", async () => {
    const { cliente } = clienteFalso({ rpcFalha: true });

    const uso = await carregarUsoDoPeriodo(cliente, {
      organizationId: ORG,
      agentes: [{ id: "a1", name: "Atendimento" }],
      tetoCents: 5000,
      agora: AGORA,
    });

    expect(uso).toBeNull();
  });

  it("AC-004.6: mês com mais de 1000 chamadas é lido por páginas até esgotar, e acha o modelo sem preço da segunda página", async () => {
    const cheia = Array.from({ length: 1000 }, () => ({ agent_id: "a1", model: "claude-sonnet-5" }));
    const { cliente } = clienteFalso({
      pagina: (n) => (n === 0 ? cheia : n === 1 ? [{ agent_id: "a2", model: "modelo-que-ninguem-precifica" }] : []),
    });

    const uso = await carregarUsoDoPeriodo(cliente, {
      organizationId: ORG,
      agentes: [
        { id: "a1", name: "Atendimento" },
        { id: "a2", name: "Vendas" },
      ],
      tetoCents: 5000,
      agora: AGORA,
    });

    expect(uso?.porAgente.map((a) => a.estimado)).toEqual([false, true]);
    expect(uso?.possivelmenteEstimado).toBe(false);
  });

  it("AC-004.6: se a leitura das chamadas não esgota o mês, total e agentes com custo levam o selo estimado e a nota de dúvida", async () => {
    const cheia = Array.from({ length: 1000 }, () => ({ agent_id: "a1", model: "claude-sonnet-5" }));
    const { cliente } = clienteFalso({ pagina: () => cheia });

    const uso = await carregarUsoDoPeriodo(cliente, {
      organizationId: ORG,
      agentes: [
        { id: "a1", name: "Atendimento" },
        { id: "a2", name: "Vendas" },
      ],
      tetoCents: 5000,
      agora: AGORA,
    });

    expect(uso?.possivelmenteEstimado).toBe(true);
    expect(uso?.total.estimado).toBe(true);
    expect(uso?.porAgente.map((a) => a.estimado)).toEqual([true, true]);
  });
});
