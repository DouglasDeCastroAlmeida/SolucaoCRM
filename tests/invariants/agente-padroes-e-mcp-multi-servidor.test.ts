import { readFileSync } from "node:fs";
import { join } from "node:path";

import { beforeAll, describe, expect, it } from "vitest";

import { countAs, sql, tableExists, writeCountAs } from "./gov-helpers";

/**
 * AGENTE DE IA (mudança SDD 006, Fatia 3): PADRÕES SEGUROS, MCP COM VÁRIOS
 * SERVIDORES E ISOLAMENTO — o banco é aditivo, isolado e idempotente.
 *
 * Roda no Postgres que o `scripts/test-db.sh` sobe (baseline em install e update).
 * O que se prova:
 *
 * - AC-003.1: agente novo nasce `assisted`; agente existente (gravado antes) não muda.
 * - AC-009.2 / AC-004.1: orçamento: linha existente fica como está, linha nova nasce
 *   `bloquear` sem data (inerte) e o gatilho de publicação a arma; linha `off` não.
 * - AC-007.9: o servidor MCP atual é copiado como `padrao`, sem apagar o formato antigo,
 *   e re-aplicar não duplica.
 * - AC-008.4: as três tabelas novas não vazam entre duas organizações; a chave cifrada
 *   nunca é legível por `authenticated`.
 * - AC-009.2: funções novas sem EXECUTE para PUBLIC e anon; CHECKs ampliados sem perder valor.
 */

const BASELINE = join(process.cwd(), "supabase", "baseline.sql");
const ROTULO = "-- ---- agente: padrões seguros e MCP com vários servidores (migration 0724) ----";

const ORG_A = "d6a60006-0000-4000-8000-0000000000a1";
const ORG_B = "d6a60006-0000-4000-8000-0000000000a2";
const ORG_LEGADA = "d6a60006-0000-4000-8000-0000000000a3"; // já tinha servidor MCP e teto 'off'
const ORG_NOVA = "d6a60006-0000-4000-8000-0000000000a4"; // sem linha de orçamento
const USER_A = "d6a60006-1111-4000-8000-0000000000a1";
const USER_B = "d6a60006-1111-4000-8000-0000000000a2";
const SESS_A = "d6a60006-2222-4000-8000-0000000000a1";
const SESS_B = "d6a60006-2222-4000-8000-0000000000a2";
const SESS_NOVA = "d6a60006-2222-4000-8000-0000000000a4";
const SESS_LEGADA = "d6a60006-2222-4000-8000-0000000000a3";
const AGENTE_LEGADA_PUBLICA = "d6a60006-5555-4000-8000-0000000000a4";
const VERSAO_LEGADA = "d6a60006-6666-4000-8000-0000000000a4";
const CONTATO_A = "d6a60006-3333-4000-8000-0000000000a1";
const CONTATO_B = "d6a60006-3333-4000-8000-0000000000a2";
const CONVERSA_A = "d6a60006-4444-4000-8000-0000000000a1";
const CONVERSA_B = "d6a60006-4444-4000-8000-0000000000a2";
const AGENTE_LEGADO = "d6a60006-5555-4000-8000-0000000000a1";
const AGENTE_NOVO = "d6a60006-5555-4000-8000-0000000000a2";
const AGENTE_PUBLICA = "d6a60006-5555-4000-8000-0000000000a3";
const VERSAO_PUBLICA = "d6a60006-6666-4000-8000-0000000000a3";
const SERVIDOR_A = "d6a60006-7777-4000-8000-0000000000a1";
const SERVIDOR_B = "d6a60006-7777-4000-8000-0000000000a2";
const ACAO_A = "d6a60006-8888-4000-8000-0000000000a1";
const ACAO_B = "d6a60006-8888-4000-8000-0000000000a2";

