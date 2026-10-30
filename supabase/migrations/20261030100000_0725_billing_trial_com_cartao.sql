-- manifest: **Trial com cartão por marca (mudança 003, fatia 2).** Aditiva e sem efeito em quem já existe: `brands.cobranca_ligada` (default falso), `cobranca_planos.brand_id` (nulo = plano da instalação; planos por marca isolados e um padrão por marca), `cobranca_assinaturas.trial_com_cartao`, CHECK de `ultimo_aviso` com `trial_cobra_em_2_dias` e `trial_cobra_amanha`, `cobranca_trial_documentos` (só o HMAC do documento, único por marca) e `cobranca_reembolsos` (único por cobrança). `fn_trial_na_criacao_da_org` e `fn_create_tenant_with_owner` ganham um ramo só para marca com cobrança ligada (org nasce suspensa à espera do cartão); marca desligada roda o código de antes, e nenhuma assinatura é criada para organização existente. Mesmo bloco como apêndice no baseline.sql, antes da VARREDURA anon.

-- ── A. colunas ───────────────────────────────────────────────────────────────
alter table public.brands
  add column if not exists cobranca_ligada boolean not null default false;

comment on column public.brands.cobranca_ligada is
  'Chave da cobrança com trial no cartão (mudança 003). Falsa = a marca cadastra como antes. Só vale com o módulo de cobrança da instalação ligado (fn_cobranca_da_marca_ligada).';

-- Nulo = plano da INSTALAÇÃO (todos os de hoje). Plano de marca só é visto pela marca.
alter table public.cobranca_planos
  add column if not exists brand_id uuid references public.brands(id) on delete restrict;

create index if not exists cobranca_planos_brand_id_idx on public.cobranca_planos (brand_id);

-- Um plano padrão por marca (e um para a instalação, brand_id nulo). Num bloco só:
-- o update.sh reaplica sem ON_ERROR_STOP, e o drop solto sem o create deixaria a
-- tabela sem a trava. Hoje todo brand_id é nulo, então a reconstrução nunca colide.
do $um_padrao$
begin
  if not exists (
    select 1 from pg_indexes
     where schemaname = 'public' and indexname = 'cobranca_planos_um_padrao'
       and indexdef like '%brand_id%'
  ) then
    drop index if exists public.cobranca_planos_um_padrao;
    create unique index cobranca_planos_um_padrao
      on public.cobranca_planos ((coalesce(brand_id, '00000000-0000-0000-0000-000000000000'::uuid)))
      where padrao_no_cadastro and arquivado_em is null;
  end if;
end
$um_padrao$;

alter table public.cobranca_assinaturas
  add column if not exists trial_com_cartao boolean not null default false;

-- CHECK de ultimo_aviso ampliado (vocabulário em lib/cobranca/vocabulario.ts, vigiado
-- por vocabulario-banco-x-typescript). Acha a constraint pelo conteúdo, não pelo nome.
do $ultimo_aviso$
declare
  c record;
begin
  if not exists (
    select 1 from pg_constraint k
     where k.conrelid = 'public.cobranca_assinaturas'::regclass and k.contype = 'c'
       and pg_get_constraintdef(k.oid) like '%trial_cobra_amanha%'
  ) then
    for c in
      select k.conname from pg_constraint k
       where k.conrelid = 'public.cobranca_assinaturas'::regclass and k.contype = 'c'
         and pg_get_constraintdef(k.oid) like '%ultimo_aviso%'
         and pg_get_constraintdef(k.oid) not like '%ultimo_aviso_em%'
    loop
      execute format('alter table public.cobranca_assinaturas drop constraint %I', c.conname);
    end loop;
    alter table public.cobranca_assinaturas
      add constraint cobranca_assinaturas_ultimo_aviso_check
      check (ultimo_aviso in ('trial_acabando', 'venceu', 'suspende_em_breve', 'suspensa',
                              'trial_cobra_em_2_dias', 'trial_cobra_amanha'));
  end if;
end
$ultimo_aviso$;

-- ── B. tabelas novas ─────────────────────────────────────────────────────────
-- Um trial por documento por marca. Guarda SÓ o HMAC-SHA256 em hex (64 caracteres):
-- o CPF/CNPJ nunca entra (LGPD). A organização é rastro, não dono: apagar a
-- organização não devolve o direito ao trial (set null), e o hash sozinho não
-- revela o documento. RLS ligada e nenhuma policy: só o service_role.
create table if not exists public.cobranca_trial_documentos (
  brand_id uuid not null references public.brands(id) on delete cascade,
  documento_hash text not null check (documento_hash ~ '^[0-9a-f]{64}$'),
  organization_id uuid references public.organizations(id) on delete set null,
  created_at timestamptz not null default now(),
  primary key (brand_id, documento_hash)
);

