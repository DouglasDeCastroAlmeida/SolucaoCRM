import { readFileSync } from "node:fs";
import { join } from "node:path";

import { beforeAll, describe, expect, it } from "vitest";

import { columnExists, countAs, indexExists, sql, writeCountAs } from "./gov-helpers";

/**
 * AGENDA — CONFIRMAÇÃO PELO CLIENTE: O BANCO É ADITIVO, ISOLADO E IDEMPOTENTE.
 *
 * Mudança SDD 007, Fatia 1. Roda no Postgres que o `scripts/test-db.sh` sobe
 * (o baseline já foi aplicado em install e em update). O que se prova:
 *
 * - AC-001.2: tipo de agendamento que já existia não muda de lembrete nem de
 *   chave por causa da migration; a chave nova nasce desligada.
 * - AC-005.3: as colunas novas obedecem à RLS por organização.
 * - AC-006.1: apêndice do baseline é idempotente (aplica duas vezes sobre um
 *   banco com dados) e função nova, se houver, não é executável por anon.
 */

const MIGRATION = join(
  process.cwd(),
  "supabase",
  "migrations",
  "20261027100000_0719_agenda_confirmacao_do_cliente.sql",
);
const BASELINE = join(process.cwd(), "supabase", "baseline.sql");
const ROTULO = "-- ---- agenda: confirmação do cliente (migration 0719) ----";

const ORG_A = "b7a4d007-0000-4000-8000-0000000000d1";
const ORG_B = "b7a4d007-0000-4000-8000-0000000000d2";
const USER_A = "b7a4d007-1111-4000-8000-0000000000a1";
const USER_B = "b7a4d007-1111-4000-8000-0000000000a2";
const TIPO_A = "b7a4d007-2222-4000-8000-0000000000e1";
const TIPO_B = "b7a4d007-2222-4000-8000-0000000000e2";
const COMPROMISSO_A = "b7a4d007-3333-4000-8000-0000000000f1";
const COMPROMISSO_B = "b7a4d007-3333-4000-8000-0000000000f2";

/** O apêndice 0719 do baseline: do rótulo até o próximo bloco rotulado. */
function apendice(): string {
  const texto = readFileSync(BASELINE, "utf8");
  const inicio = texto.indexOf(ROTULO);
  if (inicio < 0) throw new Error("apêndice 0719 ausente no baseline.sql");
  const fim = texto.indexOf("\n-- ---- ", inicio + 10);
  return texto.slice(inicio, fim < 0 ? undefined : fim);
}

/** Foto das colunas de lembrete e de chave de TODOS os tipos de agendamento. */
function fotoDosTipos(): string {
  return sql(`
    select coalesce(md5(string_agg(
      id::text || '|' || reminder_enabled::text || '|' || reminder_minutes_before::text
        || '|' || coalesce(reminder_body, '') || '|' || reminder_bodies::text
        || '|' || reminder_extra_offsets_minutes::text || '|' || requires_confirmation::text
        || '|' || is_active::text,
      ',' order by id)), 'vazio') from public.calendar_event_types;
  `);
}

beforeAll(() => {
  // Insere do jeito que a imagem ANTERIOR inseria: sem conhecer nenhuma coluna nova.
  sql(`
    insert into auth.users (id, email) values
      ('${USER_A}', 'agenda-conf-a@invariant.test'),
      ('${USER_B}', 'agenda-conf-b@invariant.test')
    on conflict (id) do nothing;

    insert into public.organizations (id, slug, legal_name, display_name) values
      ('${ORG_A}', 'agenda-conf-a', 'Org A', 'Org A'),
      ('${ORG_B}', 'agenda-conf-b', 'Org B', 'Org B')
    on conflict (id) do nothing;

    insert into public.user_organizations (user_id, organization_id, role, accepted_at) values
      ('${USER_A}', '${ORG_A}', 'admin', now()),
      ('${USER_B}', '${ORG_B}', 'admin', now())
    on conflict do nothing;

    insert into public.calendar_event_types (id, organization_id, name, slug, reminder_enabled, reminder_minutes_before) values
      ('${TIPO_A}', '${ORG_A}', 'Consulta A', 'agenda-conf-a', true, 90),
      ('${TIPO_B}', '${ORG_B}', 'Consulta B', 'agenda-conf-b', false, 60)
    on conflict (id) do nothing;

    insert into public.calendar_appointments (id, organization_id, event_type_id, title, starts_at, ends_at) values
      ('${COMPROMISSO_A}', '${ORG_A}', '${TIPO_A}', 'Compromisso A', now() + interval '2 days', now() + interval '2 days 1 hour'),
      ('${COMPROMISSO_B}', '${ORG_B}', '${TIPO_B}', 'Compromisso B', now() + interval '2 days', now() + interval '2 days 1 hour')
    on conflict (id) do nothing;
  `);
});

