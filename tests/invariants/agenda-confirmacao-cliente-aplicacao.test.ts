import { beforeAll, describe, expect, it } from "vitest";

import { sql } from "./gov-helpers";

/**
 * AGENDA — CONFIRMAÇÃO PELO CLIENTE: O UPDATE QUE A APLICAÇÃO FAZ É ISOLADO E IDEMPOTENTE.
 *
 * Mudança SDD 007, Fatia 3 (T-012). Roda no Postgres do `scripts/test-db.sh`
 * (no CI; não roda na máquina de desenvolvimento). Reproduz, como o papel dono
 * (que ignora RLS, igual ao service role), o UPDATE de
 * `lib/agenda/aplicar-confirmacao-do-cliente.ts` e prova:
 *
 * - AC-005.3: a organização vem da conversa ingerida; o contato de OUTRA
 *   organização (ou o mesmo contact_id com a org errada) não afeta o compromisso.
 * - AC-002.7: o UPDATE grava só `client_confirmed_at`; `status` e a confirmação
 *   da equipe (`service_confirmed_at`) ficam como estavam.
 * - AC-002.5: a segunda execução (mesma mensagem entregue duas vezes) não
 *   encontra linha: o UPDATE condicional é a idempotência.
 */

const ORG_A = "b7a4d007-0000-4000-8000-0000000000c1";
const ORG_B = "b7a4d007-0000-4000-8000-0000000000c2";
const TIPO_A = "b7a4d007-2222-4000-8000-0000000000c1";
const TIPO_B = "b7a4d007-2222-4000-8000-0000000000c2";
const CONTATO_A = "b7a4d007-4444-4000-8000-0000000000c1";
const CONTATO_B = "b7a4d007-4444-4000-8000-0000000000c2";
const COMPROMISSO_A = "b7a4d007-3333-4000-8000-0000000000c1";
const COMPROMISSO_B = "b7a4d007-3333-4000-8000-0000000000c2";

/** O UPDATE da aplicação, com a org e o contato da CONVERSA como únicas entradas. */
function confirmar(org: string, contato: string, compromisso: string): string {
  return sql(`
    with up as (
      update public.calendar_appointments
         set client_confirmed_at = now()
       where id = '${compromisso}'
         and organization_id = '${org}'
         and contact_id = '${contato}'
         and status in ('pending', 'confirmed')
         and client_confirmed_at is null
       returning id
    )
    select count(*) from up;
  `);
}

beforeAll(() => {
  sql(`
    insert into public.organizations (id, slug, legal_name, display_name) values
      ('${ORG_A}', 'agenda-conf-ap-a', 'Org A', 'Org A'),
      ('${ORG_B}', 'agenda-conf-ap-b', 'Org B', 'Org B')
    on conflict (id) do nothing;

    insert into public.contacts (id, organization_id, name) values
      ('${CONTATO_A}', '${ORG_A}', 'Contato A'),
      ('${CONTATO_B}', '${ORG_B}', 'Contato B')
    on conflict (id) do nothing;

    insert into public.calendar_event_types (id, organization_id, name, slug, client_confirmation_enabled) values
      ('${TIPO_A}', '${ORG_A}', 'Consulta A', 'agenda-conf-ap-a', true),
      ('${TIPO_B}', '${ORG_B}', 'Consulta B', 'agenda-conf-ap-b', true)
    on conflict (id) do nothing;

    insert into public.calendar_appointments
      (id, organization_id, event_type_id, contact_id, title, starts_at, ends_at, status, service_confirmed_at, reminder_sent_at) values
      ('${COMPROMISSO_A}', '${ORG_A}', '${TIPO_A}', '${CONTATO_A}', 'Compromisso A',
         now() + interval '1 day', now() + interval '1 day 1 hour', 'pending', null, now() - interval '1 hour'),
      ('${COMPROMISSO_B}', '${ORG_B}', '${TIPO_B}', '${CONTATO_B}', 'Compromisso B',
         now() + interval '1 day', now() + interval '1 day 1 hour', 'pending', null, now() - interval '1 hour')
    on conflict (id) do nothing;
  `);
});

describe("AC-005.3: a confirmação não atravessa organizações", () => {
  it("AC-005.3: org e contato da outra organização não alcançam o compromisso", () => {
    expect(confirmar(ORG_B, CONTATO_B, COMPROMISSO_A)).toBe("0");
    expect(confirmar(ORG_A, CONTATO_B, COMPROMISSO_A)).toBe("0");
    expect(confirmar(ORG_B, CONTATO_A, COMPROMISSO_A)).toBe("0");
    expect(
      sql(`select client_confirmed_at is null from public.calendar_appointments where id = '${COMPROMISSO_A}';`),
    ).toBe("t");
  });
});

describe("AC-002.7 e AC-002.5: campo próprio e idempotência", () => {
  it("AC-002.7: a primeira execução grava só o campo próprio; a segunda não encontra linha", () => {
    expect(confirmar(ORG_A, CONTATO_A, COMPROMISSO_A)).toBe("1");
    expect(
      sql(`
        select (client_confirmed_at is not null)::text || ',' || status || ',' || (service_confirmed_at is null)::text
          from public.calendar_appointments where id = '${COMPROMISSO_A}';
      `),
    ).toBe("true,pending,true");
    // AC-002.5: a mesma mensagem entregue de novo.
    expect(confirmar(ORG_A, CONTATO_A, COMPROMISSO_A)).toBe("0");
  });

  it("AC-005.3: o compromisso da outra organização segue intocado", () => {
    expect(
      sql(`select client_confirmed_at is null from public.calendar_appointments where id = '${COMPROMISSO_B}';`),
    ).toBe("t");
  });
});