/** O apêndice 0724 do baseline: do rótulo até o próximo bloco rotulado. */
function apendice(): string {
  const texto = readFileSync(BASELINE, "utf8");
  const inicio = texto.indexOf(ROTULO);
  if (inicio < 0) throw new Error("apêndice 0724 ausente no baseline.sql");
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

beforeAll(() => {
  // Garante os padrões novos mesmo que outro arquivo tenha reconstruído a coluna.
  sql(apendice());

  sql(`
    insert into auth.users (id, email) values
      ('${USER_A}', 'agente-006-a@invariant.test'),
      ('${USER_B}', 'agente-006-b@invariant.test')
    on conflict (id) do nothing;

    insert into public.organizations (id, slug, legal_name, display_name, settings) values
      ('${ORG_A}', 'agente-006-a', 'Org A', 'Org A', '{}'::jsonb),
      ('${ORG_B}', 'agente-006-b', 'Org B', 'Org B', '{}'::jsonb),
      ('${ORG_NOVA}', 'agente-006-nova', 'Org Nova', 'Org Nova', '{}'::jsonb),
      ('${ORG_LEGADA}', 'agente-006-legada', 'Org Legada', 'Org Legada',
         '{"mcp_externo":{"endpoint":"https://erp.exemplo.test/mcp"}}'::jsonb)
    on conflict (id) do nothing;

    update public.organizations
       set mcp_externo_chave_encrypted = '\\x0102'::bytea,
           mcp_externo_chave_iv = '\\x0304'::bytea,
           mcp_externo_chave_tag = '\\x0506'::bytea,
           mcp_externo_chave_last4 = 'wxyz'
     where id = '${ORG_LEGADA}';

    insert into public.user_organizations (user_id, organization_id, role, accepted_at) values
      ('${USER_A}', '${ORG_A}', 'viewer', now()),
      ('${USER_B}', '${ORG_B}', 'viewer', now())
    on conflict do nothing;

    insert into public.channel_sessions (id, organization_id, waha_session_name, status, webhook_secret_encrypted) values
      ('${SESS_A}', '${ORG_A}', 'agente-006-a', 'WORKING', '\\x00'::bytea),
      ('${SESS_B}', '${ORG_B}', 'agente-006-b', 'WORKING', '\\x00'::bytea),
      ('${SESS_NOVA}', '${ORG_NOVA}', 'agente-006-nova', 'WORKING', '\\x00'::bytea),
      ('${SESS_LEGADA}', '${ORG_LEGADA}', 'agente-006-legada', 'WORKING', '\\x00'::bytea)
    on conflict (id) do nothing;

    insert into public.contacts (id, organization_id, name) values
      ('${CONTATO_A}', '${ORG_A}', 'Contato A'),
      ('${CONTATO_B}', '${ORG_B}', 'Contato B')
    on conflict (id) do nothing;

    insert into public.conversations (id, organization_id, contact_id, channel_session_id, status, is_group) values
      ('${CONVERSA_A}', '${ORG_A}', '${CONTATO_A}', '${SESS_A}', 'open', false),
      ('${CONVERSA_B}', '${ORG_B}', '${CONTATO_B}', '${SESS_B}', 'open', false)
    on conflict (id) do nothing;
  `);

  // O que o `update.sh` faz num clone que já tinha servidor: re-aplica o baseline
  // com a organização (e a chave cifrada) já gravadas, e o apêndice a copia.
  sql(apendice());
});

describe("AC-003.1: o agente novo nasce no modo assistido; o existente não muda", () => {
  it("AC-003.1: o padrão da coluna é 'assisted'", () => {
    expect(
      sql(`
        select column_default from information_schema.columns
         where table_schema = 'public' and table_name = 'ai_agents' and column_name = 'operation_mode';
      `),
    ).toContain("assisted");
  });

  it("AC-003.1: agente gravado como automático continua automático depois de reaplicar o apêndice", () => {
    sql(`
      insert into public.ai_agents (id, organization_id, name, system_prompt, operation_mode)
      values ('${AGENTE_LEGADO}', '${ORG_A}', 'Legado', 'prompt', 'automatic')
      on conflict (id) do nothing;
    `);
    sql(apendice());
    expect(sql(`select operation_mode from public.ai_agents where id = '${AGENTE_LEGADO}';`)).toBe("automatic");
  });

  it("AC-003.1: agente inserido sem informar o modo nasce assistido", () => {
    sql(`
      insert into public.ai_agents (id, organization_id, name, system_prompt)
      values ('${AGENTE_NOVO}', '${ORG_A}', 'Novo', 'prompt')
      on conflict (id) do nothing;
    `);
    expect(sql(`select operation_mode from public.ai_agents where id = '${AGENTE_NOVO}';`)).toBe("assisted");
  });
});

describe("AC-009.2: o orçamento nasce armado só para linhas novas", () => {
  it("AC-009.2: linha 'off' existente continua 'off' depois de reaplicar o apêndice", () => {
    sql(`
      insert into public.ai_budgets (organization_id, enforcement_mode)
      values ('${ORG_LEGADA}', 'off') on conflict (organization_id) do update set enforcement_mode = 'off';
    `);
    sql(apendice());
    expect(sql(`select enforcement_mode from public.ai_budgets where organization_id = '${ORG_LEGADA}';`)).toBe("off");
  });

  it("AC-009.2: linha nova sem o modo informado nasce 'bloquear', ainda sem data de vigência", () => {
    sql(`
      insert into public.ai_budgets (organization_id) values ('${ORG_B}')
      on conflict (organization_id) do nothing;
    `);
    expect(
      sql(`select enforcement_mode || ',' || coalesce(enforcement_effective_at::text, 'nulo')
             from public.ai_budgets where organization_id = '${ORG_B}';`),
    ).toBe("bloquear,nulo");
  });

  it("AC-004.1: publicar o primeiro agente de uma organização sem linha cria o teto padrão armado", () => {
    sql(`
      insert into public.ai_agents (id, organization_id, name, system_prompt)
      values ('${AGENTE_PUBLICA}', '${ORG_NOVA}', 'Publica', 'prompt')
      on conflict (id) do nothing;
      insert into public.ai_agent_versions
        (id, organization_id, agent_id, version_number, system_prompt, provider, model, channel_session_id, status)
      values ('${VERSAO_PUBLICA}', '${ORG_NOVA}', '${AGENTE_PUBLICA}', 1, 'prompt', 'anthropic', 'modelo-de-teste', '${SESS_NOVA}', 'published')
      on conflict (id) do nothing;
    `);
    expect(sql(`select count(*) from public.ai_budgets where organization_id = '${ORG_NOVA}';`)).toBe("0");
    sql(`update public.ai_agents set published_version_id = '${VERSAO_PUBLICA}' where id = '${AGENTE_PUBLICA}';`);
    expect(
      sql(`select enforcement_mode || ',' || monthly_limit_cents::text || ',' || (enforcement_effective_at is not null)::text
             from public.ai_budgets where organization_id = '${ORG_NOVA}';`),
    ).toBe("bloquear,5000,true");
  });

  it("AC-004.1: publicar não arma a organização que já escolheu 'off'", () => {
    sql(`
      insert into public.ai_agents (id, organization_id, name, system_prompt)
      values ('${AGENTE_LEGADA_PUBLICA}', '${ORG_LEGADA}', 'Publica legada', 'prompt')
      on conflict (id) do nothing;
      insert into public.ai_agent_versions
        (id, organization_id, agent_id, version_number, system_prompt, provider, model, channel_session_id, status)
      values ('${VERSAO_LEGADA}', '${ORG_LEGADA}', '${AGENTE_LEGADA_PUBLICA}', 1, 'prompt', 'anthropic', 'modelo-de-teste', '${SESS_LEGADA}', 'published')
      on conflict (id) do nothing;
      update public.ai_agents set published_version_id = '${VERSAO_LEGADA}' where id = '${AGENTE_LEGADA_PUBLICA}';
    `);
    expect(
      sql(`select enforcement_mode || ',' || coalesce(enforcement_effective_at::text, 'nulo')
             from public.ai_budgets where organization_id = '${ORG_LEGADA}';`),
    ).toBe("off,nulo");
  });
});

describe("AC-007.9: o servidor MCP atual é migrado como 'padrao', sem apagar o formato antigo", () => {
  it("AC-007.9: a organização com servidor ganha a linha 'padrao' com a chave cifrada copiada", () => {
    expect(
      sql(`
        select slug || ',' || endpoint || ',' || chave_last4 || ',' || (chave_encrypted = '\\x0102'::bytea)::text
          from public.mcp_servidores_externos where organization_id = '${ORG_LEGADA}';
      `),
    ).toBe("padrao,https://erp.exemplo.test/mcp,wxyz,true");
  });

  it("AC-007.9: o formato antigo continua intacto", () => {
    expect(
      sql(`select settings->'mcp_externo'->>'endpoint' || ',' || mcp_externo_chave_last4
             from public.organizations where id = '${ORG_LEGADA}';`),
    ).toBe("https://erp.exemplo.test/mcp,wxyz");
  });

  it("AC-007.9: organização sem servidor não ganha linha", () => {
    expect(sql(`select count(*) from public.mcp_servidores_externos where organization_id = '${ORG_NOVA}';`)).toBe("0");
  });

  it("AC-007.9: reaplicar o apêndice não duplica nem altera o servidor migrado", () => {
    const antes = sql(`select count(*) from public.mcp_servidores_externos where organization_id = '${ORG_LEGADA}';`);
    sql(apendice());
    sql(apendice());
    expect(sql(`select count(*) from public.mcp_servidores_externos where organization_id = '${ORG_LEGADA}';`)).toBe(antes);
  });
});

describe("AC-008.4: as tabelas novas obedecem ao isolamento entre organizações", () => {
  beforeAll(() => {
    sql(`
      insert into public.mcp_servidores_externos (id, organization_id, slug, nome, endpoint, chave_encrypted, chave_last4) values
        ('${SERVIDOR_A}', '${ORG_A}', 'erp-a', 'ERP A', 'https://a.exemplo.test/mcp', '\\x0a'::bytea, 'aaaa'),
        ('${SERVIDOR_B}', '${ORG_B}', 'erp-b', 'ERP B', 'https://b.exemplo.test/mcp', '\\x0b'::bytea, 'bbbb')
      on conflict (id) do nothing;

      insert into public.mcp_acoes_pendentes (id, organization_id, conversa_id, servidor_id, ferramenta, argumentos_hash) values
        ('${ACAO_A}', '${ORG_A}', '${CONVERSA_A}', '${SERVIDOR_A}', 'criar_pedido', 'h-a'),
        ('${ACAO_B}', '${ORG_B}', '${CONVERSA_B}', '${SERVIDOR_B}', 'criar_pedido', 'h-b')
      on conflict (id) do nothing;

      insert into public.ai_falhas_de_ferramenta (conversation_id, organization_id, seguidas) values
        ('${CONVERSA_A}', '${ORG_A}', 1),
        ('${CONVERSA_B}', '${ORG_B}', 1)
      on conflict (conversation_id) do nothing;
    `);
  });

  it("AC-008.4: as tabelas existem com RLS ligada", () => {
    for (const t of ["mcp_servidores_externos", "mcp_acoes_pendentes", "ai_falhas_de_ferramenta"]) {
      expect(tableExists(t), t).toBe(true);
      expect(sql(`select relrowsecurity::text from pg_class where oid = 'public.${t}'::regclass;`), t).toBe("true");
    }
  });

  it("AC-008.4: controle positivo - cada membro lê o que é da própria organização", () => {
    expect(countAs(USER_A, `select count(*) from public.mcp_servidores_externos where id = '${SERVIDOR_A}';`)).toBe(1);
    expect(countAs(USER_A, `select count(*) from public.mcp_acoes_pendentes where id = '${ACAO_A}';`)).toBe(1);
    expect(countAs(USER_A, `select count(*) from public.ai_falhas_de_ferramenta where conversation_id = '${CONVERSA_A}';`)).toBe(1);
    expect(countAs(USER_B, `select count(*) from public.mcp_servidores_externos where id = '${SERVIDOR_B}';`)).toBe(1);
  });

  it("AC-008.4: não lê servidor, ação nem contador da outra organização", () => {
    expect(countAs(USER_A, `select count(*) from public.mcp_servidores_externos where id = '${SERVIDOR_B}';`)).toBe(0);
    expect(countAs(USER_A, `select count(*) from public.mcp_acoes_pendentes where id = '${ACAO_B}';`)).toBe(0);
    expect(countAs(USER_A, `select count(*) from public.ai_falhas_de_ferramenta where conversation_id = '${CONVERSA_B}';`)).toBe(0);
    expect(countAs(USER_B, `select count(*) from public.mcp_servidores_externos where id = '${SERVIDOR_A}';`)).toBe(0);
  });

  it("AC-008.4: nenhum papel de usuário escreve nas tabelas, nem na própria organização", () => {
    expect(escritaNegada(USER_A, `update public.mcp_servidores_externos set ativo = false where id = '${SERVIDOR_A}'`)).toBe(true);
    expect(escritaNegada(USER_A, `update public.mcp_servidores_externos set ativo = false where id = '${SERVIDOR_B}'`)).toBe(true);
    expect(escritaNegada(USER_A, `update public.mcp_acoes_pendentes set estado = 'aprovada' where id = '${ACAO_A}'`)).toBe(true);
    expect(escritaNegada(USER_A, `delete from public.ai_falhas_de_ferramenta where conversation_id = '${CONVERSA_A}'`)).toBe(true);
    expect(sql(`select ativo::text from public.mcp_servidores_externos where id = '${SERVIDOR_B}';`)).toBe("true");
  });

  it("AC-008.4: a chave cifrada do servidor não é legível por authenticated, e a parte sem segredo é", () => {
    expect(() =>
      countAs(USER_A, `select count(*) from public.mcp_servidores_externos where chave_encrypted is not null;`),
    ).toThrow();
    expect(
      countAs(USER_A, `select count(*) from public.mcp_servidores_externos where chave_last4 = 'aaaa';`),
    ).toBe(1);
  });

  it("AC-008.4: anon não lê nenhuma das três tabelas", () => {
    for (const t of ["mcp_servidores_externos", "mcp_acoes_pendentes", "ai_falhas_de_ferramenta"]) {
      expect(
        sql(`select has_table_privilege('anon', 'public.${t}', 'select')::text;`),
        t,
      ).toBe("false");
    }
  });

  it("AC-008.4: o servidor tem um slug único por organização", () => {
    expect(() =>
      sql(`
        insert into public.mcp_servidores_externos (organization_id, slug, nome, endpoint)
        values ('${ORG_A}', 'erp-a', 'Duplicado', 'https://x.exemplo.test/mcp');
      `),
    ).toThrow();
  });

  it("AC-008.4: a mesma ação pendente na mesma conversa não vira duas", () => {
    expect(() =>
      sql(`
        insert into public.mcp_acoes_pendentes (organization_id, conversa_id, servidor_id, ferramenta, argumentos_hash)
        values ('${ORG_A}', '${CONVERSA_A}', '${SERVIDOR_A}', 'criar_pedido', 'h-a');
      `),
    ).toThrow();
  });
});

describe("AC-009.2: funções sem EXECUTE para anon, CHECKs ampliados sem perder valor, apêndice idempotente", () => {
  it("AC-009.2: a função nova do apêndice não é executável por anon nem por PUBLIC", () => {
    const nomes = [...apendice().matchAll(/create\s+(?:or\s+replace\s+)?function\s+public\.(\w+)/gi)].map(
      (m) => m[1] as string,
    );
    expect(nomes).toContain("fn_arma_teto_ao_publicar_agente");
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

  it("AC-001.7: o CHECK de motivo da passagem aceita o motivo novo e mantém os antigos", () => {
    const def = sql(`
      select pg_get_constraintdef(oid) from pg_constraint
       where conname = 'passagens_de_atendimento_motivo_codigo_check';
    `);
    for (const motivo of [
      "provedor_indisponivel",
      "erro_de_ferramenta",
      "requested_human",
      "orcamento_de_ia",
      "caso_escalado",
      "verificacao_manual",
    ]) {
      expect(def, motivo).toContain(`'${motivo}'`);
    }
  });

  it("AC-001.7: o CHECK de kind da Central aceita os kinds novos e mantém os antigos", () => {
    for (const kind of [
      "ia_provedor_indisponivel",
      "acao_mcp_pendente",
      "agenda_cliente_pediu_remarcar",
      "task_overdue",
      "budget_warning",
      "other",
    ]) {
      expect(
        sql(`
          with ins as (
            insert into public.agent_inbox_items (organization_id, kind, ref_kind, ref_id, title)
            values ('${ORG_A}', '${kind}', 'conversation', gen_random_uuid(), 'caso-do-check-006')
            returning id
          )
          select count(*) from ins;
        `),
        kind,
      ).toBe("1");
      sql(`delete from public.agent_inbox_items where title = 'caso-do-check-006';`);
    }
  });

  it("AC-009.2: o apêndice aplica limpo (ON_ERROR_STOP=1) duas vezes sobre um banco com dados", () => {
    const antes = sql(`select count(*) from public.mcp_servidores_externos;`);
    sql(apendice());
    sql(apendice());
    expect(sql(`select count(*) from public.mcp_servidores_externos;`)).toBe(antes);
  });
});
