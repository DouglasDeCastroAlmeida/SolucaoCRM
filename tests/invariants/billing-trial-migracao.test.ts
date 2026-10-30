import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

import { beforeAll, describe, expect, it } from "vitest";

import { sql } from "./gov-helpers";
import { chaveDeCobranca, criarPlano, criarUsuarios, numero, uuid, valor } from "./cobranca-helpers";

/**
 * TRIAL COM CARTÃO, A MIGRATION E O GATILHO — mudança 003, fatia 2 (T-003).
 *
 * Duas promessas, as duas sobre quem JÁ existe:
 *  - AC-002.1: aplicar a migration (de novo, como o update.sh faz) não cria
 *    assinatura para organização nenhuma: quem já existia segue como cortesia
 *    (sem linha em cobranca_assinaturas), operando.
 *  - AC-001.1: marca com `cobranca_ligada` falsa (o padrão) cadastra como
 *    antes: o gatilho dá o mesmo resultado de hoje. O ramo novo só vale para
 *    marca com a chave ligada E o módulo da instalação ligado.
 *
 * O banco é limpo por arquivo; os únicos planos e marcas aqui são os deste arquivo.
 */

const P = "c0b00725-0000-4000-8000";
const PARCEIRO = uuid(P, 1);
const MARCA_DESLIGADA = uuid(P, 11);
const MARCA_LIGADA = uuid(P, 12);
const CLIENTE = uuid(P, 21);
const PLANO_GLOBAL = uuid(P, 901);
const PLANO_DA_MARCA = uuid(P, 902);
const ORG_ANTIGA = uuid(P, 101);

function migration(): string {
  const dir = join(process.cwd(), "supabase", "migrations");
  const arquivo = readdirSync(dir).find((f) => /^\d{14}_0725_.*\.sql$/.test(f));
  if (arquivo === undefined) throw new Error("migration 0725 (trial com cartão) não existe");
  return readFileSync(join(dir, arquivo), "utf8");
}

function orgDaMarca(id: string, marca: string | null): void {
  sql(`insert into public.organizations (id, slug, legal_name, display_name, created_by, brand_id)
         values ('${id}', 'trial-mig-${id.slice(-3)}', 'x', 'x', '${CLIENTE}', ${marca === null ? "null" : `'${marca}'`});`);
}

/** `estado|dias de teste|entrada pendente|trial com cartão|plano`, ou `isenta`. */
function assinatura(orgId: string): string {
  return valor(`select coalesce((select estado || '|' || round(extract(epoch from (trial_ate - created_at)) / 86400)
                    || '|' || pagamento_inicial_pendente || '|' || trial_com_cartao || '|' || plano_id
                  from public.cobranca_assinaturas where organization_id = '${orgId}'), 'isenta');`);
}
const situacao = (orgId: string) =>
  valor(`select status || '|' || coalesce(suspended_kind, '-') from public.organizations where id = '${orgId}';`);

beforeAll(() => {
  criarUsuarios([[CLIENTE, "cliente-trial-0725@invariant.test"]]);
  sql(`insert into public.partners (id, slug, name) values ('${PARCEIRO}', 'trial-mig-parceiro', 'Parceiro')
         on conflict (id) do nothing;
       insert into public.brands (id, partner_id, slug, name) values
         ('${MARCA_DESLIGADA}', '${PARCEIRO}', 'trial-mig-desligada', 'Desligada'),
         ('${MARCA_LIGADA}', '${PARCEIRO}', 'trial-mig-ligada', 'Ligada')
         on conflict (id) do nothing;`);
  // Organização anterior à mudança: nasce com o módulo desligado, sem assinatura.
  chaveDeCobranca("desligado");
  orgDaMarca(ORG_ANTIGA, MARCA_DESLIGADA);
});

describe("AC-002.1 — a migration não cria assinatura para quem já existe", () => {
  it("AC-002.1: reaplicar a migration não cria assinatura e a organização antiga segue ativa, como cortesia", () => {
    const antes = numero(`select count(*) from public.cobranca_assinaturas;`);

    sql(migration());

    expect(numero(`select count(*) from public.cobranca_assinaturas;`)).toBe(antes);
    expect(assinatura(ORG_ANTIGA)).toBe("isenta");
    expect(situacao(ORG_ANTIGA)).toBe("active|-");
  });

  it("AC-001.1: toda marca nasce com cobranca_ligada falsa (coluna boolean, not null, default false)", () => {
    expect(valor(`select data_type || '|' || is_nullable || '|' || column_default from information_schema.columns
                   where table_schema = 'public' and table_name = 'brands' and column_name = 'cobranca_ligada';`))
      .toBe("boolean|NO|false");
    expect(numero(`select count(*) from public.brands where cobranca_ligada;`)).toBe(0);
  });
});

describe("AC-001.1 — marca com a cobrança desligada cadastra como antes", () => {
  beforeAll(() => {
    criarPlano({ id: PLANO_GLOBAL, nome: "Global", trialDias: 7, padrao: true });
    sql(`insert into public.cobranca_planos (id, nome, preco_cents, intervalo, trial_dias, padrao_no_cadastro, brand_id)
           values ('${PLANO_DA_MARCA}', 'Da marca', 9900, 'mes', 7, true, '${MARCA_LIGADA}')
           on conflict (id) do nothing;`);
    chaveDeCobranca("ligado");
  });

  it("AC-001.1: marca desligada recebe o plano da instalação, em teste sem cartão e ativa (o caminho de hoje)", () => {
    orgDaMarca(uuid(P, 102), MARCA_DESLIGADA);

    expect(assinatura(uuid(P, 102))).toBe(`trial|7|false|false|${PLANO_GLOBAL}`);
    expect(situacao(uuid(P, 102))).toBe("active|-");
  });

  it("AC-001.1: organização sem marca (marca padrão) também segue o caminho de hoje", () => {
    orgDaMarca(uuid(P, 103), null);

    expect(assinatura(uuid(P, 103))).toBe(`trial|7|false|false|${PLANO_GLOBAL}`);
    expect(situacao(uuid(P, 103))).toBe("active|-");
  });

  it("AC-001.1: marca com a chave ligada mas o módulo da instalação desligado não cobra nada", () => {
    sql(`update public.brands set cobranca_ligada = true where id = '${MARCA_LIGADA}';`);
    chaveDeCobranca("desligado");

    orgDaMarca(uuid(P, 104), MARCA_LIGADA);

    expect(assinatura(uuid(P, 104))).toBe("isenta");
    expect(situacao(uuid(P, 104))).toBe("active|-");
    chaveDeCobranca("ligado");
  });

  it("AC-001.1 (controle): marca com a chave ligada e o módulo ligado usa o plano da marca e nasce suspensa à espera do cartão", () => {
    sql(`update public.brands set cobranca_ligada = true where id = '${MARCA_LIGADA}';`);

    orgDaMarca(uuid(P, 105), MARCA_LIGADA);

    expect(assinatura(uuid(P, 105))).toBe(`trial|7|true|true|${PLANO_DA_MARCA}`);
    expect(situacao(uuid(P, 105))).toBe("suspended|cobranca");
  });
});
