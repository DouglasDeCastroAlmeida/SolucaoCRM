-- manifest: **Agenda: confirmação pelo cliente (mudança SDD 007).** Aditiva: `calendar_appointments.client_confirmed_at` e `client_reschedule_requested_at` (nulos; campos próprios, não tocam `status` nem a confirmação da equipe), `calendar_event_types.client_confirmation_enabled` (chave por tipo, `false` nos existentes: nenhum tipo muda de comportamento) e o kind `agenda_cliente_pediu_remarcar` na Central (lista completa do CHECK, bloco único no baseline). Sem função nova e sem tabela nova (doutrina DIRC).

-- Os campos de confirmação do cliente são DELIBERADAMENTE separados de `status`
-- e de `service_confirmed_at` (a confirmação da equipe): confirmar pelo cliente
-- não substitui a decisão humana. Nada aqui lê ou reescreve lembretes.

alter table public.calendar_appointments
  add column if not exists client_confirmed_at timestamptz,
  add column if not exists client_reschedule_requested_at timestamptz;

alter table public.calendar_event_types
  add column if not exists client_confirmation_enabled boolean not null default false;

-- Compromisso ainda aberto e sem confirmação do cliente: o conjunto que a regra
-- consulta ao receber a resposta. Parcial, para não pesar na tabela inteira.
create index if not exists calendar_appointments_client_pending_idx
  on public.calendar_appointments (organization_id, contact_id, starts_at)
  where client_confirmed_at is null and status in ('pending', 'confirmed');

-- == kinds da Central (reconstrução completa do CHECK; vive no bloco único do baseline) ==

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
    'other'
  ));
