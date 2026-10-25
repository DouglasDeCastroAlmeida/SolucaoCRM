import { beforeAll, describe, expect, it } from "vitest";

import { countAs, sql, writeCountAs } from "./gov-helpers";

/**
 * MARCAS, PARCEIROS E DOMÍNIOS — O ISOLAMENTO ENTRE MARCAS É DO BANCO.
 *
 * Mudança SDD 002, REQ-003. Duas marcas (A do parceiro P1, B do parceiro P2),
 * duas organizações (uma em cada), um usuário em cada, mais um e-mail (usuário)
 * que está nas DUAS organizações — a identidade é única, a visão é filtrada pela
 * aplicação, e aqui se prova só o que o banco garante.
 *
 * Tudo roda como `authenticated` com `request.jwt.claims` (mesmo caminho do
 * PostgREST). Conectar como `postgres` mediria nada: ele ignora RLS.
 */

const P1 = "b7a4d002-0000-4000-8000-0000000000a1";
const P2 = "b7a4d002-0000-4000-8000-0000000000a2";
const BRAND_A = "b7a4d002-0000-4000-8000-0000000000b1";
const BRAND_B = "b7a4d002-0000-4000-8000-0000000000b2";
const PACK_A = "b7a4d002-0000-4000-8000-0000000000c1";
const PACK_B = "b7a4d002-0000-4000-8000-0000000000c2";
const ORG_A = "b7a4d002-0000-4000-8000-0000000000d1";
const ORG_B = "b7a4d002-0000-4000-8000-0000000000d2";
const USER_A = "b7a4d002-1111-4000-8000-0000000000a1";
const USER_B = "b7a4d002-1111-4000-8000-0000000000a2";
const USER_AMBAS = "b7a4d002-1111-4000-8000-0000000000a3";
const ADMIN_P1 = "b7a4d002-1111-4000-8000-0000000000a4";

const MARCAS = `('${BRAND_A}', '${BRAND_B}')`;

beforeAll(() => {
  sql(`
    insert into auth.users (id, email) values
      ('${USER_A}', 'marcas-a@invariant.test'),
      ('${USER_B}', 'marcas-b@invariant.test'),
      ('${USER_AMBAS}', 'marcas-ambas@invariant.test'),
      ('${ADMIN_P1}', 'marcas-admin-p1@invariant.test')
    on conflict (id) do nothing;

    insert into public.partners (id, slug, name) values
      ('${P1}', 'marcas-iso-p1', 'Parceiro 1'),
      ('${P2}', 'marcas-iso-p2', 'Parceiro 2')
    on conflict (id) do nothing;

    insert into public.vertical_packs (id, slug, name) values
      ('${PACK_A}', 'marcas-iso-pack-a', 'Pacote A'),
      ('${PACK_B}', 'marcas-iso-pack-b', 'Pacote B')
    on conflict (id) do nothing;

    insert into public.brands (id, partner_id, slug, name, default_pack_id) values
      ('${BRAND_A}', '${P1}', 'marcas-iso-a', 'Marca A', '${PACK_A}'),
      ('${BRAND_B}', '${P2}', 'marcas-iso-b', 'Marca B', '${PACK_B}')
    on conflict (id) do nothing;

    insert into public.brand_domains (brand_id, host, kind) values
      ('${BRAND_A}', 'a.marcas-iso.test', 'subdominio'),
      ('${BRAND_B}', 'b.marcas-iso.test', 'subdominio')
    on conflict (host) do nothing;

    insert into public.brand_plans (brand_id, name) values
      ('${BRAND_A}', 'Plano A'),
      ('${BRAND_B}', 'Plano B');

    insert into public.organizations (id, slug, legal_name, display_name, brand_id) values
      ('${ORG_A}', 'marcas-iso-a', 'Org A', 'Org A', '${BRAND_A}'),
      ('${ORG_B}', 'marcas-iso-b', 'Org B', 'Org B', '${BRAND_B}')
    on conflict (id) do nothing;

    insert into public.user_organizations (user_id, organization_id, role, accepted_at) values
      ('${USER_A}', '${ORG_A}', 'admin', now()),
      ('${USER_B}', '${ORG_B}', 'admin', now()),
      ('${USER_AMBAS}', '${ORG_A}', 'agent', now()),
      ('${USER_AMBAS}', '${ORG_B}', 'agent', now())
    on conflict do nothing;

    insert into public.partner_members (partner_id, user_id) values ('${P1}', '${ADMIN_P1}')
    on conflict do nothing;
  `);
});

