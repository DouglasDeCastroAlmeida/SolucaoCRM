/**
 * AC-001.7 (mudança SDD 006): o aviso `ia_provedor_indisponivel` da Central.
 *
 * Postgres real porque a propriedade é do SQL de `abrirAvisoDoProvedor`:
 *   - UM aviso por organização enquanto houver um aberto ou visto (`ack`);
 *   - só volta a abrir depois de resolvido;
 *   - organizações não se enxergam (uma não silencia o aviso da outra);
 *   - o kind passa no CHECK da migration 0724.
 * A guarda de vacuidade é o primeiro caso: sem o primeiro insert funcionar, "não
 * duplicou" seria verde por não medir nada.
 */
import pg from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { abrirAvisoDoProvedor } from "@/lib/agent-engine/agent/falha-do-provedor";

const container = process.env.TEST_DB_CONTAINER;
if (!container) {
  throw new Error("TEST_DB_CONTAINER not set — rode via `pnpm test:db` (scripts/test-db.sh)");
}
const PORT = Number(process.env.TEST_DB_PORT ?? 54329);
const pool = new pg.Pool({
  connectionString: `postgresql://postgres:postgres@127.0.0.1:${PORT}/postgres`,
  max: 2,
});

const ORG_A = "0a7c0000-0000-4000-8000-0000000000a1";
const ORG_B = "0a7c0000-0000-4000-8000-0000000000b1";
const CONVERSA = "0a7c0000-0000-4000-8000-0000000000c1";
const log = { warn: () => undefined };

async function itens(org: string) {
  const { rows } = await pool.query<{ id: string; status: string }>(
    `select id, status from agent_inbox_items where organization_id = $1 and kind = 'ia_provedor_indisponivel'`,
    [org],
  );
  return rows;
}

beforeAll(async () => {
  for (const [id, slug] of [
    [ORG_A, "org-provedor-a"],
    [ORG_B, "org-provedor-b"],
  ] as const) {
    await pool.query(
      `insert into organizations (id, slug, legal_name, display_name) values ($1, $2, $2, $2)
       on conflict (id) do nothing`,
      [id, slug],
    );
  }
});

afterAll(async () => {
  await pool.query("delete from organizations where id = any($1)", [[ORG_A, ORG_B]]);
  await pool.end();
});

describe("aviso ia_provedor_indisponivel na Central", () => {
  it("GUARDA DE VACUIDADE — a primeira falha abre o aviso", async () => {
    await abrirAvisoDoProvedor(pool, { tenantId: ORG_A, conversationId: CONVERSA, causa: "chave_recusada" }, log);
    expect(await itens(ORG_A)).toHaveLength(1);
  });

  it("mais falhas (várias conversas) não abrem outro enquanto há aviso aberto ou visto", async () => {
    await abrirAvisoDoProvedor(pool, { tenantId: ORG_A, conversationId: CONVERSA, causa: "chave_recusada" }, log);
    expect(await itens(ORG_A)).toHaveLength(1);
    await pool.query(`update agent_inbox_items set status = 'ack' where organization_id = $1 and kind = 'ia_provedor_indisponivel'`, [ORG_A]);
    await abrirAvisoDoProvedor(pool, { tenantId: ORG_A, conversationId: CONVERSA, causa: "sem_saldo" }, log);
    expect(await itens(ORG_A), "aviso visto (ack) ainda é aviso vivo").toHaveLength(1);
  });

  it("depois de resolvido, o problema que volta reabre o aviso", async () => {
    await pool.query(`update agent_inbox_items set status = 'resolved' where organization_id = $1 and kind = 'ia_provedor_indisponivel'`, [ORG_A]);
    await abrirAvisoDoProvedor(pool, { tenantId: ORG_A, conversationId: CONVERSA, causa: "sem_saldo" }, log);
    const rows = await itens(ORG_A);
    expect(rows).toHaveLength(2);
    expect(rows.filter((r) => r.status === "open")).toHaveLength(1);
  });

  it("isolamento: o aviso de uma organização não silencia o da outra", async () => {
    expect(await itens(ORG_B)).toHaveLength(0);
    await abrirAvisoDoProvedor(pool, { tenantId: ORG_B, conversationId: CONVERSA, causa: "provedor_fora" }, log);
    expect(await itens(ORG_B)).toHaveLength(1);
  });
});
