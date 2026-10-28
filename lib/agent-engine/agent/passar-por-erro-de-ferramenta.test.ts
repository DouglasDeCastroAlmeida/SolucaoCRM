import { describe, expect, it, vi } from "vitest";

import { passarPorErroDeFerramenta } from "@/lib/agent-engine/agent/passar-por-erro-de-ferramenta";
import { RESUMO_DO_HANDOFF_POR_ERRO_DE_FERRAMENTA } from "@/lib/ai/handoff/falhas-de-ferramenta";

/** AC-005.3: o desfecho do turno que estourou o limite de erros de ferramenta. */
function montar(opts: { estourou: boolean; passouParaAEquipe: boolean; avisoLanca?: boolean }) {
  const ordem: string[] = [];
  const log = { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() };
  const avisarLead = vi.fn(async () => {
    ordem.push("aviso");
    if (opts.avisoLanca) throw new Error("canal fora");
    return { avisado: true as const };
  });
  const passar = vi.fn(async (_a: unknown) => {
    ordem.push("passar");
  });
  const zerar = vi.fn(async () => {
    ordem.push("zerar");
  });
  const deps = {
    contador: { estourou: () => opts.estourou, zerar },
    passouParaAEquipe: opts.passouParaAEquipe,
    avisarLead,
    briefingBase: () => ({ body: "contexto do cliente" }) as never,
    passar,
    log: log as never,
  };
  return { deps, ordem, avisarLead, passar, zerar, log };
}

describe("AC-005.3: passar a conversa quando a ferramenta falhou duas vezes seguidas", () => {
  it("AC-005.3: estourou e a conversa ainda é do agente: avisa, passa com o motivo, zera e encerra o turno", async () => {
    const m = montar({ estourou: true, passouParaAEquipe: false });
    await expect(passarPorErroDeFerramenta(m.deps)).resolves.toBe(true);
    expect(m.ordem).toEqual(["aviso", "passar", "zerar"]);
    const arg = m.passar.mock.calls[0]![0] as {
      reason: string;
      avisoAoLead: unknown;
      passagem: { origem: string; motivoCodigo: string; briefing: { body: string } };
    };
    expect(arg.reason).toBe("erro_de_ferramenta");
    expect(arg.passagem).toMatchObject({ origem: "runtime_nativo", motivoCodigo: "erro_de_ferramenta" });
    expect(arg.passagem.briefing.body).toBe(`${RESUMO_DO_HANDOFF_POR_ERRO_DE_FERRAMENTA}\n\ncontexto do cliente`);
    expect(arg.avisoAoLead).toEqual({ avisado: true });
  });

  it("AC-005.3: o modelo já tinha passado a conversa neste turno: só zera, sem segunda passagem nem segundo aviso", async () => {
    const m = montar({ estourou: true, passouParaAEquipe: true });
    await expect(passarPorErroDeFerramenta(m.deps)).resolves.toBe(false);
    expect(m.ordem).toEqual(["zerar"]);
    expect(m.passar).not.toHaveBeenCalled();
    expect(m.avisarLead).not.toHaveBeenCalled();
  });

  it("AC-005.3: não estourou: não faz nada", async () => {
    const m = montar({ estourou: false, passouParaAEquipe: false });
    await expect(passarPorErroDeFerramenta(m.deps)).resolves.toBe(false);
    expect(m.ordem).toEqual([]);
  });

  it("AC-005.3: aviso que lança não impede a passagem (o cliente fica sem aviso, mas com atendente)", async () => {
    const m = montar({ estourou: true, passouParaAEquipe: false, avisoLanca: true });
    await expect(passarPorErroDeFerramenta(m.deps)).resolves.toBe(true);
    expect(m.passar).toHaveBeenCalledTimes(1);
    expect((m.passar.mock.calls[0]![0] as { avisoAoLead: unknown }).avisoAoLead).toMatchObject({
      avisado: false,
      porque: "erro_no_envio",
    });
    expect(m.ordem).toEqual(["aviso", "passar", "zerar"]);
  });
});
