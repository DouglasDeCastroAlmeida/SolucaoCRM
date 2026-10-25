import { readFileSync } from "node:fs";
import { join } from "node:path";

import { beforeAll, describe, expect, it } from "vitest";

import { columnExists, sql, tableExists } from "./gov-helpers";

/**
 * MARCAS, PARCEIROS E DOMÍNIOS — A MIGRAÇÃO 0717 É ADITIVA, IDEMPOTENTE E HERDA.
 *
 * Mudança SDD 002, REQ-002 e AC-010.3. O que se prova, no Postgres de verdade
 * que o `scripts/test-db.sh` sobe (o molde já recebeu o baseline DUAS vezes:
 * install com ON_ERROR_STOP e update sem):
 *
 * - AC-002.2: a marca padrão existe, é única, tem os campos visuais NULOS (herda
 *   de `platform_branding` em vez de copiá-la) e a organização que ficou sem
 *   `brand_id` passa a apontar para ela quando o apêndice é reaplicado.
 * - AC-002.3: o que a imagem anterior faz (inserir organização sem `brand_id`)
 *   continua funcionando; nada existente foi apagado; apagar uma marca não
 *   apaga a organização.
 * - AC-002.4 / AC-010.3: o apêndice do baseline, extraído do arquivo, aplica
 *   limpo (ON_ERROR_STOP=1) mais duas vezes sobre um banco COM dados, sem
 *   duplicar nada; e é a cópia literal da migration.
 */

const MIGRATION = join(
  process.cwd(),
  "supabase",
  "migrations",
  "20261025100000_0717_marcas_parceiros_e_dominios.sql",
);
const BASELINE = join(process.cwd(), "supabase", "baseline.sql");

const ORG_ANTIGA = "b7a4d001-0000-4000-8000-000000000001";
const ORG_SEM_MARCA = "b7a4d001-0000-4000-8000-000000000002";
const MARCA_TEMP = "b7a4d001-0000-4000-8000-0000000000b1";
const ORG_DA_MARCA_TEMP = "b7a4d001-0000-4000-8000-000000000003";

/** O apêndice 0717 do baseline: do cabeçalho até o próximo bloco rotulado. */
function apendice(): string {
  const texto = readFileSync(BASELINE, "utf8");
  const inicio = texto.indexOf("-- ---- marcas, parceiros e domínios (migration 0717) ----");
  if (inicio < 0) throw new Error("apêndice 0717 ausente no baseline.sql");
  const fim = texto.indexOf("\n-- ---- ", inicio + 10);
  return texto.slice(inicio, fim < 0 ? undefined : fim);
}

function contagens(): string {
  return sql(`
    select (select count(*) from public.partners)
      || ',' || (select count(*) from public.brands)
      || ',' || (select count(*) from public.brands where is_default)
      || ',' || (select count(*) from public.brand_domains)
      || ',' || (select count(*) from public.vertical_packs);
  `);
}

beforeAll(() => {
  sql(`
    insert into public.platform_branding (id, app_name, accent_hex)
    values (1, 'Marca da Instalação', '#112233')
    on conflict (id) do update set app_name = excluded.app_name, accent_hex = excluded.accent_hex;
  `);
  // A imagem anterior não conhece brand_id: insere a organização só com as
  // colunas que já existiam.
  sql(`
    insert into public.organizations (id, slug, legal_name, display_name) values
      ('${ORG_ANTIGA}', 'marcas-mig-antiga', 'Org Antiga', 'Org Antiga'),
      ('${ORG_SEM_MARCA}', 'marcas-mig-sem-marca', 'Org Sem Marca', 'Org Sem Marca')
    on conflict (id) do nothing;
  `);
});

