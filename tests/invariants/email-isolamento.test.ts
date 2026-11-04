import { readFileSync } from "node:fs";
import { join } from "node:path";

import { beforeAll, describe, expect, it } from "vitest";

import { columnExists, countAs, sql, tableExists, writeCountAs } from "./gov-helpers";

/**
 * CANAL DE E-MAIL (mudança SDD 005, Fatia 2): o banco é aditivo, isolado e idempotente.
 *
 * Roda no Postgres que o `scripts/test-db.sh` sobe (baseline em install e update).
 *
 * - AC-007.4: as tabelas novas não vazam entre duas organizações; a escrita é só do servidor.
 * - AC-009.2: os CHECKs aceitam provider e canal `email` (e os kinds novos da Central) sem
 *   perder valor; a caixa é única por (organização, endereço); funções novas sem EXECUTE para
 *   PUBLIC e anon; a senha cifrada não tem coluna legível ao cliente; reaplicar não duplica.
 */

const BASELINE = join(process.cwd(), "supabase", "baseline.sql");
const ROTULO = "-- ---- canal de e-mail (migration 0727) ----";

const ORG_A = "e5a50005-0000-4000-8000-0000000000a1";
const ORG_B = "e5a50005-0000-4000-8000-0000000000a2";
const USER_A = "e5a50005-1111-4000-8000-0000000000a1";
const USER_B = "e5a50005-1111-4000-8000-0000000000a2";
const SESS_A = "e5a50005-2222-4000-8000-0000000000a1";
const SESS_B = "e5a50005-2222-4000-8000-0000000000a2";
const CONTATO_A = "e5a50005-3333-4000-8000-0000000000a1";
const CONTATO_B = "e5a50005-3333-4000-8000-0000000000a2";
const IGN_A = "e5a50005-4444-4000-8000-0000000000a1";
const IGN_B = "e5a50005-4444-4000-8000-0000000000a2";

const TABELAS_NOVAS = [
  "email_sync_estado",
  "email_ignorados",
  "email_remetentes_ignorados",
  "email_envios_dia",
  "email_credenciais",
];

/** O apêndice 0727 do baseline: do rótulo até o próximo bloco rotulado. */
function apendice(): string {
  const texto = readFileSync(BASELINE, "utf8");
  const inicio = texto.indexOf(ROTULO);
  if (inicio < 0) throw new Error("apêndice 0727 ausente no baseline.sql");
  const fim = texto.indexOf("\n-- ---- ", inicio + 10);
  return texto.slice(inicio, fim < 0 ? undefined : fim);
}

/** Tenta uma escrita direta como `authenticated`; true quando o banco a recusou. */
function escritaNegada(userId: string, dml: string): boolean {
  try {
    return writeCountAs(userId, dml) === 0;
  } catch (err) {
    const stderr = (err as { stderr?: string }).stderr ?? "";
    return stderr.includes("permission denied");
  }
}

function inserirCaixa(id: string, org: string, endereco: string | null): void {
  sql(`
    insert into public.channel_sessions (id, organization_id, provider, email_address, status, webhook_secret_encrypted)
    values ('${id}', '${org}', 'email', ${endereco === null ? "null" : `'${endereco}'`}, 'WORKING', '\\x00'::bytea);
  `);
}

