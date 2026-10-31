/**
 * O selo da URL de retorno do Checkout (mudança 003, AC-003.2 e AC-003.3).
 *
 * O Asaas devolve o NAVEGADOR de outro site: sem cookie de sessão (Strict), a
 * rota `/cobranca/volta` não sabe de quem é a volta. A organização vai na URL de
 * retorno que NÓS entregamos ao Asaas, junto com um HMAC dela, do resultado
 * (`ok`, `cancelado`, `expirado`) e da TENTATIVA. O selo não dá poder: o que a
 * volta faz é reler o provedor, e o estado vem de lá. O que ele impede é alguém
 * varrer ids de organização ou virar um `ok` em `cancelado`.
 *
 * A tentativa (`c`) é um id que o `iniciar` gera antes de criar o checkout e guarda
 * como prefixo de `checkout_sessao_id` (o id do Asaas só nasce depois, e a URL de
 * retorno é entregue na criação). Link de um checkout antigo ainda tem selo válido,
 * mas a tentativa dele não é mais a viva: `confirmar` o deixa sem efeito.
 */
import { createHmac, timingSafeEqual } from "node:crypto";

import { z } from "zod";

import { env } from "@/lib/env";

export const RESULTADOS_DE_RETORNO = ["ok", "cancelado", "expirado"] as const;
export type ResultadoDeRetorno = (typeof RESULTADOS_DE_RETORNO)[number];

const ROTULO = "cobranca-trial-retorno/v2";
const UUID = z.string().uuid();

function selo(orgId: string, resultado: ResultadoDeRetorno, tentativa: string): Buffer {
  return createHmac("sha256", env.INTERNAL_SECRET).update(`${ROTULO}:${orgId}:${resultado}:${tentativa}`, "utf8").digest();
}

/** `base` é o host da marca (https). Devolve a URL completa que o Asaas usa como `callback`. */
export function urlDeRetorno(base: string, orgId: string, resultado: ResultadoDeRetorno, tentativa: string): string {
  const consulta = new URLSearchParams({
    para: "hub",
    voltou: "1",
    [resultado]: "1",
    o: orgId,
    c: tentativa,
    s: selo(orgId, resultado, tentativa).toString("hex"),
  });
  return `${base.trim().replace(/\/+$/, "")}/cobranca/volta?${consulta}`;
}

/** Lê o retorno da query. `null` = sem selo, selo errado ou org que não é uuid: a volta segue sem efeito. */
export function lerRetorno(params: URLSearchParams): { orgId: string; resultado: ResultadoDeRetorno; tentativa: string } | null {
  const resultado = RESULTADOS_DE_RETORNO.find((r) => params.get(r) === "1");
  const orgId = UUID.safeParse(params.get("o"));
  const tentativa = UUID.safeParse(params.get("c"));
  const dado = params.get("s");
  if (!resultado || !orgId.success || !tentativa.success || !dado || !/^[0-9a-f]{64}$/.test(dado)) return null;
  const esperado = selo(orgId.data, resultado, tentativa.data);
  const recebido = Buffer.from(dado, "hex");
  return recebido.length === esperado.length && timingSafeEqual(recebido, esperado)
    ? { orgId: orgId.data, resultado, tentativa: tentativa.data }
    : null;
}
