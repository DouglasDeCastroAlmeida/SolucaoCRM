import { beforeAll, describe, expect, it } from "vitest";

import { countAs, sql } from "./gov-helpers";
import {
  chaveDeCobranca, comoAnon, comoUsuario, criarOrg, criarUsuarios, erroDe, numero, tornarPlatformAdmin, uuid, valor, vincular,
} from "./cobranca-helpers";

/**
 * TRIAL COM CARTÃO: ISOLAMENTO ENTRE MARCAS, ÚNICOS E GRANTS — mudança 003,
 * fatia 2 (T-004). Cobre:
 *  - AC-010.2: planos de uma marca não vazam para a outra; as funções novas e
 *    as redefinidas não têm EXECUTE para PUBLIC, anon nem authenticated;
 *  - AC-003.5: um documento (só o hash) tem um trial por marca;
 *  - AC-006.5: um pedido de reembolso por cobrança.
 */

const P = "c0b00726-0000-4000-8000";
const PARCEIRO = uuid(P, 1);
const MARCA_A = uuid(P, 11);
const MARCA_B = uuid(P, 12);
const CLIENTE_A = uuid(P, 21);
const CLIENTE_B = uuid(P, 22);
const ADMIN_A = uuid(P, 31);
const ADMIN_B = uuid(P, 32);
const DONO = uuid(P, 33);
const ORG_A = uuid(P, 41);
const ORG_B = uuid(P, 42);
const PLANO_A = uuid(P, 901);
const PLANO_B = uuid(P, 902);
const HASH = "a".repeat(64);

function orgDaMarca(id: string, marca: string, cliente: string, settings = "{}"): string {
  return `insert into public.organizations (id, slug, legal_name, display_name, created_by, brand_id, settings)
            values ('${id}', 'trial-iso-${id.slice(-3)}', 'x', 'x', '${cliente}', '${marca}', '${settings}'::jsonb)`;
}
const planoDaAssinatura = (orgId: string) =>
  valor(`select coalesce((select plano_id::text from public.cobranca_assinaturas where organization_id = '${orgId}'), 'isenta');`);

beforeAll(() => {
  criarUsuarios([
    [CLIENTE_A, "cliente-a-0725@invariant.test"],
    [CLIENTE_B, "cliente-b-0725@invariant.test"],
    [ADMIN_A, "admin-a-0725@invariant.test"],
    [ADMIN_B, "admin-b-0725@invariant.test"],
    [DONO, "dono-0725@invariant.test"],
  ]);
  tornarPlatformAdmin(DONO, "full", DONO);
  sql(`insert into public.partners (id, slug, name) values ('${PARCEIRO}', 'trial-iso-parceiro', 'Parceiro')
         on conflict (id) do nothing;
       insert into public.brands (id, partner_id, slug, name, cobranca_ligada) values
         ('${MARCA_A}', '${PARCEIRO}', 'trial-iso-a', 'A', true),
         ('${MARCA_B}', '${PARCEIRO}', 'trial-iso-b', 'B', true)
         on conflict (id) do nothing;
       insert into public.cobranca_planos (id, nome, preco_cents, intervalo, trial_dias, padrao_no_cadastro, brand_id) values
         ('${PLANO_A}', 'Plano A', 9900, 'mes', 7, true, '${MARCA_A}'),
         ('${PLANO_B}', 'Plano B', 19900, 'mes', 7, true, '${MARCA_B}')
         on conflict (id) do nothing;`);
  chaveDeCobranca("ligado");
  criarOrg(ORG_A, "trial-iso-org-a");
  criarOrg(ORG_B, "trial-iso-org-b");
  vincular(ADMIN_A, ORG_A, "admin");
  vincular(ADMIN_B, ORG_B, "admin");
});

describe("AC-010.2 — planos por marca, isolados", () => {
  it("AC-010.2: cada marca pode ter o seu plano padrão e a organização recebe o da própria marca", () => {
    sql(`${orgDaMarca(uuid(P, 101), MARCA_A, CLIENTE_A)};`);
    sql(`${orgDaMarca(uuid(P, 102), MARCA_B, CLIENTE_B)};`);

    expect(planoDaAssinatura(uuid(P, 101))).toBe(PLANO_A);
    expect(planoDaAssinatura(uuid(P, 102))).toBe(PLANO_B);
  });

  it("AC-010.2: dois planos padrão na MESMA marca são recusados (único por marca)", () => {
    const e = erroDe(`insert into public.cobranca_planos (id, nome, preco_cents, intervalo, padrao_no_cadastro, brand_id)
                        values ('${uuid(P, 903)}', 'Outro padrão A', 9900, 'mes', true, '${MARCA_A}');`);

    expect(e).toContain("23505");
    expect(e).toContain("cobranca_planos_um_padrao");
  });

  it("AC-010.2: escolher no cadastro o plano de OUTRA marca vale como sem escolha e cai no padrão da própria marca", () => {
    sql(`${orgDaMarca(uuid(P, 103), MARCA_A, CLIENTE_A, `{"cobranca_signup_plan_id": "${PLANO_B}"}`)};`);

    expect(planoDaAssinatura(uuid(P, 103))).toBe(PLANO_A);
  });

  it("AC-010.2: fn_create_tenant_with_owner recusa plano de outra marca (plano_invalido)", () => {
    const corpo = JSON.stringify({ display_name: "T", slug: "trial-iso-tenant", owner_email: "dono-0725@invariant.test", plano_id: PLANO_B, brand_id: MARCA_A });

    const e = erroDe(`set role service_role;
      select public.fn_create_tenant_with_owner('${DONO}', '${uuid(P, 501)}', '${corpo}'::jsonb, 'abcd');`);

    expect(e).toContain("plano_invalido");
  });
});

