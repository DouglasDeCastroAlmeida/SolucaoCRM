/**
 * Cópia do pacote vertical para a organização (AC-008.4).
 *
 * A organização guarda a CÓPIA em `organizations.settings.vertical_pack`
 * (`{ pack_id, slug, version, seed, copiado_em }`). Não há referência viva: o
 * `seed` é clonado em profundidade, então mudar o pacote depois não altera a
 * organização, e mexer na cópia não altera o pacote.
 */
import { createAdminClient } from "@/lib/supabase/admin";

export type PacoteCopiado = {
  pack_id: string;
  slug: string;
  version: number;
  seed: Record<string, unknown>;
  copiado_em: string;
};

export function clonarPacote(pack: {
  id: string;
  slug: string;
  version: number;
  seed: Record<string, unknown>;
}): PacoteCopiado {
  return {
    pack_id: pack.id,
    slug: String(pack.slug),
    version: pack.version,
    seed: JSON.parse(JSON.stringify(pack.seed ?? {})) as Record<string, unknown>,
    copiado_em: new Date().toISOString(),
  };
}

/**
 * Copia o pacote padrão da marca para a organização recém-criada. `orgId` vem
 * de fonte confiável (a criação em curso), nunca do corpo. Idempotente: se a
 * organização já tem cópia, não sobrescreve. Devolve `true` quando copiou.
 * Marca sem pacote padrão (ou pacote inativo) = nada a fazer.
 */
export async function copiarPacoteParaOrganizacao(
  orgId: string,
  brandId: string | null,
): Promise<boolean> {
  if (!brandId) return false;
  const admin = createAdminClient();

  const { data: marca, error: e1 } = await admin
    .from("brands")
    .select("default_pack_id")
    .eq("id", brandId)
    .maybeSingle();
  if (e1) throw new Error(`pacote da marca: ${e1.code ?? "erro"}`);
  const packId = (marca as { default_pack_id: string | null } | null)?.default_pack_id;
  if (!packId) return false;

  const { data: pack, error: e2 } = await admin
    .from("vertical_packs")
    .select("id, slug, version, seed, status")
    .eq("id", packId)
    .maybeSingle();
  if (e2) throw new Error(`pacote: ${e2.code ?? "erro"}`);
  if (!pack || (pack as { status: string }).status !== "active") return false;

  const { data: org, error: e3 } = await admin
    .from("organizations")
    .select("settings")
    .eq("id", orgId)
    .maybeSingle();
  if (e3) throw new Error(`organização: ${e3.code ?? "erro"}`);
  if (!org) return false;
  const settings = ((org as { settings: Record<string, unknown> | null }).settings ?? {}) as Record<
    string,
    unknown
  >;
  if (settings.vertical_pack) return false;

  const { error: e4 } = await admin
    .from("organizations")
    .update({ settings: { ...settings, vertical_pack: clonarPacote(pack as never) } })
    .eq("id", orgId);
  if (e4) throw new Error(`copiar pacote: ${e4.code ?? "erro"}`);
  return true;
}
