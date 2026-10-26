/**
 * Visão filtrada por marca (REQ-004, ADR-005).
 *
 * A identidade é única (um e-mail, uma conta), mas a LISTA de organizações que o
 * usuário vê depende da marca do endereço em que ele entrou. O banco não conhece
 * o host, então a guarda mora na aplicação: toda rota que escolhe a organização
 * ativa, e o seletor, passam por aqui.
 *
 * Regras:
 *  - `brand_id` nulo = marca padrão.
 *  - Admin da plataforma enxerga todas as marcas.
 *  - A marca padrão EMBUTIDA (chave `MARCAS_POR_DOMINIO=off`, banco fora ou
 *    migração ainda não aplicada) não filtra: é o comportamento de antes das marcas.
 *  - Organização de outra marca é tratada como INEXISTENTE (nulo), nunca como
 *    "proibida": quem pergunta não descobre que ela existe (AC-004.2).
 */
import { MARCA_PADRAO_EMBUTIDA, type Brand } from "./tipos";

export type OrgComMarca = { brand_id?: string | null };

export function orgPertenceAMarca(
  org: OrgComMarca,
  brand: Brand,
  user: { is_platform_admin: boolean },
): boolean {
  if (user.is_platform_admin) return true;
  if (brand.id === MARCA_PADRAO_EMBUTIDA.id) return true;
  const doOrg = org.brand_id ?? null;
  if (doOrg === null) return brand.is_default;
  return doOrg === brand.id;
}

export function filtrarOrgsDaMarca<T extends OrgComMarca>(
  orgs: readonly T[],
  brand: Brand,
  user: { is_platform_admin: boolean },
): T[] {
  return orgs.filter((o) => orgPertenceAMarca(o, brand, user));
}

/** A organização pedida, se visível nesta marca; senão `null` (a rota responde 404). */
export function orgVisivelOuNula<T extends OrgComMarca & { organization_id: string }>(
  orgId: string,
  orgs: readonly T[],
  brand: Brand,
  user: { is_platform_admin: boolean },
): T | null {
  const achada = orgs.find((o) => o.organization_id === orgId);
  if (!achada) return null;
  return orgPertenceAMarca(achada, brand, user) ? achada : null;
}
