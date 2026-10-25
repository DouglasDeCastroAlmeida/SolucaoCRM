import { beforeAll, describe, expect, it } from "vitest";

import { sql } from "./gov-helpers";

/**
 * TROCAR A MARCA DE UMA ORGANIZAÇÃO É ATO DO ADMIN DA PLATAFORMA — E DEIXA RASTRO.
 *
 * Mudança SDD 002, AC-003.5. A RPC `fn_set_org_brand` é a porta. Quem não é admin
 * da plataforma com escopo `full` recebe 42501, e o UPDATE direto de `brand_id`
 * (que a RLS de `organizations` deixaria o admin da própria organização fazer) é
 * barrado pelo trigger. Quem consegue, deixa uma linha `org.brand_changed` em
 * `api_audit_log`.
 */

const BRAND_1 = "b7a4d003-0000-4000-8000-0000000000b1";
const BRAND_2 = "b7a4d003-0000-4000-8000-0000000000b2";
const PARTNER = "b7a4d003-0000-4000-8000-0000000000a1";
const ORG = "b7a4d003-0000-4000-8000-0000000000d1";
const ORG_ADMIN = "b7a4d003-1111-4000-8000-0000000000a1";
const PARTNER_ADMIN = "b7a4d003-1111-4000-8000-0000000000a2";
const PLATAFORMA = "b7a4d003-1111-4000-8000-0000000000a3";
const SUPORTE_LEITURA = "b7a4d003-1111-4000-8000-0000000000a4";

function como(userId: string, comando: string): string {
  return sql(`
    set role authenticated;
    select set_config('request.jwt.claims', '{"sub":"${userId}"}', false);
    ${comando}
  `);
}

/** Roda o comando como o usuário e diz se ele foi aceito (false = o banco recusou). */
function aceito(userId: string, comando: string): boolean {
  try {
    como(userId, comando);
    return true;
  } catch {
    return false;
  }
}

function marcaDaOrg(): string {
  return sql(`select coalesce(brand_id::text, 'nulo') from public.organizations where id = '${ORG}';`);
}

function auditorias(): number {
  return Number(
    sql(`
      select count(*) from public.api_audit_log
       where action = 'org.brand_changed' and resource_id = '${ORG}';
    `),
  );
}

beforeAll(() => {
  sql(`
    insert into auth.users (id, email) values
      ('${ORG_ADMIN}', 'troca-org-admin@invariant.test'),
      ('${PARTNER_ADMIN}', 'troca-parceiro@invariant.test'),
      ('${PLATAFORMA}', 'troca-plataforma@invariant.test'),
      ('${SUPORTE_LEITURA}', 'troca-suporte@invariant.test')
    on conflict (id) do nothing;

    insert into public.partners (id, slug, name) values ('${PARTNER}', 'marcas-troca-p', 'Parceiro')
    on conflict (id) do nothing;
    insert into public.brands (id, partner_id, slug, name) values
      ('${BRAND_1}', '${PARTNER}', 'marcas-troca-1', 'Marca 1'),
      ('${BRAND_2}', '${PARTNER}', 'marcas-troca-2', 'Marca 2')
    on conflict (id) do nothing;
    insert into public.organizations (id, slug, legal_name, display_name, brand_id)
    values ('${ORG}', 'marcas-troca', 'Org Troca', 'Org Troca', '${BRAND_1}')
    on conflict (id) do update set brand_id = excluded.brand_id;

    insert into public.user_organizations (user_id, organization_id, role, accepted_at)
    values ('${ORG_ADMIN}', '${ORG}', 'admin', now())
    on conflict do nothing;
    insert into public.partner_members (partner_id, user_id) values ('${PARTNER}', '${PARTNER_ADMIN}')
    on conflict do nothing;

    insert into public.platform_admins (user_id, granted_by, reason, scope) values
      ('${PLATAFORMA}', '${PLATAFORMA}', 'invariante', 'full'),
      ('${SUPORTE_LEITURA}', '${PLATAFORMA}', 'invariante', 'support_readonly')
    on conflict (user_id) do nothing;
  `);
});

describe("AC-003.5: só o admin da plataforma troca a marca da organização", () => {
  it("AC-003.5: o admin da própria organização não troca, nem pela RPC nem por UPDATE direto", () => {
    expect(aceito(ORG_ADMIN, `select public.fn_set_org_brand('${ORG}', '${BRAND_2}');`)).toBe(false);
    // O UPDATE direto pode ser recusado pelo trigger (erro) ou filtrado pela RLS
    // (zero linhas); nos dois casos o que vale é a marca não ter mudado.
    aceito(ORG_ADMIN, `update public.organizations set brand_id = '${BRAND_2}' where id = '${ORG}';`);
    expect(marcaDaOrg()).toBe(BRAND_1);
    expect(auditorias()).toBe(0);
  });

  it("AC-003.5: o admin do parceiro e o suporte somente leitura também não trocam", () => {
    expect(aceito(PARTNER_ADMIN, `select public.fn_set_org_brand('${ORG}', '${BRAND_2}');`)).toBe(false);
    expect(aceito(SUPORTE_LEITURA, `select public.fn_set_org_brand('${ORG}', '${BRAND_2}');`)).toBe(false);
    expect(marcaDaOrg()).toBe(BRAND_1);
    expect(auditorias()).toBe(0);
  });

  it("AC-003.5: o admin da plataforma troca e a troca fica no log de auditoria", () => {
    expect(aceito(PLATAFORMA, `select public.fn_set_org_brand('${ORG}', '${BRAND_2}');`)).toBe(true);
    expect(marcaDaOrg()).toBe(BRAND_2);
    const linha = sql(`
      select actor_user_id || ',' || acting_as_platform_admin::text || ','
          || (metadata->>'from_brand_id') || ',' || (metadata->>'to_brand_id')
        from public.api_audit_log
       where action = 'org.brand_changed' and resource_id = '${ORG}';
    `);
    expect(linha).toBe(`${PLATAFORMA},true,${BRAND_1},${BRAND_2}`);
  });

  it("AC-003.5: marca inexistente é recusada e nada muda", () => {
    const antes = auditorias();
    expect(
      aceito(PLATAFORMA, `select public.fn_set_org_brand('${ORG}', 'b7a4d003-0000-4000-8000-00000000ffff');`),
    ).toBe(false);
    expect(marcaDaOrg()).toBe(BRAND_2);
    expect(auditorias()).toBe(antes);
  });
});