beforeAll(() => {
  sql(apendice());

  sql(`
    insert into auth.users (id, email) values
      ('${USER_A}', 'email-005-a@invariant.test'),
      ('${USER_B}', 'email-005-b@invariant.test')
    on conflict (id) do nothing;

    insert into public.organizations (id, slug, legal_name, display_name, settings) values
      ('${ORG_A}', 'email-005-a', 'Org A', 'Org A', '{}'::jsonb),
      ('${ORG_B}', 'email-005-b', 'Org B', 'Org B', '{}'::jsonb)
    on conflict (id) do nothing;

    insert into public.user_organizations (user_id, organization_id, role, accepted_at) values
      ('${USER_A}', '${ORG_A}', 'admin', now()),
      ('${USER_B}', '${ORG_B}', 'admin', now())
    on conflict do nothing;

    insert into public.contacts (id, organization_id, name) values
      ('${CONTATO_A}', '${ORG_A}', 'Contato A'),
      ('${CONTATO_B}', '${ORG_B}', 'Contato B')
    on conflict (id) do nothing;
  `);

  inserirCaixa(SESS_A, ORG_A, "caixa-a@exemplo.test");
  inserirCaixa(SESS_B, ORG_B, "caixa-b@exemplo.test");

  sql(`
    insert into public.email_sync_estado (channel_session_id, organization_id) values
      ('${SESS_A}', '${ORG_A}'), ('${SESS_B}', '${ORG_B}');

    insert into public.email_ignorados (id, organization_id, channel_session_id, message_id, uid, remetente, assunto, recebido_em, motivo) values
      ('${IGN_A}', '${ORG_A}', '${SESS_A}', '<a@x>', 1, 'lista@x.test', 'Oferta', now(), 'lista_de_inscricao'),
      ('${IGN_B}', '${ORG_B}', '${SESS_B}', '<b@x>', 1, 'lista@x.test', 'Oferta', now(), 'lista_de_inscricao');

    insert into public.email_remetentes_ignorados (organization_id, endereco_normalizado) values
      ('${ORG_A}', 'spam-a@x.test'), ('${ORG_B}', 'spam-b@x.test');

    insert into public.email_envios_dia (channel_session_id, organization_id, dia, quantidade) values
      ('${SESS_A}', '${ORG_A}', current_date, 3), ('${SESS_B}', '${ORG_B}', current_date, 5);

    insert into public.email_credenciais (channel_session_id, organization_id, senha_encrypted) values
      ('${SESS_A}', '${ORG_A}', '\\x0a'::bytea), ('${SESS_B}', '${ORG_B}', '\\x0b'::bytea);
  `);
});

describe("AC-009.2: os CHECKs aceitam o e-mail e a caixa é única por endereço", () => {
  it("AC-009.2: o provider 'email' é aceito e exige o endereço da caixa", () => {
    expect(sql(`select provider from public.channel_sessions where id = '${SESS_A}';`)).toBe("email");
    expect(() => inserirCaixa("e5a50005-2222-4000-8000-0000000000f1", ORG_A, null)).toThrow();
  });

  it("AC-009.2: o canal 'email' é aceito em conversations e canal desconhecido continua recusado", () => {
    const def = sql(`select pg_get_constraintdef(oid) from pg_constraint where conname = 'conversations_channel_check';`);
    for (const canal of ["whatsapp", "instagram", "facebook", "email"]) {
      expect(def, canal).toContain(`'${canal}'`);
    }
    expect(() =>
      sql(`
        insert into public.conversations (organization_id, contact_id, channel_session_id, channel, status, is_group)
        values ('${ORG_A}', '${CONTATO_A}', '${SESS_A}', 'telegram', 'open', false);
      `),
    ).toThrow(/conversations_channel_check/);
  });

  it("AC-009.2: o CHECK de provider mantém os valores anteriores", () => {
    const def = sql(`select pg_get_constraintdef(oid) from pg_constraint where conname = 'channel_sessions_provider_check';`);
    for (const p of ["waha", "meta_cloud", "zernio", "wacalls", "zernio_social", "datafy", "email"]) {
      expect(def, p).toContain(`'${p}'`);
    }
  });

  it("AC-009.2: o CHECK de kind da Central aceita os kinds novos e mantém os antigos", () => {
    for (const kind of ["email_senha_recusada", "email_teto_atingido", "ia_provedor_indisponivel", "task_overdue", "other"]) {
      expect(
        sql(`
          with ins as (
            insert into public.agent_inbox_items (organization_id, kind, ref_kind, ref_id, title)
            values ('${ORG_A}', '${kind}', 'channel_session', gen_random_uuid(), 'caso-do-check-005')
            returning id
          )
          select count(*) from ins;
        `),
        kind,
      ).toBe("1");
    }
  });

  it("AC-009.2: duas caixas ativas da mesma organização não podem ter o mesmo endereço (sem distinguir caixa alta)", () => {
    expect(() => inserirCaixa("e5a50005-2222-4000-8000-0000000000f2", ORG_A, "CAIXA-A@exemplo.test")).toThrow();
  });

  it("AC-009.2: o mesmo endereço em outra organização é permitido, e o de uma caixa arquivada é liberado", () => {
    inserirCaixa("e5a50005-2222-4000-8000-0000000000f3", ORG_B, "caixa-a@exemplo.test");
    sql(`update public.channel_sessions set archived_at = now() where id = 'e5a50005-2222-4000-8000-0000000000f3';`);
    sql(`update public.channel_sessions set archived_at = now() where id = '${SESS_A}';`);
    inserirCaixa("e5a50005-2222-4000-8000-0000000000f4", ORG_A, "caixa-a@exemplo.test");
    expect(
      sql(`select count(*) from public.channel_sessions where organization_id = '${ORG_A}' and email_address = 'caixa-a@exemplo.test';`),
    ).toBe("2");
    // devolve o estado: a caixa A volta a ser a ativa, e a duplicata nova some
    sql(`delete from public.channel_sessions where id = 'e5a50005-2222-4000-8000-0000000000f4';`);
    sql(`update public.channel_sessions set archived_at = null where id = '${SESS_A}';`);
  });

  it("AC-009.2: o mesmo e-mail visto duas vezes na mesma caixa não vira duas linhas de ignorado", () => {
    expect(() =>
      sql(`
        insert into public.email_ignorados (organization_id, channel_session_id, message_id, uid, remetente, assunto, recebido_em, motivo)
        values ('${ORG_A}', '${SESS_A}', '<a@x>', 2, 'lista@x.test', 'Oferta', now(), 'lista_de_inscricao');
      `),
    ).toThrow();
  });

  it("AC-009.2: o contador do dia é único por caixa e dia", () => {
    expect(() =>
      sql(`insert into public.email_envios_dia (channel_session_id, organization_id, dia, quantidade)
           values ('${SESS_A}', '${ORG_A}', current_date, 1);`),
    ).toThrow();
  });
});