describe("AC-003.5 — um trial por documento por marca", () => {
  it("AC-003.5: o mesmo hash na mesma marca é recusado e em outra marca é aceito", () => {
    sql(`insert into public.cobranca_trial_documentos (brand_id, documento_hash, organization_id)
           values ('${MARCA_A}', '${HASH}', '${ORG_A}');`);

    const repetido = erroDe(`insert into public.cobranca_trial_documentos (brand_id, documento_hash, organization_id)
                               values ('${MARCA_A}', '${HASH}', '${ORG_B}');`);
    const outraMarca = erroDe(`insert into public.cobranca_trial_documentos (brand_id, documento_hash, organization_id)
                                 values ('${MARCA_B}', '${HASH}', '${ORG_B}');`);

    expect(repetido).toContain("23505");
    expect(outraMarca).toBe("");
  });

  it("AC-003.5: a tabela guarda só o hash (sem coluna de documento) e nem anon nem authenticated a leem", () => {
    const colunas = valor(`select string_agg(column_name, ',' order by column_name) from information_schema.columns
                             where table_schema = 'public' and table_name = 'cobranca_trial_documentos';`);
    expect(colunas).toBe("brand_id,created_at,documento_hash,organization_id");

    expect(erroDe(comoUsuario(ADMIN_A, "select count(*) from public.cobranca_trial_documentos"))).toContain("42501");
    expect(erroDe(comoAnon("select count(*) from public.cobranca_trial_documentos"))).toContain("42501");
  });

  it("AC-003.5: o hash precisa ter 64 caracteres hexadecimais (nunca um CPF/CNPJ)", () => {
    const e = erroDe(`insert into public.cobranca_trial_documentos (brand_id, documento_hash, organization_id)
                        values ('${MARCA_B}', '12345678909', '${ORG_B}');`);

    expect(e).toContain("23514");
  });
});

describe("AC-006.5 — um pedido de reembolso por cobrança", () => {
  it("AC-006.5: o segundo pedido da mesma cobrança é recusado pelo banco; outra cobrança passa", () => {
    sql(`insert into public.cobranca_reembolsos (organization_id, pagamento_ref) values ('${ORG_A}', 'pay_0725_a');`);

    const repetido = erroDe(`insert into public.cobranca_reembolsos (organization_id, pagamento_ref) values ('${ORG_A}', 'pay_0725_a');`);
    const outra = erroDe(`insert into public.cobranca_reembolsos (organization_id, pagamento_ref) values ('${ORG_A}', 'pay_0725_b');`);

    expect(repetido).toContain("23505");
    expect(outra).toBe("");
  });

  it("AC-006.5: admin de A lê só os pedidos de A; a escrita direta pela sessão e a leitura por anon são recusadas", () => {
    sql(`insert into public.cobranca_reembolsos (organization_id, pagamento_ref) values ('${ORG_B}', 'pay_0725_c');`);

    expect(countAs(ADMIN_A, "select count(*) from public.cobranca_reembolsos")).toBe(2);
    expect(countAs(ADMIN_B, "select count(*) from public.cobranca_reembolsos")).toBe(1);
    expect(erroDe(comoUsuario(ADMIN_A, `insert into public.cobranca_reembolsos (organization_id, pagamento_ref) values ('${ORG_A}', 'pay_0725_d')`)))
      .toContain("42501");
    expect(erroDe(comoAnon("select count(*) from public.cobranca_reembolsos"))).toContain("42501");
  });
});

describe("AC-010.2 — as funções do gatilho e do cadastro não são alcançáveis por PUBLIC, anon nem authenticated", () => {
  const FUNCOES = [
    "public.fn_trial_na_criacao_da_org()",
    "public.fn_create_tenant_with_owner(uuid, uuid, jsonb, text)",
    "public.fn_cobranca_da_marca_ligada(uuid)",
  ];

  for (const assinatura of FUNCOES) {
    it(`AC-010.2: ${assinatura} existe, tem EXECUTE só para o servidor`, () => {
      const dono = numero(`select count(*) from pg_proc where oid = to_regprocedure('${assinatura}');`);
      const publico = numero(`select count(*) from pg_proc p, aclexplode(coalesce(p.proacl, acldefault('f', p.proowner))) a
                                where p.oid = to_regprocedure('${assinatura}') and a.grantee = 0 and a.privilege_type = 'EXECUTE';`);
      const anon = valor(`select has_function_privilege('anon', to_regprocedure('${assinatura}'), 'execute')::text;`);
      const autenticado = valor(`select has_function_privilege('authenticated', to_regprocedure('${assinatura}'), 'execute')::text;`);

      expect({ dono, publico, anon, autenticado }).toEqual({ dono: 1, publico: 0, anon: "false", autenticado: "false" });
    });
  }
});
