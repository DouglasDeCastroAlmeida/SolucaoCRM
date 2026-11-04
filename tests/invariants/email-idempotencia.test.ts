import { readFileSync } from "node:fs";
import { join } from "node:path";

import { beforeAll, describe, expect, it } from "vitest";

import { sql } from "./gov-helpers";

/**
 * CANAL DE E-MAIL (mudança SDD 005, Fatia 4): a leitura é idempotente no banco real.
 *
 * Roda no Postgres que o `scripts/test-db.sh` sobe (baseline em install e update). O que o
 * TypeScript promete e só o banco pode garantir:
 *
 * - AC-002.5: o mesmo `Message-ID` na mesma organização é UMA mensagem (`unique
 *   (organization_id, external_id)`), e a segunda tentativa volta como violação de unicidade
 *   (o `23505` que o ingestor lê como "duplicado"); em outra organização o mesmo id é outra coisa.
 * - AC-002.3: o mesmo endereço de e-mail é um só contato por organização (a corrida entre duas
 *   rodadas termina em 23505, nunca em dois cadastros), e `fn_upsert_email_conversation` devolve
 *   sempre a MESMA conversa para o par (contato, caixa).
 * - AC-002.6: o cursor por UID só avança por UPDATE da linha única da caixa; reposicionar depois de
 *   UIDVALIDITY diferente não apaga nada que já foi ingerido.
 * - AC-006.2: a trava por caixa (`travado_ate`) é um compare-and-swap: de duas rodadas
 *   simultâneas só uma a pega.
 */

const BASELINE = join(process.cwd(), "supabase", "baseline.sql");
const ROTULO = "-- ---- canal de e-mail (migration 0727) ----";

const ORG_A = "e5a50006-0000-4000-8000-0000000000a1";
const ORG_B = "e5a50006-0000-4000-8000-0000000000a2";
const SESS_A = "e5a50006-2222-4000-8000-0000000000a1";
const SESS_B = "e5a50006-2222-4000-8000-0000000000a2";
const CONTATO_A = "e5a50006-3333-4000-8000-0000000000a1";
const CONTATO_B = "e5a50006-3333-4000-8000-0000000000a2";

function apendice(): string {
  const texto = readFileSync(BASELINE, "utf8");
  const inicio = texto.indexOf(ROTULO);
  if (inicio < 0) throw new Error("apêndice 0727 ausente no baseline.sql");
  const fim = texto.indexOf("\n-- ---- ", inicio + 10);
  return texto.slice(inicio, fim < 0 ? undefined : fim);
}

function conversa(org: string, contato: string, sessao: string): string {
  return sql(`select public.fn_upsert_email_conversation('${org}', '${contato}', '${sessao}');`)
    .split("\n")
    .at(-1)!
    .trim();
}

function mensagem(org: string, conversaId: string, contato: string, sessao: string, externalId: string): void {
  sql(`
    insert into public.messages (organization_id, conversation_id, contact_id, channel_session_id, external_id, direction, sent_via, status, type, body)
    values ('${org}', '${conversaId}', '${contato}', '${sessao}', '${externalId}', 'inbound', 'external_device', 'delivered', 'text', 'oi');
  `);
}

beforeAll(() => {
  sql(apendice());
  sql(`
    insert into public.organizations (id, slug, legal_name, display_name, settings) values
      ('${ORG_A}', 'email-006-a', 'Org A', 'Org A', '{}'::jsonb),
      ('${ORG_B}', 'email-006-b', 'Org B', 'Org B', '{}'::jsonb)
    on conflict (id) do nothing;

    insert into public.contacts (id, organization_id, name, email) values
      ('${CONTATO_A}', '${ORG_A}', 'Contato A', 'cliente@exemplo.test'),
      ('${CONTATO_B}', '${ORG_B}', 'Contato B', 'cliente@exemplo.test')
    on conflict (id) do nothing;

    insert into public.channel_sessions (id, organization_id, provider, email_address, status, webhook_secret_encrypted) values
      ('${SESS_A}', '${ORG_A}', 'email', 'caixa-006-a@exemplo.test', 'WORKING', '\\x00'::bytea),
      ('${SESS_B}', '${ORG_B}', 'email', 'caixa-006-b@exemplo.test', 'WORKING', '\\x00'::bytea)
    on conflict (id) do nothing;

    insert into public.email_sync_estado (channel_session_id, organization_id, uidvalidity, ultimo_uid) values
      ('${SESS_A}', '${ORG_A}', 10, 5), ('${SESS_B}', '${ORG_B}', 10, 5)
    on conflict (channel_session_id) do nothing;
  `);
});