describe("AC-001.2: tipos existentes não mudam por causa da migration", () => {
  it("AC-001.2: as colunas novas existem e a chave nova nasce desligada nos tipos existentes", () => {
    expect(columnExists("calendar_event_types", "client_confirmation_enabled")).toBe(true);
    expect(columnExists("calendar_appointments", "client_confirmed_at")).toBe(true);
    expect(columnExists("calendar_appointments", "client_reschedule_requested_at")).toBe(true);
    expect(
      sql(`select count(*) from public.calendar_event_types where client_confirmation_enabled;`),
    ).toBe("0");
    expect(
      sql(`
        select is_nullable || ',' || column_default from information_schema.columns
         where table_schema = 'public' and table_name = 'calendar_event_types'
           and column_name = 'client_confirmation_enabled';
      `),
    ).toBe("NO,false");
  });

  it("AC-001.2: compromissos existentes têm confirmação e pedido de remarcar nulos", () => {
    expect(
      sql(`
        select count(*) from public.calendar_appointments
         where client_confirmed_at is not null or client_reschedule_requested_at is not null;
      `),
    ).toBe("0");
  });

  it("AC-001.2: reaplicar o apêndice não altera lembrete nem chave de nenhum tipo", () => {
    const antes = fotoDosTipos();
    sql(apendice());
    expect(fotoDosTipos()).toBe(antes);
    expect(
      sql(`
        select reminder_enabled::text || ',' || reminder_minutes_before::text
          from public.calendar_event_types where id = '${TIPO_A}';
      `),
    ).toBe("true,90");
  });
});

describe("AC-001.2: o CHECK dos avisos da Central foi reconstruído sem perder valor", () => {
  // A lista do CHECK foi reconstruída à mão: este caso pega um valor antigo perdido
  // e prova que o kind novo é aceito. Cada insert é desfeito no mesmo script.
  it("AC-001.2: o kind novo e kinds antigos continuam aceitos", () => {
    const kinds = ["agenda_cliente_pediu_remarcar", "task_overdue", "budget_warning", "other"];
    for (const kind of kinds) {
      expect(
        sql(`
          with ins as (
            insert into public.agent_inbox_items (organization_id, kind, ref_kind, ref_id, title)
            values ('${ORG_A}', '${kind}', 'appointment', gen_random_uuid(), 'caso-do-check')
            returning id
          ), del as (
            delete from public.agent_inbox_items where id in (select id from ins) returning 1
          )
          select count(*) from del;
        `),
      ).toBe("1");
    }
  });

  it("AC-001.2: o índice parcial dos compromissos pendentes de confirmação existe", () => {
    expect(indexExists("calendar_appointments_client_pending_idx")).toBe(true);
  });
});

describe("AC-005.3: as colunas novas obedecem ao isolamento entre organizações", () => {
  it("AC-005.3: controle positivo - cada admin lê o compromisso e o tipo da própria organização", () => {
    expect(
      countAs(USER_A, `select count(*) from public.calendar_appointments where id = '${COMPROMISSO_A}';`),
    ).toBe(1);
    expect(
      countAs(USER_B, `select count(*) from public.calendar_event_types where id = '${TIPO_B}';`),
    ).toBe(1);
  });

  it("AC-005.3: não lê compromisso nem tipo da outra organização", () => {
    expect(
      countAs(USER_A, `select count(*) from public.calendar_appointments where id = '${COMPROMISSO_B}';`),
    ).toBe(0);
    expect(
      countAs(USER_B, `select count(*) from public.calendar_event_types where id = '${TIPO_A}';`),
    ).toBe(0);
  });

  it("AC-005.3: não grava a confirmação nem a chave na organização vizinha", () => {
    expect(
      writeCountAs(
        USER_A,
        `update public.calendar_appointments set client_confirmed_at = now() where id = '${COMPROMISSO_B}'`,
      ),
    ).toBe(0);
    expect(
      writeCountAs(
        USER_A,
        `update public.calendar_event_types set client_confirmation_enabled = true where id = '${TIPO_B}'`,
      ),
    ).toBe(0);
    expect(
      sql(`select client_confirmed_at is null from public.calendar_appointments where id = '${COMPROMISSO_B}';`),
    ).toBe("t");
  });
});

describe("AC-006.1: apêndice idempotente e funções sem EXECUTE para anon", () => {
  it("AC-006.1: o apêndice aplica limpo (ON_ERROR_STOP=1) duas vezes sobre um banco com dados", () => {
    const antes = sql(`select count(*) from public.calendar_appointments;`);
    sql(apendice());
    sql(apendice());
    expect(sql(`select count(*) from public.calendar_appointments;`)).toBe(antes);
  });

  it("AC-006.1: o apêndice é a cópia literal do corpo da migration", () => {
    const migration = readFileSync(MIGRATION, "utf8");
    // O CHECK de kinds vive no bloco único do dump (uma constraint, um bloco): o apêndice
    // leva só a parte de colunas e índice, que é a que termina no marcador da migration.
    const corpo = migration.slice(
      migration.indexOf("alter table public.calendar_appointments"),
      migration.indexOf("-- == kinds"),
    );
    const normaliza = (s: string) => s.replace(/\s+/g, " ").trim();
    expect(normaliza(apendice())).toContain(normaliza(corpo));
  });

  it("AC-006.1: toda função criada pela migration não é executável por anon nem por PUBLIC", () => {
    const migration = readFileSync(MIGRATION, "utf8");
    const nomes = [...migration.matchAll(/create\s+(?:or\s+replace\s+)?function\s+public\.(\w+)/gi)].map(
      (m) => m[1] as string,
    );
    for (const nome of nomes) {
      const out = sql(`
        select bool_or(has_function_privilege('anon', p.oid, 'execute'))::text
            || ',' || bool_or(has_function_privilege('public', p.oid, 'execute'))::text
          from pg_proc p join pg_namespace n on n.oid = p.pronamespace
         where n.nspname = 'public' and p.proname = '${nome}';
      `);
      expect(out, `fn ${nome} exposta`).toBe("false,false");
    }
  });
});
