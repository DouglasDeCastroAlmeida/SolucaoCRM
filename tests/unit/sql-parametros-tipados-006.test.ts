import { describe, expect, it, vi } from "vitest";

import { abrirAvisoDoProvedor } from "@/lib/agent-engine/agent/falha-do-provedor";
import { SQL_REIVINDICAR_AVISO_POR_EMAIL } from "@/lib/ai/orcamento/aviso-por-email";

/**
 * Parâmetro posicional sem tipo, usado em select de INSERT ... SELECT, é deduzido como text e
 * pode colidir com a coluna (uuid/citext): o Postgres devolve 42P08. O invariante de banco só
 * roda no CI (test:db), então o texto do SQL de produção declara o tipo de cada parâmetro e
 * este teste cobra isso sem banco.
 */
describe("SQL novo da mudança 006 declara o tipo de cada parâmetro", () => {
  it("abrirAvisoDoProvedor: $1 e $4 uuid, $2 e $3 text, em toda ocorrência", async () => {
    const query = vi.fn(async (_sql: string, _p?: unknown[]) => ({ rows: [] }));
    await abrirAvisoDoProvedor(
      { query },
      { tenantId: "t", conversationId: "c", causa: "sem_saldo" },
      { warn: () => undefined },
    );
    const sql = query.mock.calls[0]![0];
    for (const m of sql.matchAll(/\$(\d)(::\w+)?/g)) {
      expect(m[2], `$${m[1]} sem cast em: ${sql}`).toBe(m[1] === "1" || m[1] === "4" ? "::uuid" : "::text");
    }
  });

  it("aviso por e-mail: o tipo do evento e o payload têm cast; $1 só compara com a coluna", () => {
    expect(SQL_REIVINDICAR_AVISO_POR_EMAIL).toContain("$2::text");
    expect(SQL_REIVINDICAR_AVISO_POR_EMAIL).toContain("$3::jsonb");
  });
});
