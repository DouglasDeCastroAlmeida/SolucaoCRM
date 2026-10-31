/**
 * O selo da URL de retorno do Checkout (mudança 003, AC-003.2 e AC-003.3).
 *
 * O Asaas devolve o NAVEGADOR de outro site: sem cookie de sessão (Strict), a
 * rota `/cobranca/volta` não sabe de quem é a volta. A organização vai na URL de
 * retorno que NÓS entregamos ao Asaas, junto com um HMAC dela e do resultado
 * (`ok`, `cancelado`, `expirado`). O selo não dá poder: o que a volta faz é reler
 * o provedor, e o estado vem de lá. O que ele impede é alguém varrer ids de
 * organização ou virar um `ok` em `cancelado`.
 */
import { createHmac, timingSafeEqual } from "node:crypto";

import { z } from "zod";

import { env } from "@/lib/env";

export const RESULTADOS_DE_RETORNO = ["ok", "cancelado", "expirado"] as const;
export type ResultadoDeRetorno = (typeof RESULTADOS_DE_RETORNO)[number];

const ROTULO = "cobranca-trial-retorno/v1";
const UUID = z.string().uuid();

function selo(orgId: string, resultado: ResultadoDeRetorno): Buffer {
  return createHmac("sha256", env.INTERNAL_SECRET).update(`${ROTULO}:${orgId}:${resultado}`, "utf8").digest();
}

/** `base` é o host da marca (https). Devolve a URL completa que o Asaas usa como `callback`. */
export function urlDeRetorno(base: string, orgId: string, resultado: ResultadoDeRetorno): string {
  const consulta = new URLSearchParams({
    para: "hub",
    voltou: "1",
    [resultado]: "1",
    o: orgId,
    s: selo(orgId, resultado).toString("hex"),
  });
  return `${base.trim().replace(/\/+$/, "")}/cobranca/volta?${consulta}`;
}

/** Lê o retorno da query. `null` = sem selo, selo errado ou org que não é uuid: a volta segue sem efeito. */
export function lerRetorno(params: URLSearchParams): { orgId: string; resultado: ResultadoDeRetorno } | null {
  const resultado = RESULTADOS_DE_RETORNO.find((r) => params.get(r) === "1");
  const orgId = UUID.safeParse(params.get("o"));
  const dado = params.get("s");
  if (!resultado || !orgId.success || !dado || !/^[0-9a-f]{64}$/.test(dado)) return null;
  const esperado = selo(orgId.data, resultado);
  const recebido = Buffer.from(dado, "hex");
  return recebido.length === esperado.length && timingSafeEqual(recebido, esperado) ? { orgId: orgId.data, resultado } : null;
}
