import { beforeAll, describe, expect, it } from "vitest";

import { sql } from "./gov-helpers";
import { chaveDeCobranca, criarUsuarios, sessao, uuid, valor } from "./cobranca-helpers";

/**
 * TRIAL COM CARTÃO: IDEMPOTÊNCIA DA CONFIRMAÇÃO E REATIVAÇÃO — mudança 003, fatia 5
 * (T-020). Roda só no CI (Postgres real). Cobre:
 *  - AC-003.7: dois retornos concorrentes do Checkout gravam a confirmação UMA vez
 *    (o compare-and-set de `lib/billing-trial/confirmar.ts` em
 *    `pagamento_inicial_pendente`) e a organização tem uma única linha de assinatura;
 *  - AC-005.4: org suspensa por cobrança volta a ativa quando a assinatura passa a
 *    em dia, e reativar de novo não muda nada (`changed` falso).
 * O que NÃO se prova aqui: o Asaas (a assinatura única lá é prova de tela, Fatia 11).
 */

const P = "c0b00727-0000-4000-8000";
const PARCEIRO = uuid(P, 1);
const MARCA = uuid(P, 11);
const CLIENTE = uuid(P, 21);
const ORG_CORRIDA = uuid(P, 41);
const ORG_PAGA = uuid(P, 42);
const PLANO = uuid(P, 901);

const orgDaMarca = (id: string) =>
  `insert into public.organizations (id, slug, legal_name, display_name, created_by, brand_id, settings)
     values ('${id}', 'trial-idem-${id.slice(-3)}', 'x', 'x', '${CLIENTE}', '${MARCA}', '{}'::jsonb)`;

/**
 * O mesmo compare-and-set de `confirmarTrialDoCheckout`: devolve quantas linhas ele gravou.
 *
 * LIMITAÇÃO REGISTRADA: este SQL é uma CÓPIA do update de `lib/billing-trial/confirmar.ts`, não a
 * função real. Chamar `confirmarTrialDoCheckout` aqui pediria um cliente supabase-js/PostgREST
 * sobre este Postgres, e a suíte só tem `psql` (`gov-helpers`), que é também o que permite segurar
 * a transação com `pg_sleep` para forçar a corrida. A cópia pode divergir do código: o teste
 * unitário `lib/billing-trial/confirmar.test.ts` (AC-003.7) cobre a função real contra um banco
 * falso, e a corrida real com o provedor fica para a prova pela tela (Fatia 11).
 */
const confirmacao = (org: string, assinatura: string, seguraSegundos = 0) =>
  `with u as (
     update public.cobranca_assinaturas
        set provedor = 'asaas', provedor_cliente_id = 'cus_idem_${org.slice(-3)}', provedor_assinatura_id = '${assinatura}',
            pagamento_inicial_pendente = false
      where organization_id = '${org}' and pagamento_inicial_pendente = true
      returning 1)
   ${seguraSegundos > 0 ? `, espera as (select pg_sleep(${seguraSegundos}))
   select count(*) from u, espera` : "select count(*) from u"}`;

beforeAll(() => {
  criarUsuarios([[CLIENTE, "cliente-0727@invariant.test"]]);
  sql(`insert into public.partners (id, slug, name) values ('${PARCEIRO}', 'trial-idem-parceiro', 'Parceiro')
         on conflict (id) do nothing;
       insert into public.brands (id, partner_id, slug, name, cobranca_ligada)
         values ('${MARCA}', '${PARCEIRO}', 'trial-idem', 'Idem', true) on conflict (id) do nothing;
       insert into public.cobranca_planos (id, nome, preco_cents, intervalo, trial_dias, padrao_no_cadastro, brand_id)
         values ('${PLANO}', 'Plano Idem', 9900, 'mes', 7, true, '${MARCA}') on conflict (id) do nothing;`);
  chaveDeCobranca("ligado");
  sql(`${orgDaMarca(ORG_CORRIDA)}; ${orgDaMarca(ORG_PAGA)};`);
});

describe("AC-003.7 — dois retornos concorrentes confirmam uma vez", () => {
  it("AC-003.7: a org do cadastro nasce suspensa por cobrança, com uma linha de trial com cartão pendente", () => {
    expect(valor(`select status || ':' || coalesce(suspended_kind, '') from public.organizations where id = '${ORG_CORRIDA}';`)).toBe("suspended:cobranca");
    expect(valor(`select trial_com_cartao::text || ':' || pagamento_inicial_pendente::text from public.cobranca_assinaturas where organization_id = '${ORG_CORRIDA}';`)).toBe("true:true");
  });

  it("AC-003.7: duas confirmações simultâneas gravam uma só vez e a org segue com uma única linha de assinatura", async () => {
    const [a, b] = await Promise.all([
      // A primeira segura a trava da linha por 2 s (o update e o pg_sleep são UM comando: `psql -c` só imprime o resultado do último); a segunda chega 600 ms depois e espera a trava da linha.
      sessao(`${confirmacao(ORG_CORRIDA, "sub_a", 2)};`),
      new Promise((r) => setTimeout(r, 600)).then(() => sessao(`${confirmacao(ORG_CORRIDA, "sub_b")};`)),
    ]);

    expect(a.ok && b.ok).toBe(true);
    const gravadas = [a, b].map((x) => Number(x.saida.trim()));
    expect(gravadas.sort()).toEqual([0, 1]);
    expect(valor(`select count(*) from public.cobranca_assinaturas where organization_id = '${ORG_CORRIDA}';`)).toBe("1");
    expect(valor(`select provedor_assinatura_id in ('sub_a', 'sub_b') from public.cobranca_assinaturas where organization_id = '${ORG_CORRIDA}';`)).toBe("t");
  });
});

describe("AC-005.4 — pagamento confirmado reativa a org suspensa por cobrança", () => {
  it("AC-005.4: com a assinatura em dia, a reativação por cobrança liga a org uma única vez", () => {
    sql(`${confirmacao(ORG_PAGA, "sub_paga")};`);
    sql(`update public.cobranca_assinaturas set estado = 'ativa' where organization_id = '${ORG_PAGA}';`);

    const primeira = valor(`select (public.fn_reativar_organizacao('${ORG_PAGA}', 'cobranca', null))->>'changed';`);
    const segunda = valor(`select (public.fn_reativar_organizacao('${ORG_PAGA}', 'cobranca', null))->>'changed';`);

    expect(primeira).toBe("true");
    expect(segunda).toBe("false");
    expect(valor(`select status from public.organizations where id = '${ORG_PAGA}';`)).toBe("active");
  });
});
