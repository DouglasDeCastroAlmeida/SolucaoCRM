/**
 * O ID de uma ferramenta remota dentro de `ai_agent_versions.tool_ids` (#2147,
 * item 6) — cada agente escolhe as próprias.
 *
 * ── Por que um prefixo e não o nome cru ─────────────────────────────────────
 *
 * O catálogo compilado é a fonte dos ids sem prefixo e `tool_ids` já é
 * validado contra ele (`VALID_TOOL_IDS`, em quatro pontos: zod da versão, rota
 * de publicação e os dois espelhos de `_actions.ts`). Um id novo sem marca
 * própria seria recusado lá; com prefixo, o mesmo validador o aceita sem
 * perder a régua de "id que não existe não entra".
 *
 * ── Por que a marca de LEITURA/ESCRITA vem no id ────────────────────────────
 *
 * `annotations.readOnlyHint` é DECLARAÇÃO do servidor remoto, não garantia: um
 * servidor que se diga "readOnly" num `cancelar_pedido` passaria como leitura.
 * Quem administra o cadastro também administra esta escolha, e ela precisa
 * ficar gravada em algum lugar da VERSÃO — o id é esse lugar. Um servidor
 * anuncia `readOnlyHint: true` E o administrador marca `leitura` para a
 * ferramenta contar como leitura durante uma conversa (item 8); qualquer outra
 * combinação é escrita, que a regra de escopo do turno recusa.
 *
 * ── O formato ──────────────────────────────────────────────────────────────
 *
 * `mcp_externo:<leitura|escrita>:<nome>` — prefixo estável que o editor do
 * agente lista, marca explícita e o nome como o servidor o anuncia. O nome
 * segue a mesma régua do protocolo MCP (`[A-Za-z0-9_-]{1,64}`): um id fora
 * dela nunca monta ferramenta, então recusá-lo aqui é recusar cedo o que de
 * qualquer jeito não funcionaria.
 */

/** Prefixo estável: é por ele que o editor e a validação reconhecem a remota. */
export const PREFIXO_TOOL_ID_MCP_EXTERNO = "mcp_externo:";

/** O que a escolha do agente declara sobre a ferramenta remota. */
export type MarcaRemota = "leitura" | "escrita";

/** Servidor a que o id no formato ANTIGO se refere (o migrado pela 0724). */
export const SLUG_DO_SERVIDOR_PADRAO = "padrao";

/** Uma escolha lida de volta de `tool_ids`. */
export interface EscolhaRemota {
  /**
   * Slug do servidor, quando o id está no formato novo
   * (`mcp_externo:<servidor>:<marca>:<nome>`). Ausente no formato antigo, que
   * aponta para o servidor `padrao` (`servidorDaEscolha`).
   */
  servidor?: string;
  /** Nome como o servidor remoto o anuncia (`tools/list`). */
  nome: string;
  /** `true` só quando o administrador marcou a ferramenta como leitura. */
  leitura: boolean;
}

const NOME_DE_PROTOCOLO = /^[A-Za-z0-9_-]{1,64}$/;
/** Mesma régua do CHECK de `mcp_servidores_externos.slug` (sem ':' nem '_'). */
const SLUG_DE_SERVIDOR = /^[a-z0-9]+(-[a-z0-9]+)*$/;

function ehNomeDeProtocolo(nome: unknown): nome is string {
  return typeof nome === "string" && NOME_DE_PROTOCOLO.test(nome);
}

export function ehSlugDeServidor(slug: unknown): slug is string {
  return typeof slug === "string" && slug.length <= 40 && SLUG_DE_SERVIDOR.test(slug);
}

/**
 * Monta o id que vai para `tool_ids` — o inverso exato de `lerToolIdRemoto`.
 * Sem `servidor` sai o formato ANTIGO, que continua válido.
 */
export function toolIdRemoto(nome: string, marca: MarcaRemota, servidor?: string): string {
  return servidor === undefined
    ? `${PREFIXO_TOOL_ID_MCP_EXTERNO}${marca}:${nome}`
    : `${PREFIXO_TOOL_ID_MCP_EXTERNO}${servidor}:${marca}:${nome}`;
}

/**
 * A escolha contida num id, ou `null` quando o id não é de ferramenta remota
 * (prefixo ausente, marca desconhecida, slug ou nome fora da régua).
 *
 * Dois formatos, distinguidos pelo número de partes: `<marca>:<nome>` (antigo)
 * e `<servidor>:<marca>:<nome>` (novo). O nome nunca contém ':'.
 *
 * `null` para id SEM prefixo é obrigatório: quem chama costuma testar os dois
 * domínios no mesmo laço, e tratar `crm_search_products` como id remoto
 * inválido mudaria o significado de "recusar".
 */
export function lerToolIdRemoto(id: string): EscolhaRemota | null {
  if (!id.startsWith(PREFIXO_TOOL_ID_MCP_EXTERNO)) return null;
  const partes = id.slice(PREFIXO_TOOL_ID_MCP_EXTERNO.length).split(":");
  if (partes.length !== 2 && partes.length !== 3) return null;
  const nome = partes[partes.length - 1];
  const marca = partes[partes.length - 2];
  if (!ehNomeDeProtocolo(nome)) return null;
  if (marca !== "leitura" && marca !== "escrita") return null;
  if (partes.length === 2) return { nome, leitura: marca === "leitura" };
  const servidor = partes[0];
  if (!ehSlugDeServidor(servidor)) return null;
  return { servidor, nome, leitura: marca === "leitura" };
}

/** O servidor da escolha: o do id, ou o `padrao` no formato antigo. */
export function servidorDaEscolha(escolha: EscolhaRemota): string {
  return escolha.servidor ?? SLUG_DO_SERVIDOR_PADRAO;
}

/**
 * O nome que o modelo enxerga: `<servidor>__<nome>` no formato novo (elimina a
 * colisão entre servidores e com o catálogo); o nome cru no antigo.
 */
export function nomeExpostoDaEscolha(escolha: EscolhaRemota): string {
  return escolha.servidor === undefined ? escolha.nome : `${escolha.servidor}__${escolha.nome}`;
}

/** É um id de ferramenta remota bem formado? (`false` para ids compilados.) */
export function ehToolIdRemoto(id: string): boolean {
  return lerToolIdRemoto(id) !== null;
}

/**
 * O predicado ÚNICO de "este id pode entrar em `tool_ids`": catálogo compilado
 * OU ferramenta remota bem formada.
 *
 * Quatro pontos da codebase conferem isso (o zod da versão, a rota de
 * publicação e os dois espelhos de `_actions.ts`) e cada um tem cópia própria
 * do `Set` de catálogo — aceitar remota em um só deles faria a versão salvar e
 * a publicação recusar, com o mesmo dado na mesma tela.
 */
export function toolIdAceito(id: string, catalogo: ReadonlySet<string>): boolean {
  return catalogo.has(id) || ehToolIdRemoto(id);
}

/**
 * As escolhas remotas de um `tool_ids`, na ordem do array e sem duplicatas de
 * nome — a mesma ferramenta marcada leitura E escrita seria duas verdades
 * sobre o mesmo tool no turno, e a primeira que vence.
 */
export function escolhasRemotas(toolIds: readonly string[]): EscolhaRemota[] {
  const porNome = new Map<string, EscolhaRemota>();
  for (const id of toolIds) {
    const escolha = lerToolIdRemoto(id);
    if (!escolha) continue;
    const chave = `${escolha.servidor ?? ""}/${escolha.nome}`;
    if (!porNome.has(chave)) porNome.set(chave, escolha);
  }
  return [...porNome.values()];
}
