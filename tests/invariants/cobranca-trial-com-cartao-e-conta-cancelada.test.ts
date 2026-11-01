import { beforeAll, describe, expect, it } from "vitest";

import { sql } from "./gov-helpers";
import { assinar, comoServidor, criarOrg, criarPlano, numero, resultado, uuid, valor } from "./cobranca-helpers";

/**
 * O TRIAL COM CARTÃO E A CONTA CANCELADA, NO BANCO (mudança 003, Fatia 6).
 *   - AC-004.4: os avisos "cobra em 2 dias" e "cobra amanhã" (CHECK ampliado na
 *     migration 0725) são aceitos e ganham UMA vez só, com UM item na Central;
 *   - AC-005.6: conta cancelada cujo período pago acabou é suspensa por cobrança
 *     (o acesso termina) e NENHUM dado é apagado nem anonimizado pela suspensão.
 *     O prazo de 90 dias e a anonimização da conta cancelada NÃO são exercitados
 *     aqui porque ainda não existem como automação (ver o relato da Fatia 6).
 */

const P = "c0b3a006-0000-4000-8000";
const PLANO = uuid(P, 101);
const ORG_AVISOS = uuid(P, 1);
const ORG_CANCELADA = uuid(P, 2);
const CONTATO = uuid(P, 201);

const registrar = (org: string, aviso: string) =>
  valor(
    comoServidor(
      `select public.fn_cobranca_registrar_aviso('${org}', '${aviso}', null, 'Título ${aviso}', 'Corpo', 'info')::text`,
    ),
  );
const abertos = (org: string) =>
  numero(`select count(*) from public.agent_inbox_items where organization_id = '${org}' and kind = 'cobranca' and ref_kind is null and status = 'open';`);

beforeAll(() => {
  criarPlano({ id: PLANO, nome: "Trial com cartão" });
  criarOrg(ORG_AVISOS, "cob-trial-cartao-1");
  criarOrg(ORG_CANCELADA, "cob-trial-cartao-2");
  assinar(ORG_AVISOS, PLANO);
  assinar(ORG_CANCELADA, PLANO);
  sql(`insert into public.contacts (id, organization_id, display_name) values ('${CONTATO}', '${ORG_CANCELADA}', 'Contato 003')
         on conflict (id) do nothing;`);
});

describe("avisos do trial com cartão", () => {
  it("AC-004.4: ⭐ cada aviso ganha uma vez só; o seguinte fecha o anterior e a Central fica com um item aberto", () => {
    expect(registrar(ORG_AVISOS, "trial_cobra_em_2_dias")).toBe("true");
    expect(registrar(ORG_AVISOS, "trial_cobra_em_2_dias")).toBe("false");
    expect(abertos(ORG_AVISOS)).toBe(1);
    expect(registrar(ORG_AVISOS, "trial_cobra_amanha")).toBe("true");
    expect(registrar(ORG_AVISOS, "trial_cobra_amanha")).toBe("false");
    expect(abertos(ORG_AVISOS)).toBe(1);
    expect(valor(`select ultimo_aviso from public.cobranca_assinaturas where organization_id = '${ORG_AVISOS}';`)).toBe("trial_cobra_amanha");
  });
});

describe("conta cancelada depois de pagar", () => {
  it("AC-005.6: ⭐ vencido o período pago, a suspensão por cobrança encerra o acesso e preserva os dados", () => {
    sql(`update public.cobranca_assinaturas
            set estado = 'cancelada', cancela_no_fim = true, proximo_vencimento = now() - interval '1 day'
          where organization_id = '${ORG_CANCELADA}';`);
    expect(resultado(`public.fn_cobranca_suspender_se_devendo('${ORG_CANCELADA}', 'Falta de pagamento')`)).toEqual({ changed: true });
    expect(valor(`select status || '/' || suspended_kind from public.organizations where id = '${ORG_CANCELADA}';`)).toBe("suspended/cobranca");
    expect(valor(`select display_name from public.contacts where id = '${CONTATO}';`)).toBe("Contato 003");
  });

  it("AC-005.6: enquanto o período pago não acabou a régua não suspende (o acesso segue até o fim)", () => {
    // A decisão de tempo é da régua em TypeScript (regua.test.ts); aqui só o contrato do banco:
    // a função suspende quem está em atraso ou cancelado, e nunca quem está ativo.
    sql(`update public.cobranca_assinaturas set estado = 'ativa' where organization_id = '${ORG_AVISOS}';`);
    expect(resultado(`public.fn_cobranca_suspender_se_devendo('${ORG_AVISOS}', 'Falta de pagamento')`)).toEqual({ changed: false, motivo: "nao_deve" });
  });
});
