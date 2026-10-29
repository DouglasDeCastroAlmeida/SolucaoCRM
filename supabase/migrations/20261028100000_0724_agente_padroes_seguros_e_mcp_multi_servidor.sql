-- manifest: **Agente de IA: padrões seguros e MCP com vários servidores (mudança SDD 006, Fatia 3).** Aditiva: `ai_agents.operation_mode` passa a nascer `assisted` e `ai_budgets.enforcement_mode` a nascer `bloquear` (só para linhas NOVAS; as existentes ficam como estão), com gatilho que arma o teto (US$ 50, sem carência) ao publicar o primeiro agente; tabelas `mcp_servidores_externos` (cópia idempotente do servidor atual como `padrao`, sem apagar o formato antigo), `mcp_acoes_pendentes` e `ai_falhas_de_ferramenta`, todas com RLS por organização; CHECKs ampliados: motivos `provedor_indisponivel` e `erro_de_ferramenta` na passagem para humano e kinds `acao_mcp_pendente` e `ia_provedor_indisponivel` na Central.

-- Nenhuma linha existente muda de comportamento: os padrões novos valem só para o
-- que nascer depois, e o servidor MCP atual é COPIADO (o formato antigo em
-- `organizations.settings.mcp_externo` + colunas cifradas fica intacto, serve de
-- leitura de reserva e de rollback).

-- == 1. padrões seguros para linhas novas ==
-- `alter column set default` não toca linha nenhuma já gravada.

alter table public.ai_agents
  alter column operation_mode set default 'assisted';

-- Só o MODO nasce `bloquear`. `enforcement_effective_at` segue sem default: modo
-- `bloquear` sem esta data ainda não bloqueia (null <= now() é null), então uma
-- linha criada de passagem (backfill, gatilho de llm_calls) não estrangula
-- ninguém. Quem arma de fato é o gatilho abaixo, no momento em que o primeiro
-- agente vai ao ar.
alter table public.ai_budgets
  alter column enforcement_mode set default 'bloquear';

create or replace function public.fn_arma_teto_ao_publicar_agente()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.published_version_id is not null
     and (tg_op = 'INSERT' or old.published_version_id is null) then
    -- Sem linha: nasce com o teto padrão (5000 = US$ 50), armado agora.
    -- Com linha: só arma quem JÁ está em `bloquear` com a data vazia (a linha
    -- nasceu pelo padrão novo e ninguém decidiu nada). Linha `off` (a escolha de
    -- quem já usava o produto) e linha `bloquear` já armada ficam como estão.
    insert into public.ai_budgets
      (organization_id, monthly_limit_cents, enforcement_mode, enforcement_effective_at)
    values (new.organization_id, 5000, 'bloquear', now())
    on conflict (organization_id) do update
      set enforcement_effective_at = now()
      where public.ai_budgets.enforcement_mode = 'bloquear'
        and public.ai_budgets.enforcement_effective_at is null;
  end if;
  return new;
end;
$$;

revoke execute on function public.fn_arma_teto_ao_publicar_agente() from public, anon, authenticated;

drop trigger if exists trg_ai_agents_arma_teto on public.ai_agents;
create trigger trg_ai_agents_arma_teto
  after insert or update of published_version_id on public.ai_agents
  for each row execute function public.fn_arma_teto_ao_publicar_agente();

-- == 2. servidores MCP externos (vários por organização) ==