comment on table public.cobranca_trial_documentos is
  'Trial já usado por documento, por marca (mudança 003). Só o HMAC-SHA256 do CPF/CNPJ normalizado, nunca o documento. Exclusiva do servidor: RLS ligada sem policy.';

alter table public.cobranca_trial_documentos enable row level security;
revoke all on public.cobranca_trial_documentos from anon, authenticated;
grant select, insert, update, delete on public.cobranca_trial_documentos to service_role;

-- Pedido de reembolso de arrependimento: um por cobrança. Leitura: admin da
-- própria organização; escrita: só o service_role.
create table if not exists public.cobranca_reembolsos (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  pagamento_ref text not null check (char_length(pagamento_ref) between 1 and 200),
  status text not null default 'pedido' check (status in ('pedido', 'devolvido', 'recusado')),
  created_at timestamptz not null default now()
);

create unique index if not exists cobranca_reembolsos_pedido_unico
  on public.cobranca_reembolsos (organization_id, pagamento_ref);

comment on table public.cobranca_reembolsos is
  'Pedidos de reembolso de arrependimento (mudança 003). Único por (organização, cobrança): o segundo pedido não cria outro item. A devolução em si é manual, no painel do Asaas.';

alter table public.cobranca_reembolsos enable row level security;
drop policy if exists tenant_isolation_cobranca_reembolsos_select on public.cobranca_reembolsos;
create policy tenant_isolation_cobranca_reembolsos_select on public.cobranca_reembolsos
  for select to authenticated using (public.fn_role_at_least(organization_id, 'admin'));
revoke all on public.cobranca_reembolsos from anon, authenticated;
grant select on public.cobranca_reembolsos to authenticated;
grant select, insert, update, delete on public.cobranca_reembolsos to service_role;