describe("AC-003.1: o usuário da marca A só enxerga o que a política permite para a marca dele", () => {
  it("AC-003.1: controle positivo - lê a própria marca, o plano e o pacote", () => {
    expect(countAs(USER_A, `select count(*) from public.brands where id = '${BRAND_A}';`)).toBe(1);
    expect(
      countAs(USER_A, `select count(*) from public.brand_plans where brand_id = '${BRAND_A}';`),
    ).toBe(1);
    expect(countAs(USER_A, `select count(*) from public.vertical_packs where id = '${PACK_A}';`)).toBe(1);
  });

  it("AC-003.1: não lê a marca, o plano nem o pacote de B", () => {
    expect(countAs(USER_A, `select count(*) from public.brands where id = '${BRAND_B}';`)).toBe(0);
    expect(
      countAs(USER_A, `select count(*) from public.brand_plans where brand_id = '${BRAND_B}';`),
    ).toBe(0);
    expect(countAs(USER_A, `select count(*) from public.vertical_packs where id = '${PACK_B}';`)).toBe(0);
  });

  it("AC-003.1: o mesmo vale no sentido contrário (B não lê A)", () => {
    expect(countAs(USER_B, `select count(*) from public.brands where id in ${MARCAS};`)).toBe(1);
    expect(countAs(USER_B, `select count(*) from public.brands where id = '${BRAND_A}';`)).toBe(0);
  });

  it("AC-003.1: o e-mail que está nas duas organizações vê as duas marcas (a visão filtrada é da aplicação)", () => {
    expect(countAs(USER_AMBAS, `select count(*) from public.brands where id in ${MARCAS};`)).toBe(2);
  });
});

describe("AC-003.2: o admin do parceiro só alcança as marcas do próprio parceiro", () => {
  it("AC-003.2: lê a marca e o domínio do próprio parceiro e nada do outro", () => {
    expect(countAs(ADMIN_P1, `select count(*) from public.brands where id in ${MARCAS};`)).toBe(1);
    expect(countAs(ADMIN_P1, `select count(*) from public.brands where id = '${BRAND_A}';`)).toBe(1);
    expect(
      countAs(ADMIN_P1, `select count(*) from public.brand_domains where brand_id in ${MARCAS};`),
    ).toBe(1);
    expect(
      countAs(ADMIN_P1, `select count(*) from public.brand_plans where brand_id = '${BRAND_B}';`),
    ).toBe(0);
  });

  it("AC-003.2: altera a marca do próprio parceiro, mas não a de outro", () => {
    expect(
      writeCountAs(ADMIN_P1, `update public.brands set name = 'Marca A editada' where id = '${BRAND_A}'`),
    ).toBe(1);
    expect(
      writeCountAs(ADMIN_P1, `update public.brands set name = 'invasão' where id = '${BRAND_B}'`),
    ).toBe(0);
  });

  it("AC-003.2: não cria marca nem domínio no parceiro alheio", () => {
    expect(
      writeCountAs(
        ADMIN_P1,
        `insert into public.brands (partner_id, slug, name) values ('${P2}', 'marcas-iso-invasora', 'x')`,
      ),
    ).toBe(0);
    expect(
      writeCountAs(
        ADMIN_P1,
        `insert into public.brand_domains (brand_id, host, kind) values ('${BRAND_B}', 'invasor.marcas-iso.test', 'proprio')`,
      ),
    ).toBe(0);
  });
});

