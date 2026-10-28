import { describe, expect, it } from "vitest";

import { KIND_LABEL } from "@/lib/ai/agent-inbox-copy";
import { POLITICAS_DE_AVISO } from "@/lib/ai/inbox-destino";
import { FRASE_DO_MOTIVO, MOTIVOS_DA_PASSAGEM } from "@/lib/escalacao/passagem";

/**
 * AC-001.7 (mudança SDD 006, Fatia 3): o vocabulário novo existe nos dois lados.
 * O lado do banco (CHECKs) é provado por `tests/invariants/vocabulario-banco-x-typescript.test.ts`
 * e por `tests/invariants/agente-padroes-e-mcp-multi-servidor.test.ts`; aqui o lado TypeScript.
 */
describe("AC-001.7: motivo e avisos da falha do provedor de IA", () => {
  it("AC-001.7: 'provedor_indisponivel' é um motivo da passagem com frase própria", () => {
    expect(MOTIVOS_DA_PASSAGEM).toContain("provedor_indisponivel");
    expect(FRASE_DO_MOTIVO.provedor_indisponivel).toBe(
      "O serviço de IA não respondeu — o cliente não pediu uma pessoa",
    );
  });

  it("AC-001.7: 'erro_de_ferramenta' é um motivo da passagem com frase própria", () => {
    expect(MOTIVOS_DA_PASSAGEM).toContain("erro_de_ferramenta");
    expect(FRASE_DO_MOTIVO.erro_de_ferramenta).not.toBe("");
  });

  it("AC-001.7: a Central tem rótulo e destino para o aviso de provedor indisponível", () => {
    expect(KIND_LABEL.ia_provedor_indisponivel).toBe("O serviço de IA parou de responder");
    expect(POLITICAS_DE_AVISO.ia_provedor_indisponivel.refs).toContain("conversation");
  });

  it("AC-007.3: a Central tem rótulo e destino para a ação de MCP pendente", () => {
    expect(KIND_LABEL.acao_mcp_pendente).toBe("Uma ação em um sistema externo espera aprovação");
    expect(POLITICAS_DE_AVISO.acao_mcp_pendente.refs).toContain("conversation");
  });
});