-- ── C. funções ───────────────────────────────────────────────────────────────
-- A marca cobra quando a chave dela E o módulo da instalação estão ligados.
-- Marca nula = a marca padrão (as organizações de hoje apontam para ela).
create or replace function public.fn_cobranca_da_marca_ligada(p_brand uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select public.fn_cobranca_ligada()
     and exists (
       select 1 from public.brands b
        where b.cobranca_ligada
          and b.id = coalesce(p_brand, (select d.id from public.brands d where d.is_default limit 1))
     );
$$;

revoke execute on function public.fn_cobranca_da_marca_ligada(uuid) from public, anon, authenticated;
grant execute on function public.fn_cobranca_da_marca_ligada(uuid) to service_role;

-- Corpo vigente da 0679 com DUAS mudanças: (1) o caminho de hoje só enxerga planos
-- da instalação (brand_id nulo), para plano de marca não vazar para marca
-- desligada; (2) o ramo novo, só para marca com cobrança ligada: plano da própria
-- marca, organização suspensa à espera do cartão (entrada paga) e assinatura
-- marcada trial_com_cartao. Marca desligada: nenhuma linha do caminho de hoje mudou.
create or replace function public.fn_trial_na_criacao_da_org()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_plano_id uuid;
  v_trial_dias integer;
  v_escolheu_plano boolean := nullif(new.settings->>'cobranca_signup_plan_id', '') is not null;
  v_marca uuid;
begin
  if new.created_by is null or not public.fn_cobranca_ligada() then
    return null;
  end if;
  if exists (select 1 from public.platform_admins pa
              where pa.user_id = new.created_by and pa.revoked_at is null) then
    return null;
  end if;

  -- O campo é transitório: sai já, em todo caminho que segue (inclusive o isento).
  update public.organizations
     set settings = coalesce(settings, '{}'::jsonb) - 'cobranca_signup_plan_id'
   where id = new.id and settings ? 'cobranca_signup_plan_id';

  -- Ramo da marca que cobra com trial no cartão.
  v_marca := coalesce(new.brand_id, (select b.id from public.brands b where b.is_default limit 1));
  if v_marca is not null and public.fn_cobranca_da_marca_ligada(v_marca) then
    if v_escolheu_plano then
      begin
        v_plano_id := (new.settings->>'cobranca_signup_plan_id')::uuid;
      exception when invalid_text_representation then
        v_plano_id := null;
      end;
      select p.trial_dias into v_trial_dias
        from public.cobranca_planos p
       where p.id = v_plano_id and p.brand_id = v_marca
         and p.arquivado_em is null and p.oferecido_ao_cliente;
      if not found then
        v_escolheu_plano := false;
      end if;
    end if;
    if not v_escolheu_plano then
      select p.id, p.trial_dias into v_plano_id, v_trial_dias
        from public.cobranca_planos p
       where p.brand_id = v_marca and p.padrao_no_cadastro and p.arquivado_em is null;
      if v_plano_id is null then
        if exists (select 1 from public.cobranca_planos p
                    where p.brand_id = v_marca and p.arquivado_em is null and p.oferecido_ao_cliente) then
          raise exception 'plano_obrigatorio' using errcode = '22023';
        end if;
        raise exception 'cobranca_marca_sem_plano' using errcode = '22023';
      end if;
    end if;

    insert into public.cobranca_assinaturas
      (organization_id, plano_id, estado, trial_ate, pagamento_inicial_pendente, trial_com_cartao)
    values
      (new.id, v_plano_id, 'trial', now() + make_interval(days => v_trial_dias), true, true)
    on conflict (organization_id) do nothing;

    perform public.fn_suspender_organizacao(new.id, 'cobranca', 'Aguardando o primeiro pagamento', null);
    return null;
  end if;

  -- Escolha que não vale mais (o plano deixou de ser oferecido ou foi arquivado
  -- entre o cadastro e a confirmação do e-mail; ou metadata adulterada) vale
  -- como "sem escolha": cai no padrão. Recusar travava a empresa para sempre —
  -- a recuperação em /get-started reenvia a MESMA metadata.
  if v_escolheu_plano then
    begin
      v_plano_id := (new.settings->>'cobranca_signup_plan_id')::uuid;
    exception when invalid_text_representation then
      v_plano_id := null;
    end;
    select p.trial_dias into v_trial_dias
      from public.cobranca_planos p
     where p.id = v_plano_id and p.brand_id is null
       and p.arquivado_em is null and p.oferecido_ao_cliente;
    if not found then
      v_escolheu_plano := false;
    end if;
  end if;
  if not v_escolheu_plano then
    select p.id, p.trial_dias into v_plano_id, v_trial_dias
      from public.cobranca_planos p
     where p.brand_id is null and p.padrao_no_cadastro and p.arquivado_em is null;
    if v_plano_id is null then
      -- Decisão do dono (doc 146, opção B, 15/10): o revendedor que não tem
      -- plano NENHUM (nem padrão, nem oferecido) segue como antes da 0679 e a
      -- empresa nasce isenta. Com plano oferecido e sem padrão, não: o cadastro
      -- sem escolha pularia a entrada paga. Espelho em lib/cobranca/cadastro.ts.
      if not exists (select 1 from public.cobranca_planos p
                      where p.brand_id is null and p.arquivado_em is null and p.oferecido_ao_cliente) then
        return null;
      end if;
      raise exception 'plano_obrigatorio' using errcode = '22023';
    end if;
  end if;

  insert into public.cobranca_assinaturas
    (organization_id, plano_id, estado, trial_ate, pagamento_inicial_pendente)
  values
    (new.id, v_plano_id,
     'trial',
     now() + make_interval(days => v_trial_dias),
     v_trial_dias = 0)
  on conflict (organization_id) do nothing;

  if v_trial_dias = 0 then
    perform public.fn_suspender_organizacao(new.id, 'cobranca', 'Aguardando o primeiro pagamento', null);
  end if;
  return null;
end;
$$;

revoke execute on function public.fn_trial_na_criacao_da_org() from public, anon, authenticated;

-- Corpo vigente da 0679 com o mesmo desenho: `brand_id` no corpo do pedido só vale
-- quando a marca cobra (senão é ignorado, como hoje); com marca que cobra o plano
-- tem de ser da marca e a organização nasce suspensa à espera do cartão. Fora
-- disso o plano tem de ser da instalação.
create or replace function public.fn_create_tenant_with_owner(
  p_actor uuid, p_key uuid, p_request jsonb, p_hash text
) returns jsonb language plpgsql security definer set search_path = public, pg_temp as $$
declare
  prior public.idempotency_keys%rowtype;
  org public.organizations%rowtype;
  result jsonb;
  dono_e_outra_pessoa boolean;
  v_plano_id uuid;
  v_trial_dias integer;
  v_marca uuid;
  v_cobra boolean := false;
begin
  if not exists (select 1 from public.platform_admins where user_id = p_actor
    and revoked_at is null and scope = 'full') then
    raise exception 'platform_admin_required' using errcode = '42501';
  end if;
  perform pg_advisory_xact_lock(hashtextextended(p_actor::text || ':' || p_key::text, 0));
  select * into prior from public.idempotency_keys
    where key = p_key::text and endpoint = '/api/v1/admin/tenants:' || p_actor::text
      and expires_at > now() and tenant_creation_trusted;
  if found then
    if prior.request_hash <> decode(p_hash, 'hex') then
      raise exception 'idempotency_conflict' using errcode = '22023';
    end if;
    if prior.response_body->>'id' is distinct from prior.organization_id::text
      or not exists (select 1 from public.organizations where id = prior.organization_id and created_by = p_actor) then
      raise exception 'idempotency_provenance_invalid' using errcode = '22023';
    end if;
    return prior.response_body || jsonb_build_object('created', false);
  end if;

  v_marca := nullif(p_request->>'brand_id', '')::uuid;
  if v_marca is not null then
    v_cobra := public.fn_cobranca_da_marca_ligada(v_marca);
  end if;

  v_plano_id := nullif(p_request->>'plano_id', '')::uuid;
  if v_plano_id is not null then
    if not public.fn_cobranca_ligada() then
      raise exception 'cobranca_desligada' using errcode = '22023';
    end if;
    select p.trial_dias into v_trial_dias
      from public.cobranca_planos p
     where p.id = v_plano_id and p.arquivado_em is null
       and (case when v_cobra then p.brand_id = v_marca else p.brand_id is null end);
    if not found then
      raise exception 'plano_invalido' using errcode = '22023';
    end if;
  end if;

  dono_e_outra_pessoa := lower(p_request->>'owner_email') is distinct from
    (select lower(email) from auth.users where id = p_actor);

  insert into public.organizations(display_name, slug, legal_name, cnpj, status, settings, created_by, brand_id)
    values (p_request->>'display_name', p_request->>'slug', coalesce(nullif(p_request->>'legal_name', ''), p_request->>'display_name'),
      p_request->>'cnpj', 'active',
      case when p_request ? 'plan' then jsonb_build_object('plan', p_request->>'plan') else '{}'::jsonb end,
      p_actor, case when v_cobra then v_marca else null end)
    returning * into org;
  insert into public.user_organizations(organization_id, user_id, role, accepted_at, interface_settings, provisional_until_handover)
    values (org.id, p_actor, 'admin', now(),
      case when dono_e_outra_pessoa
        then '{"preset":"completa"}'::jsonb
        else coalesce(p_request->'owner_interface_settings', '{"preset":"completa"}'::jsonb) end,
      dono_e_outra_pessoa);

  if v_plano_id is not null then
    if v_cobra then
      insert into public.cobranca_assinaturas
        (organization_id, plano_id, estado, trial_ate, pagamento_inicial_pendente, trial_com_cartao)
      values (org.id, v_plano_id, 'trial', now() + make_interval(days => v_trial_dias), true, true);
      perform public.fn_suspender_organizacao(org.id, 'cobranca', 'Aguardando o primeiro pagamento', null);
    else
      insert into public.cobranca_assinaturas
        (organization_id, plano_id, estado, trial_ate, pagamento_inicial_pendente)
      values (org.id, v_plano_id,
        'trial',
        now() + make_interval(days => v_trial_dias), v_trial_dias = 0);
      if v_trial_dias = 0 then
        perform public.fn_suspender_organizacao(org.id, 'cobranca', 'Aguardando o primeiro pagamento', null);
      end if;
    end if;
  end if;

  result := jsonb_build_object('id', org.id, 'slug', org.slug, 'display_name', org.display_name,
    'invite_id', gen_random_uuid(), 'issued_at', floor(extract(epoch from now()))::bigint);
  insert into public.idempotency_keys(organization_id, key, endpoint, request_hash, status_code, response_body, tenant_creation_trusted)
    values (org.id, p_key::text, '/api/v1/admin/tenants:' || p_actor::text,
      decode(p_hash, 'hex'), 201, result, true);
  return result || jsonb_build_object('created', true);
end $$;

revoke all on function public.fn_create_tenant_with_owner(uuid, uuid, jsonb, text) from public, anon, authenticated;
grant execute on function public.fn_create_tenant_with_owner(uuid, uuid, jsonb, text) to service_role;
