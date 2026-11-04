import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * AC-009.2 (mudança 005, pendência do ADR-008): a cascata de anonimização enfileira para remoção
 * TODOS os anexos de uma mensagem de e-mail (`metadata.email.anexos[].caminho`), não só o primeiro
 * (`media_storage_path`). O efeito no banco (a RPC enfileira também) é de
 * `tests/invariants/email-lgpd-anonimiza.test.ts`; aqui fica o que é do APP: o que entra na fila,
 * só da própria organização, e antes da RPC.
 */

const ORG = "11111111-1111-4111-8111-111111111111";
const OUTRA = "99999999-9999-4999-8999-999999999999";
const CONTATO = "22222222-2222-4222-8222-222222222222";
const PEDIDO = "33333333-3333-4333-8333-333333333333";

const ops: string[] = [];
const filas: Array<Record<string, unknown>> = [];
let mensagens: Array<{ id: string; metadata: unknown }> = [];
let erroDaFila: { message: string } | null = null;

function chain(resolver: () => Promise<unknown>): Record<string, unknown> {
  const proxy: Record<string, unknown> = new Proxy(
    {},
    {
      get(_t, prop) {
        if (prop === "then") {
          return (ok: (v: unknown) => unknown, falha: (e: unknown) => unknown) => resolver().then(ok, falha);
        }
        if (prop === "maybeSingle" || prop === "single") return () => resolver();
        return () => proxy;
      },
    },
  ) as Record<string, unknown>;
  return proxy;
}

vi.mock("@/lib/supabase/admin", () => ({
  createAdminClient: () => ({
    from: (tabela: string) => ({
      select: () =>
        chain(async () => {
          ops.push(`select:${tabela}`);
          if (tabela === "contacts") return { data: { avatar_storage_path: null }, error: null };
          if (tabela === "conversations") return { data: [{ id: "c1" }], error: null };
          if (tabela === "messages") return { data: mensagens, error: null };
          return { data: [], error: null };
        }),
      upsert: (payload: Record<string, unknown>) =>
        chain(async () => {
          ops.push(`upsert:${tabela}`);
          filas.push(payload);
          return { error: erroDaFila };
        }),
      update: () => chain(async () => ({ error: null })),
    }),
    rpc: async () => {
      ops.push("rpc");
      return { data: { already_anonymized: false, counts: {}, media_paths: [] }, error: null };
    },
  }),
}));

import { cascadeRedactContact } from "@/lib/lgpd/redact-cascade";

beforeEach(() => {
  ops.length = 0;
  filas.length = 0;
  erroDaFila = null;
  mensagens = [
    {
      id: "m1",
      metadata: {
        email: {
          anexos: [
            { nome: "a.pdf", caminho: `${ORG}/c1/m1-0.pdf` },
            { nome: "b.png", caminho: `${ORG}/c1/m1-1.png` },
            { nome: "c.zip", caminho: null },
            { nome: "alheio.pdf", caminho: `${OUTRA}/c9/m9-0.pdf` },
          ],
        },
      },
    },
    { id: "m2", metadata: { email: {} } },
    { id: "m3", metadata: null },
  ];
});

describe("AC-009.2: anexos de e-mail na cascata de anonimização", () => {
  it("AC-009.2: enfileira todos os anexos da própria organização, em whatsapp-media, antes da RPC", async () => {
    await cascadeRedactContact({ organizationId: ORG, contactId: CONTATO, requestId: PEDIDO });

    expect(filas.map((f) => f.object_path)).toEqual([`${ORG}/c1/m1-0.pdf`, `${ORG}/c1/m1-1.png`]);
    expect(filas.every((f) => f.bucket === "whatsapp-media" && f.organization_id === ORG)).toBe(true);
    expect(filas.every((f) => f.request_id === PEDIDO && f.status === "pending")).toBe(true);
    expect(ops.lastIndexOf("upsert:storage_redaction_queue")).toBeLessThan(ops.indexOf("rpc"));
  });

  it("AC-009.2: nunca enfileira caminho de outra organização, nem anexo sem caminho", async () => {
    await cascadeRedactContact({ organizationId: ORG, contactId: CONTATO, requestId: PEDIDO });
    expect(filas.some((f) => String(f.object_path).startsWith(OUTRA))).toBe(false);
    expect(filas).toHaveLength(2);
  });

  it("AC-009.2: falha ao enfileirar ABORTA a cascata antes da RPC (falha fechada)", async () => {
    erroDaFila = { message: "fila indisponivel" };
    await expect(
      cascadeRedactContact({ organizationId: ORG, contactId: CONTATO, requestId: PEDIDO }),
    ).rejects.toThrow(/mídia não enfileirada/);
    expect(ops).not.toContain("rpc");
  });
});
