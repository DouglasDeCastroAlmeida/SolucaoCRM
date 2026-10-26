/**
 * Cópia do pacote vertical para a organização (AC-008.4).
 *
 * A organização guarda a CÓPIA em `organizations.settings.vertical_pack`
 * (`{ pack_id, slug, version, seed, copiado_em }`). Não há referência viva: o
 * `seed` é clonado, então mudar o pacote depois não altera a organização, e mexer
 * na cópia não altera o pacote.
 *
 * A cópia é ATÔMICA e idempotente no banco (`fn_copiar_pacote_para_org`, migration
 * 0718): um único UPDATE grava a chave só se ela ainda não existe. A versão anterior
 * lia `settings`, decidia no app e regravava o objeto inteiro, e duas criações em
 * paralelo (ou qualquer outra escrita em `settings` entre a leitura e a gravação)
 * perdiam dado.
 */
import { createAdminClient } from "@/lib/supabase/admin";

/**
 * Copia o pacote padrão da marca para a organização recém-criada. `orgId` vem de
 * fonte confiável (a criação em curso), nunca do corpo. Devolve `true` quando copiou;
 * `false` quando a organização já tinha cópia, a marca não tem pacote padrão ou o
 * pacote está inativo.
 */
export async function copiarPacoteParaOrganizacao(
  orgId: string,
  brandId: string | null,
): Promise<boolean> {
  if (!brandId) return false;
  const { data, error } = await createAdminClient().rpc("fn_copiar_pacote_para_org", {
    p_org_id: orgId,
    p_brand_id: brandId,
  });
  if (error) throw new Error(`copiar pacote: ${error.code ?? "erro"}`);
  return data === true;
}
