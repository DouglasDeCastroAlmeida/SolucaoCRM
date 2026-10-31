import { describe, expect, it, vi } from "vitest";

import { chaveDoHashDeDocumento, hashDoDocumento, hashDoDocumentoDoServidor } from "./documento-hash";

const envFalsa = vi.hoisted(() => ({ BILLING_TRIAL_DOCUMENTO_PEPPER: "", CPF_ENCRYPTION_KEY: "" }));
vi.mock("@/lib/env", () => ({ env: envFalsa }));

const SEGREDO_A = "segredo-de-servidor-a-com-mais-de-32-caracteres";
const SEGREDO_B = "segredo-de-servidor-b-com-mais-de-32-caracteres";
const CPF = "529.982.247-25";

describe("hash do documento do trial", () => {
  it("AC-003.5: é determinístico e ignora a máscara (só dígitos)", () => {
    const chave = chaveDoHashDeDocumento(SEGREDO_A);
    expect(hashDoDocumento("529.982.247-25", chave)).toBe(hashDoDocumento("52998224725", chave));
    expect(hashDoDocumento(CPF, chave)).toBe(hashDoDocumento(CPF, chave));
  });

  it("AC-003.5: saída em 64 hex que não contém o documento", () => {
    const h = hashDoDocumento(CPF, chaveDoHashDeDocumento(SEGREDO_A));
    expect(h).toMatch(/^[0-9a-f]{64}$/);
    expect(h).not.toContain("52998224725");
  });

  it("AC-003.5: documentos diferentes dão hashes diferentes", () => {
    const chave = chaveDoHashDeDocumento(SEGREDO_A);
    expect(hashDoDocumento("52998224725", chave)).not.toBe(hashDoDocumento("11144477735", chave));
  });

  it("AC-003.6: chave diferente dá hash diferente para o mesmo documento", () => {
    expect(hashDoDocumento(CPF, chaveDoHashDeDocumento(SEGREDO_A))).not.toBe(
      hashDoDocumento(CPF, chaveDoHashDeDocumento(SEGREDO_B)),
    );
  });

  it("AC-003.5: a chave derivada não é o segredo e segredo curto ou vazio é recusado", () => {
    expect(chaveDoHashDeDocumento(SEGREDO_A).toString("utf8")).not.toContain(SEGREDO_A);
    expect(() => chaveDoHashDeDocumento("")).toThrow();
    expect(() => chaveDoHashDeDocumento("curto")).toThrow();
  });

  it("AC-003.5: documento sem dígitos nem letras do CNPJ é recusado", () => {
    expect(() => hashDoDocumento("   ", chaveDoHashDeDocumento(SEGREDO_A))).toThrow();
  });
});

describe("segredo do hash do servidor", () => {
  const PEPPER = "pepper-do-trial-com-mais-de-32-caracteres-ok";

  it("AC-003.5: sem pepper, cai em CPF_ENCRYPTION_KEY", () => {
    envFalsa.BILLING_TRIAL_DOCUMENTO_PEPPER = "";
    envFalsa.CPF_ENCRYPTION_KEY = SEGREDO_A;
    expect(hashDoDocumentoDoServidor(CPF)).toBe(hashDoDocumento(CPF, chaveDoHashDeDocumento(SEGREDO_A)));
  });

  it("AC-003.5: com pepper, usa o pepper e ignora CPF_ENCRYPTION_KEY", () => {
    envFalsa.BILLING_TRIAL_DOCUMENTO_PEPPER = PEPPER;
    envFalsa.CPF_ENCRYPTION_KEY = SEGREDO_A;
    expect(hashDoDocumentoDoServidor(CPF)).toBe(hashDoDocumento(CPF, chaveDoHashDeDocumento(PEPPER)));
    expect(hashDoDocumentoDoServidor(CPF)).not.toBe(hashDoDocumento(CPF, chaveDoHashDeDocumento(SEGREDO_A)));
  });
});