describe("AC-003.3: usuário comum de organização não lê nem escreve as tabelas de parceiro", () => {
  it("AC-003.3: leitura de parceiros, membros e domínios devolve zero linhas", () => {
    expect(countAs(USER_A, `select count(*) from public.partners where id in ('${P1}', '${P2}');`)).toBe(0);
    expect(countAs(USER_A, `select count(*) from public.partner_members where partner_id = '${P1}';`)).toBe(0);
    expect(
      countAs(USER_A, `select count(*) from public.brand_domains where brand_id in ${MARCAS};`),
    ).toBe(0);
  });

  it("AC-003.3: escrita em parceiros, domínios e marcas é negada", () => {
    expect(
      writeCountAs(USER_A, `insert into public.partners (slug, name) values ('marcas-iso-p3', 'P3')`),
    ).toBe(0);
    expect(
      writeCountAs(
        USER_A,
        `insert into public.brand_domains (brand_id, host, kind) values ('${BRAND_A}', 'meu.marcas-iso.test', 'proprio')`,
      ),
    ).toBe(0);
    expect(
      writeCountAs(USER_A, `update public.brands set name = 'minha' where id = '${BRAND_A}'`),
    ).toBe(0);
  });

  it("AC-003.3: as tabelas só do servidor nem concedem acesso a authenticated e anon", () => {
    for (const tabela of ["brand_email_context", "auth_hook_deliveries"]) {
      const out = sql(`
        select has_table_privilege('authenticated', 'public.${tabela}', 'select')::text
          || ',' || has_table_privilege('anon', 'public.${tabela}', 'select')::text;
      `);
      expect(out).toBe("false,false");
    }
  });

  it("AC-003.3: anon não lê marcas nem parceiros", () => {
    const out = sql(`
      select has_table_privilege('anon', 'public.brands', 'select')::text
        || ',' || has_table_privilege('anon', 'public.partners', 'select')::text
        || ',' || has_table_privilege('anon', 'public.brand_domains', 'select')::text;
    `);
    expect(out).toBe("false,false,false");
  });
});

describe("AC-003.4: função nova no schema public não é executável por PUBLIC nem por anon", () => {
  const FUNCOES = [
    "fn_user_partner_ids",
    "fn_is_partner_admin",
    "fn_set_org_brand",
    "fn_organizations_brand_guard",
  ];

  it("AC-003.4: as quatro funções existem (controle de vacuidade)", () => {
    const out = sql(`
      select count(*) from pg_proc p join pg_namespace n on n.oid = p.pronamespace
       where n.nspname = 'public' and p.proname in (${FUNCOES.map((f) => `'${f}'`).join(",")});
    `);
    expect(out).toBe(String(FUNCOES.length));
  });

  it("AC-003.4: anon não tem EXECUTE", () => {
    const out = sql(`
      select count(*) from pg_proc p join pg_namespace n on n.oid = p.pronamespace
       where n.nspname = 'public' and p.proname in (${FUNCOES.map((f) => `'${f}'`).join(",")})
         and has_function_privilege('anon', p.oid, 'execute');
    `);
    expect(out).toBe("0");
  });

  it("AC-003.4: PUBLIC não tem EXECUTE (a ACL não traz grantee 0)", () => {
    const out = sql(`
      select count(*) from pg_proc p join pg_namespace n on n.oid = p.pronamespace,
             lateral aclexplode(coalesce(p.proacl, acldefault('f', p.proowner))) a
       where n.nspname = 'public' and p.proname in (${FUNCOES.map((f) => `'${f}'`).join(",")})
         and a.grantee = 0 and a.privilege_type = 'EXECUTE';
    `);
    expect(out).toBe("0");
  });
});
