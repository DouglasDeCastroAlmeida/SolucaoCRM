/**
 * Aviso de modelo fraco no teste da chave (AC-001.6).
 *
 * O agente opera por ferramentas. Modelo que o provedor não reconhece, ou que o
 * catálogo marca sem chamada de ferramentas, pode responder texto plausível e
 * não executar nada. O aviso NÃO impede o uso: só diz à pessoa o risco.
 */
export interface ModeloDoCatalogoParaAviso {
  model_id: string;
  supports_tools?: boolean | null;
}

export function modeloPodeErrarFerramentas(
  modelo: string | undefined | null,
  catalogo: readonly ModeloDoCatalogoParaAviso[],
): boolean {
  const id = (modelo ?? "").trim();
  if (id === "") return false;
  const achado = catalogo.find((m) => m.model_id === id);
  return achado?.supports_tools !== true;
}
