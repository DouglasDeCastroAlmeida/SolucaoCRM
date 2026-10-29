/**
 * Tradução de `ErroDeServidorMcp` para a resposta das rotas `/api/v1/mcp-servidores`.
 * A mensagem do erro já é segura (nunca carrega a chave); aqui só se escolhe o
 * status HTTP e se traduz para o idioma de quem pediu.
 */
import { fail } from "@/lib/api/wrappers";
import { traduzir } from "@/lib/i18n/dicionario";
import type { Idioma } from "@/lib/i18n/idiomas";

import type { ErroDeServidorMcp } from "./repositorio";

export function falhaDoServidorMcp(erro: ErroDeServidorMcp, idioma: Idioma, requestId: string) {
  const status = erro.codigo === "mcp_servidor_duplicado" ? 409 : 422;
  return fail(erro.codigo, traduzir(erro.message, idioma), status, { requestId });
}