describe("AC-007.4: as tabelas novas obedecem ao isolamento entre organizações", () => {
  it("AC-007.4: as tabelas existem com RLS ligada", () => {
    for (const t of TABELAS_NOVAS) {
      expect(tableExists(t), t).toBe(true);
      expect(sql(`select relrowsecurity::text from pg_class where oid = 'public.${t}'::regclass;`), t).toBe("true");
    }
  });

  it("AC-007.4: controle positivo - o admin lê o que é da própria organização", () => {
    expect(countAs(USER_A, `select count(*) from public.email_sync_estado where channel_session_id = '${SESS_A}';`)).toBe(1);
    expect(countAs(USER_A, `select count(*) from public.email_ignorados where id = '${IGN_A}';`)).toBe(1);
    expect(countAs(USER_A, `select count(*) from public.email_remetentes_ignorados where endereco_normalizado = 'spam-a@x.test';`)).toBe(1);
    expect(countAs(USER_B, `select count(*) from public.email_ignorados where id = '${IGN_B}';`)).toBe(1);
  });

  it("AC-007.4: não lê estado, ignorados nem remetentes da outra organização", () => {
    expect(countAs(USER_A, `select count(*) from public.email_sync_estado where channel_session_id = '${SESS_B}';`)).toBe(0);
    expect(countAs(USER_A, `select count(*) from public.email_ignorados where id = '${IGN_B}';`)).toBe(0);
    expect(countAs(USER_A, `select count(*) from public.email_remetentes_ignorados where endereco_normalizado = 'spam-b@x.test';`)).toBe(0);
    expect(countAs(USER_B, `select count(*) from public.email_ignorados where id = '${IGN_A}';`)).toBe(0);
  });

  it("AC-007.4: nenhum papel de usuário escreve nas tabelas, nem na própria organização", () => {
    expect(escritaNegada(USER_A, `update public.email_sync_estado set falhas_seguidas = 9 where channel_session_id = '${SESS_A}'`)).toBe(true);
    expect(escritaNegada(USER_A, `update public.email_sync_estado set falhas_seguidas = 9 where channel_session_id = '${SESS_B}'`)).toBe(true);
    expect(escritaNegada(USER_A, `delete from public.email_ignorados where id = '${IGN_A}'`)).toBe(true);
    expect(escritaNegada(USER_A, `delete from public.email_remetentes_ignorados where organization_id = '${ORG_A}'`)).toBe(true);
    expect(sql(`select falhas_seguidas::text from public.email_sync_estado where channel_session_id = '${SESS_B}';`)).toBe("0");
  });

  it("AC-007.4: contador de envios e credenciais não são legíveis por authenticated, nem na própria organização", () => {
    expect(() => countAs(USER_A, `select count(*) from public.email_envios_dia;`)).toThrow();
    expect(() => countAs(USER_A, `select count(*) from public.email_credenciais;`)).toThrow();
    expect(() => countAs(USER_B, `select count(*) from public.email_credenciais;`)).toThrow();
  });

  it("AC-007.4: anon não lê nenhuma das tabelas novas", () => {
    for (const t of TABELAS_NOVAS) {
      expect(sql(`select has_table_privilege('anon', 'public.${t}', 'select')::text;`), t).toBe("false");
    }
  });
});