describe("AC-002.2: a marca padrão herda de platform_branding", () => {
  it("AC-002.2: existe exatamente uma marca padrão, no parceiro da plataforma", () => {
    const out = sql(`
      select count(*) || ',' || min(p.slug::text)
        from public.brands b join public.partners p on p.id = b.partner_id
       where b.is_default;
    `);
    expect(out).toBe("1,plataforma");
  });

  it("AC-002.2: a marca padrão nasce com os campos visuais nulos (herda, não copia)", () => {
    const out = sql(`
      select (app_name is null)::text || ',' || (logo_path is null)::text || ','
          || (accent_hex is null)::text || ',' || cadastro_aberto::text
        from public.brands where is_default;
    `);
    expect(out).toBe("true,true,true,false");
  });

  it("AC-002.2: reaplicar o apêndice liga a organização sem marca à marca padrão e não toca platform_branding", () => {
    sql(apendice());
    const out = sql(`
      select (select count(*) from public.organizations o
               where o.id in ('${ORG_ANTIGA}', '${ORG_SEM_MARCA}')
                 and o.brand_id = (select id from public.brands where is_default))
        || ',' || (select app_name || ':' || accent_hex from public.platform_branding where id = 1);
    `);
    expect(out).toBe("2,Marca da Instalação:#112233");
  });
});

describe("AC-002.3: a imagem anterior continua funcionando", () => {
  it("AC-002.3: brand_id é opcional, então inserir organização sem ele funciona", () => {
    expect(columnExists("organizations", "brand_id")).toBe(true);
    const out = sql(`
      select is_nullable from information_schema.columns
       where table_schema = 'public' and table_name = 'organizations' and column_name = 'brand_id';
    `);
    expect(out).toBe("YES");
  });

  it("AC-002.3: as colunas que já existiam em organizations seguem no lugar", () => {
    for (const coluna of ["id", "slug", "legal_name", "display_name", "status", "settings"]) {
      expect(columnExists("organizations", coluna)).toBe(true);
    }
  });

  it("AC-002.3: apagar uma marca não apaga a organização ligada a ela (set null)", () => {
    sql(`
      insert into public.brands (id, partner_id, slug, name)
      select '${MARCA_TEMP}', id, 'marcas-mig-temp', 'Temporária' from public.partners where slug = 'plataforma'
      on conflict (id) do nothing;
      insert into public.organizations (id, slug, legal_name, display_name, brand_id)
      values ('${ORG_DA_MARCA_TEMP}', 'marcas-mig-temp', 'Org Temp', 'Org Temp', '${MARCA_TEMP}')
      on conflict (id) do nothing;
      delete from public.brands where id = '${MARCA_TEMP}';
    `);
    const out = sql(`
      select count(*) || ',' || count(brand_id) from public.organizations where id = '${ORG_DA_MARCA_TEMP}';
    `);
    expect(out).toBe("1,0");
  });
});

describe("AC-002.4 e AC-010.3: o apêndice é idempotente", () => {
  it("AC-010.3: as tabelas e a coluna novas existem na instalação", () => {
    for (const t of [
      "partners",
      "partner_members",
      "brands",
      "brand_domains",
      "brand_plans",
      "vertical_packs",
      "brand_email_context",
      "auth_hook_deliveries",
    ]) {
      expect(tableExists(t)).toBe(true);
    }
  });

  it("AC-002.4: reaplicar o apêndice (ON_ERROR_STOP) em banco com dados não duplica nada", () => {
    const antes = contagens();
    sql(apendice());
    sql(apendice());
    expect(contagens()).toBe(antes);
  });

  it("AC-002.4: reaplicar a migration inteira também não duplica nada", () => {
    const antes = contagens();
    sql(readFileSync(MIGRATION, "utf8"));
    expect(contagens()).toBe(antes);
  });

  it("AC-010.3: o apêndice do baseline é a cópia literal do corpo da migration", () => {
    const migration = readFileSync(MIGRATION, "utf8").split("\n").slice(1).join("\n").trim();
    expect(apendice()).toContain(migration);
  });
});
