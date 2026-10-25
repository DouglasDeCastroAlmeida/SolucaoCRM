/**
 * A marca do endereço que a requisição atual acessou.
 *
 * Lê o cabeçalho `x-brand-host` que o `proxy.ts` grava (sempre sobrescrito) e
 * resolve pelo cache de `marcaDoHost`. NUNCA lança: fora de uma requisição, ou
 * com a chave `MARCAS_POR_DOMINIO=off`, devolve a marca padrão.
 */
import { headers } from "next/headers";

import type { ResultadoDaMarca } from "./marca-do-host";
import { marcaDoHost } from "./marca-do-host";
import { CABECALHO_BRAND_HOST } from "./host";
import { MARCA_PADRAO_EMBUTIDA } from "@/lib/brands/tipos";

export async function marcaDoPedido(): Promise<ResultadoDaMarca> {
  try {
    const host = (await headers()).get(CABECALHO_BRAND_HOST);
    return await marcaDoHost(host);
  } catch {
    // Fora de uma requisição `headers()` lança; o chamador segue com o padrão.
    return { brand: MARCA_PADRAO_EMBUTIDA, domainKind: "padrao" };
  }
}
