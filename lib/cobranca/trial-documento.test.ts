/**
 * Um trial por documento por marca (mudança 003, ADR-006). O banco é um dublê em
 * memória de `cobranca_trial_documentos` (chave primária marca + hash, 23505 na
 * repetição); o hash é o real (HMAC), com o segredo do servidor falso.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

const envFalsa = vi.hoisted(() => ({
  BILLING_TRIAL_DOCUMENTO_PEPPER: "pepper-de-teste-com-mais-de-32-caracteres",
  CPF_ENCRYPTION_KEY: "",
}));
vi.mock("@/lib/env", () => ({ env: envFalsa }));

import { hashDoDocumentoDoServidor } from "@/lib/billing-trial/documento-hash";

import { MENSAGEM_TRIAL_JA_USADO, reservarTrialDoDocumento } from "./trial-documento";

const MARCA_A = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const MARCA_B = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const ORG_1 = "11111111-1111-4111-8111-111111111111";
const ORG_2 = "22222222-2222-4222-8222-222222222222";
const CPF = "529.982.247-25";

type Linha = { brand_id: string; documento_hash: string; organization_id: string | null };

function banco(opcoes: { falhaNoInsert?: boolean } = {}) {
  const linhas: Linha[] = [];
  const cliente = {
    from(tabela: string) {
      if (tabela !== "cobranca_trial_documentos") throw new Error(`tabela inesperada: ${tabela}`);
      return {
        async insert(linha: Linha) {
          if (opcoes.falhaNoInsert) return { error: { code: "57014", message: "timeout" } };
          if (linhas.some((l) => l.brand_id === linha.brand_id && l.documento_hash === linha.documento_hash)) {
            return { error: { code: "23505", message: "duplicate" } };
          }
          linhas.push({ ...linha });
          return { error: null };
        },
        select() {
          const f: Record<string, unknown> = {};
          const q = {
            eq(coluna: string, valor: unknown) {
              f[coluna] = valor;
              return q;
            },
            async maybeSingle() {
              const achada = linhas.find((l) => l.brand_id === f.brand_id && l.documento_hash === f.documento_hash);
              return { data: achada ? { organization_id: achada.organization_id } : null, error: null };
            },
          };
          return q;
        },
      };
    },
  };
  return { cliente: cliente as never, linhas };
}

beforeEach(() => {
  envFalsa.BILLING_TRIAL_DOCUMENTO_PEPPER = "pepper-de-teste-com-mais-de-32-caracteres";
});

describe("reservarTrialDoDocumento", () => {
  it("AC-003.5: o primeiro trial do documento na marca é concedido e grava só o HMAC", async () => {
    const b = banco();
    const r = await reservarTrialDoDocumento(b.cliente, { brandId: MARCA_A, documento: CPF, organizationId: ORG_1 });
    expect(r).toEqual({ ok: true });
    expect(b.linhas).toEqual([{ brand_id: MARCA_A, documento_hash: hashDoDocumentoDoServidor(CPF), organization_id: ORG_1 }]);
  });

  it("AC-003.5: o documento em claro nunca é gravado", async () => {
    const b = banco();
    await reservarTrialDoDocumento(b.cliente, { brandId: MARCA_A, documento: CPF, organizationId: ORG_1 });
    expect(JSON.stringify(b.linhas)).not.toContain("52998224725");
    expect(JSON.stringify(b.linhas)).not.toContain("529.982");
  });

  it("AC-003.5: o mesmo documento na mesma marca, em outra empresa, é recusado com trial_ja_usado", async () => {
    const b = banco();
    await reservarTrialDoDocumento(b.cliente, { brandId: MARCA_A, documento: CPF, organizationId: ORG_1 });
    const r = await reservarTrialDoDocumento(b.cliente, { brandId: MARCA_A, documento: "52998224725", organizationId: ORG_2 });
    expect(r).toEqual({ ok: false, motivo: "trial_ja_usado" });
    expect(b.linhas).toHaveLength(1);
  });

  it("AC-003.6: o mesmo documento em OUTRA marca ganha o trial", async () => {
    const b = banco();
    await reservarTrialDoDocumento(b.cliente, { brandId: MARCA_A, documento: CPF, organizationId: ORG_1 });
    const r = await reservarTrialDoDocumento(b.cliente, { brandId: MARCA_B, documento: CPF, organizationId: ORG_2 });
    expect(r).toEqual({ ok: true });
    expect(b.linhas).toHaveLength(2);
  });

  it("AC-003.5: repetir a reserva da MESMA empresa (retorno duplicado) não recusa nem duplica", async () => {
    const b = banco();
    await reservarTrialDoDocumento(b.cliente, { brandId: MARCA_A, documento: CPF, organizationId: ORG_1 });
    const r = await reservarTrialDoDocumento(b.cliente, { brandId: MARCA_A, documento: CPF, organizationId: ORG_1 });
    expect(r).toEqual({ ok: true });
    expect(b.linhas).toHaveLength(1);
  });

  it("documento curto demais não chega ao banco; falha do banco não vira concessão", async () => {
    const b = banco();
    expect(await reservarTrialDoDocumento(b.cliente, { brandId: MARCA_A, documento: "123", organizationId: ORG_1 })).toEqual({
      ok: false,
      motivo: "documento_invalido",
    });
    expect(b.linhas).toHaveLength(0);
    const f = banco({ falhaNoInsert: true });
    expect(await reservarTrialDoDocumento(f.cliente, { brandId: MARCA_A, documento: CPF, organizationId: ORG_1 })).toEqual({
      ok: false,
      motivo: "indisponivel",
    });
  });

  it("AC-003.5: a mensagem da recusa é em português simples e oferece assinar já", () => {
    expect(MENSAGEM_TRIAL_JA_USADO).toMatch(/assinar/i);
    expect(MENSAGEM_TRIAL_JA_USADO).not.toMatch(/hash|HMAC|23505/);
  });
});
