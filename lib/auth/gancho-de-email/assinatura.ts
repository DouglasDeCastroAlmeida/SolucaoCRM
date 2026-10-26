/**
 * Verificação da assinatura do gancho de e-mail do GoTrue (Standard Webhooks),
 * sem biblioteca: HMAC-SHA256 de `${id}.${timestamp}.${corpo}`, chave = bytes do
 * base64 que vem depois de `whsec_`, comparação em tempo constante e tolerância
 * de 5 minutos contra replay.
 *
 * Nunca lança: qualquer entrada estranha é "assinatura inválida".
 */
import { createHmac, timingSafeEqual } from "node:crypto";

export const TOLERANCIA_SEGUNDOS = 300;

/** `v1,whsec_<base64>` (formato do GoTrue), `whsec_<base64>` ou o base64 cru. */
export function segredoDoGancho(valor: string): Buffer | null {
  const limpo = valor.trim().replace(/^v1,/, "").replace(/^whsec_/, "");
  if (limpo === "") return null;
  const bytes = Buffer.from(limpo, "base64");
  return bytes.length > 0 ? bytes : null;
}

export type EntradaDeAssinatura = {
  id: string;
  timestamp: string;
  /** Valor do cabeçalho `webhook-signature`: `v1,<base64>` (várias, separadas por espaço). */
  assinatura: string;
  corpo: string;
  segredo: string;
  /** Relógio injetável (segundos). */
  agoraSeg: number;
};

export function assinaturaValida(e: EntradaDeAssinatura): boolean {
  try {
    const chave = segredoDoGancho(e.segredo);
    if (!chave || e.id === "" || e.assinatura === "") return false;
    if (!/^\d{1,12}$/.test(e.timestamp)) return false;
    const ts = Number(e.timestamp);
    if (Math.abs(e.agoraSeg - ts) > TOLERANCIA_SEGUNDOS) return false;

    const esperado = createHmac("sha256", chave).update(`${e.id}.${e.timestamp}.${e.corpo}`).digest();
    for (const candidata of e.assinatura.split(" ")) {
      const [versao, valor] = candidata.split(",");
      if (versao !== "v1" || !valor) continue;
      const recebido = Buffer.from(valor, "base64");
      if (recebido.length === esperado.length && timingSafeEqual(recebido, esperado)) return true;
    }
    return false;
  } catch {
    return false;
  }
}
