/**
 * O AVISO DE 80% POR E-MAIL SAI UMA VEZ POR MÊS, E O MÊS NOVO ZERA O CONTADOR
 * (mudança 006, AC-004.2 e AC-004.5) — provado contra um Postgres de verdade.
 *
 * O texto do statement vem do ARTEFATO (`SQL_REIVINDICAR_AVISO_POR_EMAIL` e
 * `SQL_ORCAMENTO`), nunca redigitado aqui: reimplementá-lo mediria a minha cópia.
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { SQL_ORCAMENTO } from "@/lib/agent-engine/edge/llm/orcamento";
import {
  EVENTO_AVISO_DE_ORCAMENTO,
  SQL_REIVINDICAR_AVISO_POR_EMAIL,
} from "@/lib/ai/orcamento/aviso-por-email";

import { sql } from "./psql-transporte";

const ORG = "f6000000-0000-4000-8000-0000000000f6";

function reivindicar(): void {
  const texto = SQL_REIVINDICAR_AVISO_POR_EMAIL.replace(/\$1/g, `'${ORG}'::uuid`)
    .replace(/\$2/g, `'${EVENTO_AVISO_DE_ORCAMENTO}'`)
    .replace(/\$3/g, `'{"gasto_cents":4100,"teto_cents":5000}'`);
  sql(texto);
}

function eventosDoAviso(): number {
  return Number(
    sql(
      `select count(*) from public.event_log
        where organization_id = '${ORG}' and event_type = '${EVENTO_AVISO_DE_ORCAMENTO}';`,
    ),
  );
}

function limpar(): void {
  sql(`
    delete from public.event_log where organization_id = '${ORG}';
    delete from public.llm_calls where organization_id = '${ORG}';
    delete from public.agent_inbox_items where organization_id = '${ORG}';
    delete from public.ai_budgets where organization_id = '${ORG}';
    delete from public.organizations where id = '${ORG}';
  `);
}

describe("AC-004.2 e AC-004.5: o e-mail de 80% é por período, e o período novo recomeça", () => {
  beforeAll(() => {
    limpar();
    sql(`
      insert into public.organizations (id, slug, legal_name, display_name, settings)
        values ('${ORG}', 'inv-orc-email', 'Email LTDA', 'Email', '{}'::jsonb);
      insert into public.ai_budgets
        (organization_id, monthly_limit_cents, enforcement_mode, enforcement_effective_at)
        values ('${ORG}', 5000, 'bloquear', now() - interval '1 day');
    `);
  });

  afterAll(() => limpar());

  it("AC-004.2: duas reivindicações no mesmo mês emitem UM evento só", () => {
    reivindicar();
    reivindicar();

    expect(eventosDoAviso()).toBe(1);
  });

  it("AC-004.2: o carimbo do mês passado não vale - o período novo avisa de novo", () => {
    sql(
      `update public.ai_budgets
          set last_alarm_sent_at = date_trunc('month', now()) - interval '1 day'
        where organization_id = '${ORG}';`,
    );

    reivindicar();

    expect(eventosDoAviso()).toBe(2);
  });

  it("AC-004.2: organização sem linha de orçamento não emite evento nenhum", () => {
    sql(`delete from public.ai_budgets where organization_id = '${ORG}';`);
    sql(`delete from public.event_log where organization_id = '${ORG}';`);

    reivindicar();

    expect(eventosDoAviso()).toBe(0);
    sql(`
      insert into public.ai_budgets
        (organization_id, monthly_limit_cents, enforcement_mode, enforcement_effective_at)
        values ('${ORG}', 5000, 'bloquear', now() - interval '1 day');
    `);
  });

  it("AC-004.5: gasto só do mês passado não conta: o contador zera e o alerta aberto é retratado", () => {
    sql(`
      insert into public.llm_calls
        (organization_id, purpose, provider, model, input_tokens, output_tokens, cost_cents, latency_ms, created_at)
        values ('${ORG}', 'agent_turn', 'anthropic', 'claude-sonnet-4', 10, 10, 4900, 100,
                date_trunc('month', now()) - interval '1 day');
      insert into public.agent_inbox_items
        (organization_id, kind, severity, title, body, ref_kind, ref_id)
        values ('${ORG}', 'budget_exceeded', 'critical', 't', 'b', 'ai_budget', '${ORG}');
    `);
    const texto = SQL_ORCAMENTO.replace(/\$1/g, `'${ORG}'::uuid`)
      .replace(/\$2/g, `'Titulo'`)
      .replace(/\$3/g, `'Corpo'`);

    const [, , , , gasto = ""] = sql(texto).split("|");

    expect(Number(gasto)).toBe(0);
    expect(
      sql(
        `select count(*) from public.agent_inbox_items
          where organization_id = '${ORG}' and kind = 'budget_exceeded' and status = 'open';`,
      ),
    ).toBe("0");
  });
});
