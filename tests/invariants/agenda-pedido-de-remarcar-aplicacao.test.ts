import { beforeAll, describe, expect, it } from "vitest";

import { sql } from "./gov-helpers";

/**
 * AGENDA — PEDIDO DE REMARCAR PELO CLIENTE: O UPDATE É ISOLADO, IDEMPOTENTE E NÃO MEXE NO STATUS.
 *
 * Mudança SDD 007, Fatia 4 (T-014). Roda no Postgres do `scripts/test-db.sh` (no
 * CI; não roda na máquina de desenvolvimento). Reproduz, como o papel dono (que
 * ignora RLS, igual ao service role), o UPDATE de `registrarPedidoDeRemarcar`
 * (`lib/agenda/aplicar-confirmacao-do-cliente.ts`) e o de
 * `lib/agenda/limpar-pedido-de-remarcar.ts`, e prova:
 *
 * - AC-005.3: org/contato da outra organização não alcançam o compromisso.
 * - AC-003.2: o pedido grava só `client_reschedule_requested_at`; `status` fica.
 * - AC-003.3: a segunda execução não encontra linha.
 * - AC-003.4: a limpeza zera o pedido (e a confirmação, quando o horário muda).
 */

const ORG_A = "b7a4d007-0000-4000-8000-0000000000d1";
const ORG_B = "b7a4d007-0000-4000-8000-0000000000d2";
const TIPO_A = "b7a4d007-2222-4000-8000-0000000000d1";
const TIPO_B = "b7a4d007-2222-4000-8000-0000000000d2";
const CONTATO_A = "b7a4d007-4444-4000-8000-0000000000d1";
const CONTATO_B = "b7a4d007-4444-4000-8000-0000000000d2";
const COMPROMISSO_A = "b7a4d007-3333-4000-8000-0000000000d1";
const COMPROMISSO_B = "b7a4d007-3333-4000-8000-0000000000d2";

function pedirParaRemarcar(org: string, contato: string, compromisso: string): string {
  return sql(`
    with up as (
      update public.calendar_appointments
         set client_reschedule_requested_at = now()
       where id = '${compromisso}'
         and organization_id = '${org}'
         and contact_id = '${contato}'
         and status in ('pending', 'confirmed')
         and client_reschedule_requested_at is null
       returning id
    )
    select count(*) from up;
  `);
}

beforeAll(() => {
  sql(`
    insert into public.organizations (id, slug, legal_name, display_name) values
      ('${ORG_A}', 'agenda-rem-ap-a', 'Org A', 'Org A'),
      ('${ORG_B}', 'agenda-rem-ap-b', 'Org B', 'Org B')
    on conflict (id) do nothing;

    insert into public.contacts (id, organization_id, name) values
      ('${CONTATO_A}', '${ORG_A}', 'Contato A'),
      ('${CONTATO_B}', '${ORG_B}', 'Contato B')
    on conflict (id) do nothing;

    insert into public.calendar_event_types (id, organization_id, name, slug, client_confirmation_enabled) values
      ('${TIPO_A}', '${ORG_A}', 'Consulta A', 'agenda-rem-ap-a', true),
      ('${TIPO_B}', '${ORG_B}', 'Consulta B', 'agenda-rem-ap-b', true)
    on conflict (id) do nothing;

    insert into public.calendar_appointments
      (id, organization_id, event_type_id, contact_id, title, starts_at, ends_at, status, client_confirmed_at, reminder_sent_at) values
      ('${COMPROMISSO_A}', '${ORG_A}', '${TIPO_A}', '${CONTATO_A}', 'Compromisso A',
         now() + interval '1 day', now() + interval '1 day 1 hour', 'pending', now(), now() - interval '1 hour'),
      ('${COMPROMISSO_B}', '${ORG_B}', '${TIPO_B}', '${CONTATO_B}', 'Compromisso B',
         now() + interval '1 day', now() + interval '1 day 1 hour', 'pending', null, now() - interval '1 hour')
    on conflict (id) do nothing;
  `);
});

describe("AC-005.3: o pedido não atravessa organizações", () => {
  it("AC-005.3: org e contato da outra organização não alcançam o compromisso", () => {
    expect(pedirParaRemarcar(ORG_B, CONTATO_B, COMPROMISSO_A)).toBe("0");
    expect(pedirParaRemarcar(ORG_A, CONTATO_B, COMPROMISSO_A)).toBe("0");
    expect(
      sql(`select client_reschedule_requested_at is null from public.calendar_appointments where id = '${COMPROMISSO_A}';`),
    ).toBe("t");
  });
});

describe("AC-003.2, AC-003.3 e AC-003.4", () => {
  it("AC-003.2: grava só o campo próprio (status segue pending) e AC-003.3: a segunda execução não encontra linha", () => {
    expect(pedirParaRemarcar(ORG_A, CONTATO_A, COMPROMISSO_A)).toBe("1");
    expect(
      sql(`select (client_reschedule_requested_at is not null)::text || ',' || status from public.calendar_appointments where id = '${COMPROMISSO_A}';`),
    ).toBe("true,pending");
    expect(pedirParaRemarcar(ORG_A, CONTATO_A, COMPROMISSO_A)).toBe("0");
  });

  it("AC-003.4: a limpeza por remarcação zera o pedido e a confirmação do cliente, só na própria organização", () => {
    sql(`
      update public.calendar_appointments
         set client_reschedule_requested_at = null, client_confirmed_at = null
       where organization_id = '${ORG_B}' and id = '${COMPROMISSO_A}';
    `);
    expect(
      sql(`select (client_reschedule_requested_at is not null)::text from public.calendar_appointments where id = '${COMPROMISSO_A}';`),
    ).toBe("true");
    sql(`
      update public.calendar_appointments
         set client_reschedule_requested_at = null, client_confirmed_at = null
       where organization_id = '${ORG_A}' and id = '${COMPROMISSO_A}';
    `);
    expect(
      sql(`select (client_reschedule_requested_at is null and client_confirmed_at is null)::text from public.calendar_appointments where id = '${COMPROMISSO_A}';`),
    ).toBe("true");
  });
});