describe("AC-009.2: a senha da caixa não tem coluna legível ao cliente", () => {
  it("AC-009.2: channel_sessions não ganha coluna de senha; ela vive só na tabela de credenciais", () => {
    expect(columnExists("channel_sessions", "email_password_encrypted")).toBe(false);
    expect(
      sql(`select count(*) from information_schema.columns
            where table_schema = 'public' and table_name = 'channel_sessions'
              and (column_name ilike '%senha%' or column_name ilike '%password%');`),
    ).toBe("0");
  });

  it("AC-009.2: nenhum papel de cliente tem privilégio de leitura sobre a coluna da senha", () => {
    for (const papel of ["anon", "authenticated"]) {
      expect(
        sql(`select has_column_privilege('${papel}', 'public.email_credenciais', 'senha_encrypted', 'select')::text;`),
        papel,
      ).toBe("false");
    }
    expect(
      sql(`select has_column_privilege('service_role', 'public.email_credenciais', 'senha_encrypted', 'select')::text;`),
    ).toBe("true");
  });
});

describe("AC-009.2: funções sem EXECUTE para PUBLIC e anon, e apêndice idempotente", () => {
  it("AC-009.2: toda função do apêndice é fechada para anon, PUBLIC e authenticated", () => {
    const nomes = [...apendice().matchAll(/create\s+(?:or\s+replace\s+)?function\s+public\.(\w+)/gi)].map(
      (m) => m[1] as string,
    );
    expect(nomes).toContain("fn_upsert_email_conversation");
    for (const nome of nomes) {
      const out = sql(`
        select bool_or(has_function_privilege('anon', p.oid, 'execute'))::text
            || ',' || bool_or(has_function_privilege('public', p.oid, 'execute'))::text
            || ',' || bool_or(has_function_privilege('authenticated', p.oid, 'execute'))::text
          from pg_proc p join pg_namespace n on n.oid = p.pronamespace
         where n.nspname = 'public' and p.proname = '${nome}';
      `);
      expect(out, `fn ${nome} exposta`).toBe("false,false,false");
    }
  });

  it("AC-009.2: fn_upsert_email_conversation grava canal 'email' e devolve a mesma conversa na segunda chamada", () => {
    const chamada = `select public.fn_upsert_email_conversation('${ORG_A}', '${CONTATO_A}', '${SESS_A}');`;
    const primeira = sql(chamada);
    const segunda = sql(chamada);
    expect(primeira).toMatch(/^[0-9a-f-]{36}$/);
    expect(segunda).toBe(primeira);
    expect(sql(`select channel from public.conversations where id = '${primeira}';`)).toBe("email");
  });

  it("AC-009.2: reaplicar o apêndice não duplica nem apaga dados", () => {
    const antes = sql(`select count(*) from public.email_ignorados;`);
    sql(apendice());
    sql(apendice());
    expect(sql(`select count(*) from public.email_ignorados;`)).toBe(antes);
    expect(sql(`select count(*) from public.channel_sessions where id = '${SESS_A}';`)).toBe("1");
  });
});
