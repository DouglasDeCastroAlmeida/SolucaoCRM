-- manifest: **Canal de e-mail IMAP/SMTP, base do banco (mudança SDD 005, Fatia 2).** Aditiva: `channel_sessions` ganha `email_address` e `email_config` e os CHECKs de provider aceitam `email` (com endereço obrigatório e caixa única por organização, sem distinguir caixa alta); `conversations.channel` aceita `email` e `fn_upsert_email_conversation` (fechada para anon e authenticated); tabelas `email_sync_estado`, `email_ignorados`, `email_remetentes_ignorados`, `email_envios_dia` e `email_credenciais` (a senha cifrada, sem nenhum acesso de cliente), todas com RLS por organização; kinds `email_senha_recusada` e `email_teto_atingido` na Central.

-- Aditiva: nenhuma linha existente muda. Coluna nova nasce nula, CHECKs só ganham valor
-- ('email'), tabelas novas nascem vazias. A senha da caixa NÃO vai para channel_sessions
-- (que concede SELECT de tabela inteira a authenticated): mora em email_credenciais,
-- que nenhum papel de cliente alcança. O desligamento é do código (EMAIL_CANAL).

-- == 1. channel_sessions: a caixa de e-mail ==
alter table public.channel_sessions
  add column if not exists email_address text,
  add column if not exists email_config  jsonb;

comment on column public.channel_sessions.email_address is
  'Endereço da caixa de e-mail (provider email). É o sessionRef deste canal. Espelhado em lib/channels/session-ref.ts.';
comment on column public.channel_sessions.email_config is
  'Servidores, portas, segurança, usuário, últimos 4 da senha, assinatura, teto diário e intervalo da caixa. NUNCA a senha: ela vive cifrada em email_credenciais.';

alter table public.channel_sessions
  drop constraint if exists channel_sessions_provider_check;
alter table public.channel_sessions
  add constraint channel_sessions_provider_check
  check (provider = any (array['waha'::text, 'meta_cloud'::text, 'zernio'::text, 'wacalls'::text, 'zernio_social'::text, 'datafy'::text, 'email'::text]));

alter table public.channel_sessions
  drop constraint if exists channel_sessions_provider_ref_check;
alter table public.channel_sessions
  add constraint channel_sessions_provider_ref_check check (
    (provider = 'waha'       and waha_session_name    is not null) or
    (provider = 'meta_cloud' and meta_phone_number_id is not null) or
    (provider in ('zernio', 'zernio_social') and zernio_account_id is not null) or
    (provider = 'wacalls'    and wacalls_session_id    is not null) or
    (provider = 'datafy'     and datafy_phone_number_id is not null) or
    (provider = 'email'      and email_address is not null)
  );

-- Uma caixa ativa por (organização, endereço), sem distinguir caixa alta. A coluna é
-- nova e vazia: não há duplicata a corrigir antes do índice.
create unique index if not exists channel_sessions_email_address_ativo_unique
  on public.channel_sessions (organization_id, lower(email_address))
  where archived_at is null and email_address is not null;

-- == 2. conversations.channel aceita 'email' ==
alter table public.conversations drop constraint if exists conversations_channel_check;
alter table public.conversations add constraint conversations_channel_check
  check (channel in ('whatsapp', 'instagram', 'facebook', 'email'));

create or replace function public.fn_upsert_email_conversation(
  p_org uuid, p_contact uuid, p_session uuid
) returns uuid language plpgsql security definer set search_path = public as $$
declare v_id uuid;
begin
  insert into public.conversations (organization_id, contact_id, channel_session_id, channel, status, is_group, unread_count_for_assignee, metadata)
  values (p_org, p_contact, p_session, 'email', 'open', false, 0, '{}'::jsonb)
  on conflict (organization_id, contact_id, channel_session_id) where is_group = false
  do update set updated_at = now()
  returning id into v_id;
  return v_id;
end; $$;

revoke all on function public.fn_upsert_email_conversation(uuid, uuid, uuid) from public;
revoke execute on function public.fn_upsert_email_conversation(uuid, uuid, uuid) from anon, authenticated;
grant execute on function public.fn_upsert_email_conversation(uuid, uuid, uuid) to service_role;

