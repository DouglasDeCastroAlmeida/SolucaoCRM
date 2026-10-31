/**
 * Um trial por documento por marca (mudança 003, ADR-006). Guardamos só
 * HMAC-SHA256(chave, documento normalizado) em `cobranca_trial_documentos`: o
 * hash sozinho não revela o CPF/CNPJ (LGPD) e a função nunca devolve o documento.
 *
 * A chave é DERIVADA (HKDF-SHA256, rótulo próprio) do segredo
 * `BILLING_TRIAL_DOCUMENTO_PEPPER` (opcional) ou, se vazio, de `CPF_ENCRYPTION_KEY`:
 * o rótulo impede que a chave do hash seja a mesma usada para cifrar CPF.
 * GIRAR o pepper (ou a CPF_ENCRYPTION_KEY, quando ela é a que vale) zera a memória
 * de "já teve trial": hashes antigos deixam de bater e todos podem ganhar outro
 * trial. A rotação precisa ser comunicada a quem opera a instalação.
 */
import { createHmac, hkdfSync } from "node:crypto";

import { env } from "@/lib/env";

const ROTULO_DA_CHAVE = "billing-trial/documento/v1";
const TAMANHO_MINIMO_DO_SEGREDO = 16;

/** Chave de 32 bytes derivada do segredo. Segredo ausente ou curto lança: hash com chave fraca é falso conforto. */
export function chaveDoHashDeDocumento(segredo: string): Buffer {
  if (segredo.length < TAMANHO_MINIMO_DO_SEGREDO) {
    throw new Error("segredo do hash de documento ausente ou curto demais");
  }
  return Buffer.from(hkdfSync("sha256", segredo, "", ROTULO_DA_CHAVE, 32));
}

/** Só os caracteres do documento (dígitos; letras do CNPJ alfanumérico em maiúscula), sem máscara. */
function normalizar(documento: string): string {
  const s = documento.replace(/[^0-9A-Za-z]/g, "").toUpperCase();
  if (s.length < 11) throw new Error("documento inválido para o hash");
  return s;
}

/** HMAC-SHA256 em 64 hex do documento normalizado. Determinístico por chave; nunca devolve o documento. */
export function hashDoDocumento(documento: string, chave: Buffer): string {
  return createHmac("sha256", chave).update(normalizar(documento), "utf8").digest("hex");
}

/** O segredo que vale: o pepper próprio, ou `CPF_ENCRYPTION_KEY` quando o pepper está vazio. */
export function segredoDoHashDeDocumento(): string {
  return env.BILLING_TRIAL_DOCUMENTO_PEPPER !== "" ? env.BILLING_TRIAL_DOCUMENTO_PEPPER : env.CPF_ENCRYPTION_KEY;
}

/** Atalho de servidor: a chave sai do pepper (ou do fallback), lida a cada uso. */
export function hashDoDocumentoDoServidor(documento: string): string {
  return hashDoDocumento(documento, chaveDoHashDeDocumento(segredoDoHashDeDocumento()));
}