describe("AC-002.5: o mesmo e-mail visto duas vezes é uma só mensagem", () => {
  it("AC-002.5: o Message-ID repetido na mesma organização é recusado por unicidade", () => {
    const c = conversa(ORG_A, CONTATO_A, SESS_A);
    mensagem(ORG_A, c, CONTATO_A, SESS_A, "<repetido@exemplo.test>");
    expect(() => mensagem(ORG_A, c, CONTATO_A, SESS_A, "<repetido@exemplo.test>")).toThrow(/duplicate key|23505/);
    expect(
      sql(`select count(*) from public.messages where organization_id = '${ORG_A}' and external_id = '<repetido@exemplo.test>';`),
    ).toBe("1");
  });

  it("AC-002.5: o mesmo Message-ID em OUTRA organização é outra mensagem, não duplicata", () => {
    const c = conversa(ORG_B, CONTATO_B, SESS_B);
    mensagem(ORG_B, c, CONTATO_B, SESS_B, "<repetido@exemplo.test>");
    expect(
      sql(`select count(*) from public.messages where external_id = '<repetido@exemplo.test>';`),
    ).toBe("2");
  });
});

describe("AC-002.3: um contato e uma conversa por endereço e caixa", () => {
  it("AC-002.3: o mesmo e-mail, com outra grafia, não cria um segundo contato na organização", () => {
    expect(() =>
      sql(`insert into public.contacts (organization_id, name, email) values ('${ORG_A}', 'Duplicado', ' Cliente@Exemplo.TEST ');`),
    ).toThrow(/uniq_contacts_org_email|duplicate key/);
  });

  it("AC-002.4: fn_upsert_email_conversation devolve sempre a mesma conversa para o par contato e caixa", () => {
    const a = conversa(ORG_A, CONTATO_A, SESS_A);
    const b = conversa(ORG_A, CONTATO_A, SESS_A);
    expect(a).toBe(b);
    expect(
      sql(`select count(*) from public.conversations where organization_id = '${ORG_A}' and contact_id = '${CONTATO_A}' and channel_session_id = '${SESS_A}';`),
    ).toBe("1");
    expect(sql(`select channel from public.conversations where id = '${a}';`)).toBe("email");
  });
});

describe("AC-002.6 e AC-006.2: cursor por UID e trava por caixa", () => {
  it("AC-002.6: o cursor avança na linha única da caixa e reposicionar não apaga mensagem já ingerida", () => {
    const antes = sql(`select count(*) from public.messages where organization_id = '${ORG_A}';`);
    sql(`update public.email_sync_estado set ultimo_uid = 9 where channel_session_id = '${SESS_A}' and organization_id = '${ORG_A}';`);
    expect(sql(`select ultimo_uid from public.email_sync_estado where channel_session_id = '${SESS_A}';`)).toBe("9");
    // UIDVALIDITY diferente: recomeça do fim da caixa.
    sql(`update public.email_sync_estado set uidvalidity = 99, ultimo_uid = 3 where channel_session_id = '${SESS_A}' and organization_id = '${ORG_A}';`);
    expect(sql(`select count(*) from public.messages where organization_id = '${ORG_A}';`)).toBe(antes);
    expect(() =>
      sql(`insert into public.email_sync_estado (channel_session_id, organization_id) values ('${SESS_A}', '${ORG_A}');`),
    ).toThrow(/duplicate key|23505/);
  });

  it("AC-006.2: de duas rodadas simultâneas só uma pega a trava; a vencida é retomada", () => {
    sql(`update public.email_sync_estado set travado_ate = null where channel_session_id = '${SESS_A}';`);
    const pegar = `
      with t as (
        update public.email_sync_estado set travado_ate = now() + interval '75 seconds'
         where organization_id = '${ORG_A}' and channel_session_id = '${SESS_A}' and travado_ate is null
        returning 1)
      select count(*) from t;`;
    expect(sql(pegar)).toBe("1");
    expect(sql(pegar)).toBe("0");
    sql(`update public.email_sync_estado set travado_ate = now() - interval '1 second' where channel_session_id = '${SESS_A}';`);
    expect(
      sql(`
        with t as (
          update public.email_sync_estado set travado_ate = now() + interval '75 seconds'
           where organization_id = '${ORG_A}' and channel_session_id = '${SESS_A}' and travado_ate < now()
          returning 1)
        select count(*) from t;`),
    ).toBe("1");
  });
});