-- == 3. estado de sincronização (mutável e frequente, fora da linha da sessão) ==
create table if not exists public.email_sync_estado (
  channel_session_id uuid primary key references public.channel_sessions(id) on delete cascade,
  organization_id    uuid not null references public.organizations(id) on delete cascade,
  uidvalidity        bigint,
  ultimo_uid         bigint not null default 0,
  ultima_rodada_em   timestamptz,
  travado_ate        timestamptz,
  falhas_seguidas    integer not null default 0 check (falhas_seguidas >= 0),
  pausa_motivo       text,
  updated_at         timestamptz not null default now()
);

-- == 4. e-mails ignorados (só o cabeçalho; o corpo é relido pelo UID se promover) ==
create table if not exists public.email_ignorados (
  id                 uuid primary key default gen_random_uuid(),
  organization_id    uuid not null references public.organizations(id) on delete cascade,
  channel_session_id uuid not null references public.channel_sessions(id) on delete cascade,
  message_id         text not null,
  uid                bigint not null,
  remetente          text not null,
  assunto            text,
  recebido_em        timestamptz not null,
  motivo             text not null,
  created_at         timestamptz not null default now(),
  unique (organization_id, channel_session_id, message_id)
);
create index if not exists email_ignorados_criado_idx on public.email_ignorados (created_at);

-- == 5. "não é cliente": remetentes que a organização mandou ignorar ==
create table if not exists public.email_remetentes_ignorados (
  organization_id      uuid not null references public.organizations(id) on delete cascade,
  endereco_normalizado text not null,
  created_by           uuid references auth.users(id) on delete set null,
  created_at           timestamptz not null default now(),
  primary key (organization_id, endereco_normalizado)
);

-- == 6. envios por dia e por caixa (teto no fuso da organização) ==
create table if not exists public.email_envios_dia (
  channel_session_id uuid not null references public.channel_sessions(id) on delete cascade,
  organization_id    uuid not null references public.organizations(id) on delete cascade,
  dia                date not null,
  quantidade         integer not null default 0 check (quantidade >= 0),
  primary key (channel_session_id, dia)
);

-- == 7. a senha cifrada da caixa: só o servidor alcança ==
create table if not exists public.email_credenciais (
  channel_session_id uuid primary key references public.channel_sessions(id) on delete cascade,
  organization_id    uuid not null references public.organizations(id) on delete cascade,
  senha_encrypted    bytea not null,
  updated_at         timestamptz not null default now()
);

-- == 8. RLS: leitura por organização (admin); escrita só pelo servidor ==
alter table public.email_sync_estado           enable row level security;
alter table public.email_ignorados             enable row level security;
alter table public.email_remetentes_ignorados  enable row level security;
alter table public.email_envios_dia            enable row level security;
alter table public.email_credenciais           enable row level security;

drop policy if exists tenant_isolation_email_sync_estado_all on public.email_sync_estado;
create policy tenant_isolation_email_sync_estado_all on public.email_sync_estado
  for select to authenticated
  using (organization_id in (select public.fn_user_org_ids()) and public.fn_role_at_least(organization_id, 'admin'));

drop policy if exists tenant_isolation_email_ignorados_all on public.email_ignorados;
create policy tenant_isolation_email_ignorados_all on public.email_ignorados
  for select to authenticated
  using (organization_id in (select public.fn_user_org_ids()) and public.fn_role_at_least(organization_id, 'admin'));

drop policy if exists tenant_isolation_email_remetentes_ignorados_all on public.email_remetentes_ignorados;
create policy tenant_isolation_email_remetentes_ignorados_all on public.email_remetentes_ignorados
  for select to authenticated
  using (organization_id in (select public.fn_user_org_ids()) and public.fn_role_at_least(organization_id, 'admin'));

revoke all on table public.email_sync_estado           from anon, authenticated;
revoke all on table public.email_ignorados             from anon, authenticated;
revoke all on table public.email_remetentes_ignorados  from anon, authenticated;
revoke all on table public.email_envios_dia            from anon, authenticated;
revoke all on table public.email_credenciais           from anon, authenticated;

grant select on public.email_sync_estado           to authenticated;
grant select on public.email_ignorados             to authenticated;
grant select on public.email_remetentes_ignorados  to authenticated;

grant all on table public.email_sync_estado           to service_role;
grant all on table public.email_ignorados             to service_role;
grant all on table public.email_remetentes_ignorados  to service_role;
grant all on table public.email_envios_dia            to service_role;
grant all on table public.email_credenciais           to service_role;

-- == 9. vocabulário: kinds novos da Central ==
-- (reconstrução completa do CHECK; vive em bloco único no baseline.sql)
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
    'email_senha_recusada',
    'email_teto_atingido',
    'other'
  ));

notify pgrst, 'reload schema';