create table if not exists public.mcp_servidores_externos (
  id              uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  -- Entra no id da ferramenta (`mcp_externo:<slug>:...`) e no nome exposto ao
  -- modelo (`<slug>__<nome>`): sem ':' nem '_' para não ser ambíguo.
  slug            text not null check (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$' and char_length(slug) <= 40),
  nome            text not null check (char_length(nome) between 1 and 80),
  endpoint        text not null,
  chave_encrypted bytea,
  chave_iv        bytea,
  chave_tag       bytea,
  chave_last4     text,
  ferramentas     jsonb not null default '[]'::jsonb check (jsonb_typeof(ferramentas) = 'array'),
  ferramentas_em  timestamptz,
  ativo           boolean not null default true,
  created_at      timestamptz not null default now(),
  unique (organization_id, slug)
);

comment on table public.mcp_servidores_externos is
  'Servidores MCP externos de uma organização (mudança SDD 006). A chave é cifrada com AES-256-GCM (AI_CRED_AES_KEY) e NUNCA sai do servidor: o papel authenticated só lê as colunas sem segredo. Escrita só pelo service_role, com organization_id resolvido no servidor.';

-- Migração do servidor atual: o bolso `settings.mcp_externo` + colunas cifradas de
-- `organizations` viram a linha `padrao`. Não apaga nada do formato antigo, e
-- re-aplicar é no-op (on conflict).
-- As colunas cifradas nascem no apêndice 0580, que no baseline vem DEPOIS deste
-- bloco: repetidas aqui (idempotente) para o insert abaixo existir já na instalação nova.
alter table public.organizations
  add column if not exists mcp_externo_chave_encrypted bytea,
  add column if not exists mcp_externo_chave_iv bytea,
  add column if not exists mcp_externo_chave_tag bytea,
  add column if not exists mcp_externo_chave_last4 text;

insert into public.mcp_servidores_externos
  (organization_id, slug, nome, endpoint, chave_encrypted, chave_iv, chave_tag, chave_last4)
select o.id, 'padrao', 'Servidor padrão',
       trim(o.settings->'mcp_externo'->>'endpoint'),
       o.mcp_externo_chave_encrypted, o.mcp_externo_chave_iv,
       o.mcp_externo_chave_tag, o.mcp_externo_chave_last4
  from public.organizations o
 where jsonb_typeof(o.settings->'mcp_externo') = 'object'
   and nullif(trim(o.settings->'mcp_externo'->>'endpoint'), '') is not null
on conflict (organization_id, slug) do nothing;

-- == 3. ações de escrita externas aguardando aprovação ==

create table if not exists public.mcp_acoes_pendentes (
  id              uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  agente_id       uuid references public.ai_agents(id) on delete cascade,
  conversa_id     uuid references public.conversations(id) on delete cascade,
  servidor_id     uuid not null references public.mcp_servidores_externos(id) on delete cascade,
  ferramenta      text not null,
  argumentos      jsonb not null default '{}'::jsonb,
  argumentos_hash text not null,
  estado          text not null default 'pendente'
                  check (estado in ('pendente','aprovada','recusada','executada','falhou')),
  criado_em       timestamptz not null default now(),
  decidido_por    uuid references auth.users(id) on delete set null,
  decidido_em     timestamptz
);

-- A mesma ação, na mesma conversa, não vira duas pendências abertas.
create unique index if not exists mcp_acoes_pendentes_aberta_uidx
  on public.mcp_acoes_pendentes (conversa_id, ferramenta, argumentos_hash)
  where estado = 'pendente';

create index if not exists mcp_acoes_pendentes_org_estado_idx
  on public.mcp_acoes_pendentes (organization_id, estado, criado_em desc);

-- == 4. erros de ferramenta seguidos por conversa ==

create table if not exists public.ai_falhas_de_ferramenta (
  conversation_id uuid primary key references public.conversations(id) on delete cascade,
  organization_id uuid not null references public.organizations(id) on delete cascade,
  seguidas        integer not null default 0 check (seguidas >= 0),
  ultima_em       timestamptz not null default now()
);

-- == 5. RLS: leitura por organização; escrita só pelo servidor ==

alter table public.mcp_servidores_externos enable row level security;
alter table public.mcp_acoes_pendentes     enable row level security;
alter table public.ai_falhas_de_ferramenta enable row level security;

drop policy if exists tenant_isolation_mcp_servidores_externos_all on public.mcp_servidores_externos;
create policy tenant_isolation_mcp_servidores_externos_all on public.mcp_servidores_externos
  for select to authenticated
  using (organization_id in (select public.fn_user_org_ids()));

drop policy if exists tenant_isolation_mcp_acoes_pendentes_all on public.mcp_acoes_pendentes;
create policy tenant_isolation_mcp_acoes_pendentes_all on public.mcp_acoes_pendentes
  for select to authenticated
  using (organization_id in (select public.fn_user_org_ids()));

drop policy if exists tenant_isolation_ai_falhas_de_ferramenta_all on public.ai_falhas_de_ferramenta;
create policy tenant_isolation_ai_falhas_de_ferramenta_all on public.ai_falhas_de_ferramenta
  for select to authenticated
  using (organization_id in (select public.fn_user_org_ids()));

revoke all on table public.mcp_servidores_externos from anon, authenticated;
revoke all on table public.mcp_acoes_pendentes     from anon, authenticated;
revoke all on table public.ai_falhas_de_ferramenta from anon, authenticated;

-- authenticated lê as colunas SEM segredo do servidor; chave_encrypted, chave_iv e
-- chave_tag ficam fora (a REST nunca as entrega, nem a um viewer).
grant select (id, organization_id, slug, nome, endpoint, chave_last4, ferramentas, ferramentas_em, ativo, created_at)
  on public.mcp_servidores_externos to authenticated;
-- `argumentos` fica fora: pode carregar dado do cliente e só o servidor o lê.
grant select (id, organization_id, agente_id, conversa_id, servidor_id, ferramenta, argumentos_hash, estado, criado_em, decidido_por, decidido_em)
  on public.mcp_acoes_pendentes to authenticated;
grant select on public.ai_falhas_de_ferramenta to authenticated;

grant all on table public.mcp_servidores_externos to service_role;
grant all on table public.mcp_acoes_pendentes     to service_role;
grant all on table public.ai_falhas_de_ferramenta to service_role;

-- == 6. vocabulário: motivos da passagem e kinds da Central ==
-- (reconstrução completa dos CHECKs; vivem em bloco único no baseline.sql)

alter table public.passagens_de_atendimento
  drop constraint if exists passagens_de_atendimento_motivo_codigo_check;
alter table public.passagens_de_atendimento
  add constraint passagens_de_atendimento_motivo_codigo_check
  check (motivo_codigo in (
    'requested_human','suspected_optout','orcamento_de_ia','low_sentiment',
    'low_confidence','critical_stage','legal_mention','refund_mention',
    'caso_escalado','verificacao_manual','provedor_indisponivel','erro_de_ferramenta'));

alter table public.agent_inbox_items
  drop constraint if exists agent_inbox_items_kind_check;

alter table public.agent_inbox_items
  add constraint agent_inbox_items_kind_check check (kind in (
    'appointment_outcome_required',
    'appointment_recovery_review',
    'qr_rescan',
    'routing_unassigned',
    'job_dead',
    'event_dead',
    'budget_exceeded',
    'handoff',
    'promotion_review',
    'judge_unaligned',
    'followup_dead',
    'snooze_expired',
    'next_action_ambiguous',
    'risk_backlog_seeded',
    'reactivation_expired',
    'capabilities_missing',
    'message_send_stuck',
    'midia_nao_lida',
    'channel_template_review',
    'channel_number_alert',
    'promise_unfulfilled',
    'contact_proposal_expired',
    'budget_warning',
    'conhecimento_nao_indexado',
    'voice_call_missed',
    'case_stale',
    'aviso_de_caso_nao_entregue',
    'followup_sem_agente',
    'canal_mudo_sem_numero',
    'proposal_expired_notice',
    'proposal_acceptance_rate_drop',
    'proposal_promised_not_created',
    'proposta_travada',
    'proposta_pronta_para_revisao',
    'org_reativada',
    'jev_pedido_de_humano',
    'jev_parar_de_receber',
    'canal_pausado',
    'cobranca',
    'email_de_login_trocado',
    'task_due',
    'task_overdue',
    'agenda_cliente_pediu_remarcar',
    'acao_mcp_pendente',
    'ia_provedor_indisponivel',
    'other'
  ));

notify pgrst, 'reload schema';
