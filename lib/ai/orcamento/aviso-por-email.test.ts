import { describe, expect, it, vi } from "vitest";

import { aplicarOrcamento } from "@/lib/agent-engine/edge/llm/run-model-call";

import { EVENTO_AVISO_DE_ORCAMENTO, reivindicarAvisoPorEmail } from "./aviso-por-email";
import { enviarAvisoDeOrcamentoPorEmail, textoDoAvisoDeOrcamento } from "./aviso-por-email-envio";

const ORG = "33333333-3333-4333-8333-333333333333";

describe("AC-004.2: o aviso de 80% por e-mail sai uma única vez no período", () => {
  it("AC-004.2: a primeira reivindicação do mês vence e emite o evento pelo mesmo comando", async () => {
    const query = vi.fn(async () => ({ rows: [{ id: "evento-1" }] }));

    const venceu = await reivindicarAvisoPorEmail({ query } as never, {
      organizationId: ORG,
      gastoCents: 4100,
      tetoCents: 5000,
    });

    expect(venceu).toBe(true);
    const [sql, params] = query.mock.calls[0] as unknown as [string, unknown[]];
    expect(sql).toContain("last_alarm_sent_at");
    expect(sql).toContain("date_trunc('month', now())");
    expect(sql).toContain("event_log");
    expect(params[0]).toBe(ORG);
    expect(params[1]).toBe(EVENTO_AVISO_DE_ORCAMENTO);
  });

  it("AC-004.2: já avisado neste mês (o comando não devolve linha), a reivindicação perde", async () => {
    const query = vi.fn(async () => ({ rows: [] }));

    const venceu = await reivindicarAvisoPorEmail({ query } as never, {
      organizationId: ORG,
      gastoCents: 4300,
      tetoCents: 5000,
    });

    expect(venceu).toBe(false);
  });

  it("AC-004.2: banco que falha não derruba a chamada: devolve false e não lança", async () => {
    const query = vi.fn(async () => {
      throw new Error("conexão caiu");
    });

    const venceu = await reivindicarAvisoPorEmail({ query } as never, {
      organizationId: ORG,
      gastoCents: 4300,
      tetoCents: 5000,
    });

    expect(venceu).toBe(false);
  });
});

describe("AC-004.2: o gate pede o e-mail só quando o veredito é avisar", () => {
  function gate(gasto: string) {
    const claims: string[] = [];
    const query = vi.fn(async (sql: string) => {
      if (sql.includes("fn_gasto_de_ia_do_mes")) {
        return {
          rows: [{ teto: 5000, modo: "bloquear", efetivo_em: new Date(0), limiar_pct: 80, gasto, avisado_antes: false }],
        };
      }
      if (sql.includes("last_alarm_sent_at")) {
        claims.push(sql);
        return { rows: [{ id: "e" }] };
      }
      return { rows: [] };
    });
    return { claims, query };
  }

  async function rodar(gasto: string) {
    const { claims, query } = gate(gasto);
    await aplicarOrcamento({
      db: { query } as never,
      organizationId: ORG,
      orcamentoDaConfig: { modo: "bloquear", tetoCents: 5000, efetivoEm: new Date(0), limiarPct: 80 },
      orcamentoIndisponivelPorque: null,
      chave: "on",
      origemDaChave: "credencial_da_organizacao",
      purpose: "agent_turn",
      provider: "anthropic",
      model: "claude-sonnet-5",
      origem: "teste",
      input: { tenantId: ORG } as never,
    });
    return claims;
  }

  it("AC-004.2: gasto entre 80% e 100% reivindica o aviso por e-mail", async () => {
    const claims = await rodar("4100");

    expect(claims).toHaveLength(1);
  });

  it("AC-004.2: gasto abaixo de 80% não pede e-mail nenhum", async () => {
    const claims = await rodar("3000");

    expect(claims).toHaveLength(0);
  });
});

describe("AC-004.2: texto do e-mail em português simples e sem segredo", () => {
  it("AC-004.2: diz quanto gastou, qual o teto e o que acontece aos 100%, em dólar", () => {
    const t = textoDoAvisoDeOrcamento({ gastoCents: 4100, tetoCents: 5000, idioma: "pt-BR" });

    expect(t.titulo).toContain("80%");
    expect(t.corpo).toContain("US$ 41,00");
    expect(t.corpo).toContain("US$ 50,00");
    expect(t.corpo).toContain("pessoa");
  });
});

describe("AC-004.2: envio pela marca da organização, sem e-mail configurado só registra", () => {
  const base = {
    organizationId: ORG,
    gastoCents: 4100,
    tetoCents: 5000,
    idioma: "pt-BR" as const,
    marca: { nome: "Clinica Aurora", logoUrl: null, accent: "#336699", accentFg: "#ffffff", origens: { nome: "organizacao", cor: "organizacao" } },
    link: "https://crm.exemplo.com.br/app/ai/usage",
  };

  it("AC-004.2: manda um e-mail a cada admin, com a marca da organização no assunto", async () => {
    const enviar = vi.fn(async () => ({ ok: true }));

    const r = await enviarAvisoDeOrcamentoPorEmail({
      ...base,
      destinatarios: ["a@x.com", "b@x.com"],
      enviar,
    } as never);

    expect(r).toEqual({ enviados: 2, falhas: 0, semEmail: false });
    expect(enviar).toHaveBeenCalledTimes(2);
    const arg = (enviar.mock.calls[0] as unknown as [{ to: string; subject: string; fromName: string }])[0];
    expect(arg.to).toBe("a@x.com");
    expect(arg.subject).toContain("Clinica Aurora");
    expect(arg.fromName).toBe("Clinica Aurora");
  });

  it("AC-004.2: sem e-mail configurado (not_configured) segue sem lançar e conta como semEmail", async () => {
    const enviar = vi.fn(async () => ({ ok: false, error: "not_configured" }));

    const r = await enviarAvisoDeOrcamentoPorEmail({
      ...base,
      destinatarios: ["a@x.com", "b@x.com"],
      enviar,
    } as never);

    expect(r).toEqual({ enviados: 0, falhas: 0, semEmail: true });
    expect(enviar).toHaveBeenCalledTimes(1);
  });

  it("AC-004.2: sem administradores com e-mail, não envia nada", async () => {
    const enviar = vi.fn(async () => ({ ok: true }));

    const r = await enviarAvisoDeOrcamentoPorEmail({ ...base, destinatarios: [], enviar } as never);

    expect(r).toEqual({ enviados: 0, falhas: 0, semEmail: false });
    expect(enviar).not.toHaveBeenCalled();
  });
});
