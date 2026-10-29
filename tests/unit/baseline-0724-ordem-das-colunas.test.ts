import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

/**
 * AC-009.2 (mudança SDD 006): o apêndice 0724 do baseline não lê coluna que só
 * nasce depois dele. O `install.sh` aplica o arquivo com ON_ERROR_STOP=1; um
 * `insert ... select` sobre coluna ainda inexistente derruba a instalação nova
 * (42703). Estático: não precisa de Postgres.
 */
const baseline = readFileSync(join(process.cwd(), "supabase", "baseline.sql"), "utf8");
const ROTULO = "-- ---- agente: padrões seguros e MCP com vários servidores (migration 0724) ----";
const inicio = baseline.indexOf(ROTULO);
const fim = baseline.indexOf("\n-- ---- ", inicio + 10);
const bloco = baseline.slice(inicio, fim);

const COLUNAS = [
  "mcp_externo_chave_encrypted",
  "mcp_externo_chave_iv",
  "mcp_externo_chave_tag",
  "mcp_externo_chave_last4",
];

describe("AC-009.2: o apêndice 0724 cria, antes de ler, as colunas que lê", () => {
  it("AC-009.2: o bloco existe e tem o insert da migração do servidor", () => {
    expect(inicio).toBeGreaterThan(-1);
    expect(bloco).toContain("insert into public.mcp_servidores_externos");
  });

  for (const coluna of COLUNAS) {
    it(`AC-009.2: ${coluna} é criada dentro do bloco, antes do insert que a lê`, () => {
      const criada = bloco.search(new RegExp(`add column if not exists ${coluna}\\b`));
      const lida = bloco.indexOf(`o.${coluna}`);
      expect(criada, "criação dentro do bloco").toBeGreaterThan(-1);
      expect(lida, "leitura dentro do bloco").toBeGreaterThan(-1);
      expect(criada).toBeLessThan(lida);
    });
  }

  it("AC-008.4: authenticated não recebe a coluna 'argumentos' da ação pendente", () => {
    const grant = /grant select \(([^)]*)\)\s+on public\.mcp_acoes_pendentes/.exec(bloco)?.[1] ?? "";
    expect(grant).toContain("estado");
    expect(grant).not.toMatch(/\bargumentos\b/);
  });
});
