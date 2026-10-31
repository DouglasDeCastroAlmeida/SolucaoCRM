import { afterEach, describe, expect, it, vi } from "vitest";

/** Mudança 003, ADR-006: pepper opcional; env nova nunca quebra .env antigo. */
const ORIGINAL = process.env.BILLING_TRIAL_DOCUMENTO_PEPPER;

async function carregar(valor: string | undefined) {
  vi.resetModules();
  if (valor === undefined) delete process.env.BILLING_TRIAL_DOCUMENTO_PEPPER;
  else process.env.BILLING_TRIAL_DOCUMENTO_PEPPER = valor;
  return (await import("@/lib/env")).env;
}

describe("BILLING_TRIAL_DOCUMENTO_PEPPER", () => {
  afterEach(() => {
    if (ORIGINAL === undefined) delete process.env.BILLING_TRIAL_DOCUMENTO_PEPPER;
    else process.env.BILLING_TRIAL_DOCUMENTO_PEPPER = ORIGINAL;
    vi.resetModules();
  });

  it("AC-003.5: ausente ou vazia não quebra o .env antigo (vira vazio)", async () => {
    expect((await carregar(undefined)).BILLING_TRIAL_DOCUMENTO_PEPPER).toBe("");
    expect((await carregar("")).BILLING_TRIAL_DOCUMENTO_PEPPER).toBe("");
  });

  it("AC-003.5: com 32+ caracteres é aceita", async () => {
    const v = "p".repeat(32);
    expect((await carregar(v)).BILLING_TRIAL_DOCUMENTO_PEPPER).toBe(v);
  });

  it("AC-003.5: presente e curta é recusada", async () => {
    await expect(carregar("curta")).rejects.toThrow();
  });
});
