import { beforeAll, describe, expect, it } from "vitest";

import { sql } from "./gov-helpers";

/**
 * A CÓPIA DO PACOTE VERTICAL É ATÔMICA, IDEMPOTENTE E SÓ DO SERVIDOR.
 *
 * Mudança SDD 002, AC-008.4 / AC-005.3. `fn_copiar_pacote_para_org` (migration 0718)
 * grava `settings.vertical_pack` num ÚNICO UPDATE condicional (`where not settings ?
 * 'vertical_pack'`), no lugar do ler-e-regravar que perdia dado sob concorrência.
 * Só `service_role` executa: ela recebe a organização por argumento.
 */

const PARTNER = "b7a4d018-0000-4000-8000-0000000000a1";
const PACK = "b7a4d018-0000-4000-8000-0000000000c1";
const PACK_INATIVO = "b7a4d018-0000-4000-8000-0000000000c2";
const BRAND = "b7a4d018-0000-4000-8000-0000000000b1";
const BRAND_SEM_PACOTE = "b7a4d018-0000-4000-8000-0000000000b2";
const BRAND_PACOTE_INATIVO = "b7a4d018-0000-4000-8000-0000000000b3";
const ORG = "b7a4d018-0000-4000-8000-0000000000d1";
const ORG_JA_COPIADA = "b7a4d018-0000-4000-8000-0000000000d2";
const ORG_2 = "b7a4d018-0000-4000-8000-0000000000d3";

const copiar = (org: string, brand: string) =>
  sql(`select public.fn_copiar_pacote_para_org('${org}', '${brand}');`);
const settings = (org: string) =>
  sql(`select settings::text from public.organizations where id = '${org}';`);

beforeAll(() => {
  sql(`
    insert into public.vertical_packs (id, slug, name, seed, status) values
      ('${PACK}', 'marcas-atomico-ok', 'Ok', '{"etapas":["a","b"]}', 'active'),
      ('${PACK_INATIVO}', 'marcas-atomico-off', 'Off', '{}', 'inactive')
    on conflict (id) do nothing;
    insert into public.partners (id, slug, name) values ('${PARTNER}', 'marcas-atomico-p', 'P')
    on conflict (id) do nothing;
    insert into public.brands (id, partner_id, slug, name, default_pack_id) values
      ('${BRAND}', '${PARTNER}', 'marcas-atomico-1', 'M1', '${PACK}'),
      ('${BRAND_SEM_PACOTE}', '${PARTNER}', 'marcas-atomico-2', 'M2', null),
      ('${BRAND_PACOTE_INATIVO}', '${PARTNER}', 'marcas-atomico-3', 'M3', '${PACK_INATIVO}')
    on conflict (id) do nothing;
    insert into public.organizations (id, slug, legal_name, display_name, settings) values
      ('${ORG}', 'marcas-atomico-o1', 'O1', 'O1', '{"llm":"x"}'),
      ('${ORG_JA_COPIADA}', 'marcas-atomico-o2', 'O2', 'O2', '{"vertical_pack":{"slug":"antigo"}}'),
      ('${ORG_2}', 'marcas-atomico-o3', 'O3', 'O3', '{}')
    on conflict (id) do update set settings = excluded.settings;
  `);
});

describe("AC-008.4: fn_copiar_pacote_para_org", () => {
  it("AC-008.4: copia o pacote e preserva as outras chaves de settings", () => {
    expect(copiar(ORG, BRAND)).toBe("t");
    const s = JSON.parse(settings(ORG));
    expect(s.llm).toBe("x");
    expect(s.vertical_pack).toMatchObject({ slug: "marcas-atomico-ok", pack_id: PACK, version: 1 });
    expect(s.vertical_pack.seed).toEqual({ etapas: ["a", "b"] });
  });

  it("AC-008.4: a segunda chamada é idempotente e não sobrescreve a cópia", () => {
    const antes = settings(ORG);
    expect(copiar(ORG, BRAND)).toBe("f");
    expect(settings(ORG)).toBe(antes);
  });

  it("AC-008.4: organização que já tem cópia não é tocada", () => {
    expect(copiar(ORG_JA_COPIADA, BRAND)).toBe("f");
    expect(JSON.parse(settings(ORG_JA_COPIADA)).vertical_pack.slug).toBe("antigo");
  });

  it("AC-008.4: marca sem pacote ou com pacote inativo não copia nada", () => {
    expect(copiar(ORG_2, BRAND_SEM_PACOTE)).toBe("f");
    expect(copiar(ORG_2, BRAND_PACOTE_INATIVO)).toBe("f");
    expect(JSON.parse(settings(ORG_2))).toEqual({});
  });

  it("AC-008.4: mudar o pacote depois não altera a organização", () => {
    sql(`update public.vertical_packs set seed = '{"etapas":["z"]}', version = 2 where id = '${PACK}';`);
    const s = JSON.parse(settings(ORG));
    expect(s.vertical_pack.seed).toEqual({ etapas: ["a", "b"] });
    expect(s.vertical_pack.version).toBe(1);
  });
});

describe("AC-003.4: só service_role executa fn_copiar_pacote_para_org", () => {
  const exec = (papel: string) =>
    sql(`select has_function_privilege('${papel}', 'public.fn_copiar_pacote_para_org(uuid,uuid)', 'execute');`);

  it("AC-003.4: anon e authenticated não executam", () => {
    expect(exec("anon")).toBe("f");
    expect(exec("authenticated")).toBe("f");
  });

  it("AC-003.4: PUBLIC não executa (a ACL não traz grantee 0)", () => {
    const out = sql(`
      select count(*) from pg_proc p, aclexplode(p.proacl) a
       where p.oid = 'public.fn_copiar_pacote_para_org(uuid,uuid)'::regprocedure and a.grantee = 0;
    `);
    expect(out).toBe("0");
  });

  it("AC-003.4: service_role executa", () => {
    expect(exec("service_role")).toBe("t");
  });
});
