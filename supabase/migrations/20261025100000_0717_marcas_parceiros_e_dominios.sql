-- manifest: Marcas, parceiros e domínios (SP1, mudança 002): tabelas partners/brands/brand_domains/brand_plans/vertical_packs/brand_email_context/auth_hook_deliveries, organizations.brand_id, marca padrão que herda de platform_branding, RLS e fn_set_org_brand (só aditivo)
--
-- Migração SÓ ADITIVA: nenhuma tabela ou coluna existente é apagada, renomeada ou
-- tem o tipo alterado. A imagem da versão anterior ignora tudo o que entra aqui
-- (AC-002.3). Idempotente: pode ser reaplicada pelo `update.sh` sem duplicar nada
-- (AC-002.4).
--
-- Marca é dado GLOBAL (não é tenant): as tabelas novas não têm `organization_id`.
-- A única ponte é `organizations.brand_id` (NULL = marca padrão).
--
-- A marca padrão nasce com os campos visuais NULOS: ela HERDA de
-- `platform_branding` e do ambiente em vez de copiá-los (ADR-002). Duas fontes de
-- verdade divergiriam; uma que herda, não.

-- ─── pacotes verticais (antes de brands, que aponta para eles) ───────────────────
create table if not exists public.vertical_packs (
  id         uuid primary key default gen_random_uuid(),
  slug       public.citext not null unique,
  name       text not null,
  version    integer not null default 1 check (version >= 1),
  seed       jsonb not null default '{}'::jsonb,
  status     text not null default 'active' check (status in ('active', 'inactive')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- ─── parceiros ───────────────────────────────────────────────────────────────────
create table if not exists public.partners (
  id         uuid primary key default gen_random_uuid(),
  slug       public.citext not null unique,
  name       text not null,
  status     text not null default 'active' check (status in ('active', 'inactive')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.partner_members (
  partner_id uuid not null references public.partners(id) on delete cascade,
  user_id    uuid not null references auth.users(id) on delete cascade,
  role       text not null default 'partner_admin' check (role in ('partner_admin')),
  revoked_at timestamptz,
  created_at timestamptz not null default now(),
  primary key (partner_id, user_id)
);

-- ─── marcas ──────────────────────────────────────────────────────────────────────
create table if not exists public.brands (
  id                     uuid primary key default gen_random_uuid(),
  partner_id             uuid not null references public.partners(id) on delete restrict,
  slug                   public.citext not null unique,
  name                   text not null,
  status                 text not null default 'active' check (status in ('active', 'inactive')),
  is_default             boolean not null default false,
  -- Campos visuais: NULL = herda de platform_branding / ambiente / padrão do produto.
  app_name               text,
  logo_path              text,
  logo_dark_path         text,
  favicon_path           text,
  accent_hex             text check (accent_hex is null or accent_hex ~ '^#[0-9a-f]{6}$'),
  accent_dark_hex        text check (accent_dark_hex is null or accent_dark_hex ~ '^#[0-9a-f]{6}$'),
  sender_name            text,
  reply_to               text,
  support_email          text,
  default_pack_id        uuid references public.vertical_packs(id) on delete set null,
  cadastro_aberto        boolean not null default false,
  permite_personalizacao boolean not null default true,
  mobile                 jsonb not null default '{}'::jsonb,
  created_at             timestamptz not null default now(),
  updated_at             timestamptz not null default now()
);

-- No máximo UMA marca padrão por instalação.
create unique index if not exists brands_uma_marca_padrao
  on public.brands (is_default) where is_default;

create index if not exists brands_partner_id_idx on public.brands (partner_id);

-- ─── domínios da marca ───────────────────────────────────────────────────────────
create table if not exists public.brand_domains (
  id            uuid primary key default gen_random_uuid(),
  brand_id      uuid not null references public.brands(id) on delete cascade,
  host          public.citext not null unique,
  kind          text not null check (kind in ('subdominio', 'proprio')),
  status        text not null default 'active' check (status in ('active', 'inactive', 'removed')),
  dns_ok_at     timestamptz,
  cert_requests integer not null default 0 check (cert_requests >= 0),
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

create index if not exists brand_domains_brand_id_idx on public.brand_domains (brand_id);

-- ─── planos da marca (só dado; nenhuma cobrança é acionada) ──────────────────────
create table if not exists public.brand_plans (
  id          uuid primary key default gen_random_uuid(),
  brand_id    uuid not null references public.brands(id) on delete cascade,
  name        text not null,
  limits      jsonb not null default '{}'::jsonb,
  price_cents bigint not null default 0 check (price_cents >= 0),
  currency    text not null default 'BRL' check (char_length(currency) = 3),
  cycle       text not null default 'monthly' check (cycle in ('monthly', 'yearly', 'one_time')),
  status      text not null default 'active' check (status in ('active', 'inactive')),
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create index if not exists brand_plans_brand_id_idx on public.brand_plans (brand_id);

-- ─── só do servidor: contexto do e-mail de acesso e idempotência do gancho ───────
create table if not exists public.brand_email_context (
  email        public.citext not null,
  action       text not null,
  brand_id     uuid not null references public.brands(id) on delete cascade,
  created_at   timestamptz not null default now(),
  last_sent_at timestamptz,
  primary key (email, action)
);

create table if not exists public.auth_hook_deliveries (
  webhook_id  text primary key,
  received_at timestamptz not null default now()
);

-- ─── a organização aponta para a marca (NULL = marca padrão) ─────────────────────
alter table public.organizations
  add column if not exists brand_id uuid references public.brands(id) on delete set null;

create index if not exists organizations_brand_id_idx on public.organizations (brand_id);

-- ─── funções de apoio à RLS ──────────────────────────────────────────────────────
create or replace function public.fn_user_partner_ids()
returns setof uuid
language sql
stable
security definer
set search_path = public, pg_temp
as $f$
  select pm.partner_id
    from public.partner_members pm
   where pm.user_id = auth.uid()
     and pm.revoked_at is null
     and pm.role = 'partner_admin';
$f$;

revoke execute on function public.fn_user_partner_ids() from public, anon;
grant  execute on function public.fn_user_partner_ids() to authenticated, service_role;

create or replace function public.fn_is_partner_admin(p_partner_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $f$
  select exists (
    select 1
      from public.partner_members pm
     where pm.partner_id = p_partner_id
       and pm.user_id = auth.uid()
       and pm.revoked_at is null
       and pm.role = 'partner_admin'
  );
$f$;

revoke execute on function public.fn_is_partner_admin(uuid) from public, anon;
grant  execute on function public.fn_is_partner_admin(uuid) to authenticated, service_role;

-- ─── a troca de marca de uma organização: só admin da plataforma, com auditoria ──
create or replace function public.fn_set_org_brand(p_org_id uuid, p_brand_id uuid)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $f$
declare
  v_old uuid;
begin
  if not public.fn_is_platform_admin_full() then
    raise exception 'forbidden' using errcode = '42501';
  end if;

  if not exists (select 1 from public.brands where id = p_brand_id) then
    raise exception 'brand_not_found' using errcode = 'P0002';
  end if;

  select o.brand_id into v_old
    from public.organizations o
   where o.id = p_org_id
   for update;
  if not found then
    raise exception 'organization_not_found' using errcode = 'P0002';
  end if;

  update public.organizations
     set brand_id = p_brand_id, updated_at = now()
   where id = p_org_id;

  insert into public.api_audit_log
    (organization_id, actor_user_id, acting_as_platform_admin, action, resource_type, resource_id, metadata)
  values
    (p_org_id, auth.uid(), true, 'org.brand_changed', 'organization', p_org_id,
     jsonb_build_object('from_brand_id', v_old, 'to_brand_id', p_brand_id));
end;
$f$;

revoke execute on function public.fn_set_org_brand(uuid, uuid) from public, anon;
grant  execute on function public.fn_set_org_brand(uuid, uuid) to authenticated, service_role;

-- Quem fala pelo PostgREST (anon/authenticated) não troca `brand_id` por UPDATE
-- direto, nem sendo admin da própria organização: a RLS de `organizations` deixa
-- o admin atualizar a linha, e sem esta trava ele escolheria a própria marca.
-- Dentro da RPC acima o papel é o do dono da função, então ela passa.
create or replace function public.fn_organizations_brand_guard()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $f$
begin
  if new.brand_id is distinct from old.brand_id
     and current_user in ('anon', 'authenticated')
     and not public.fn_is_platform_admin_full() then
    raise exception 'brand_change_forbidden' using errcode = '42501';
  end if;
  return new;
end;
$f$;

revoke execute on function public.fn_organizations_brand_guard() from public, anon;

drop trigger if exists trg_organizations_brand_guard on public.organizations;
create trigger trg_organizations_brand_guard
  before update of brand_id on public.organizations
  for each row execute function public.fn_organizations_brand_guard();

-- ─── RLS ─────────────────────────────────────────────────────────────────────────
alter table public.partners              enable row level security;
alter table public.partner_members       enable row level security;
alter table public.brands                enable row level security;
alter table public.brand_domains         enable row level security;
alter table public.brand_plans           enable row level security;
alter table public.vertical_packs        enable row level security;
alter table public.brand_email_context   enable row level security;
alter table public.auth_hook_deliveries  enable row level security;

-- parceiros
drop policy if exists partners_select on public.partners;
create policy partners_select on public.partners for select to authenticated
  using (public.fn_is_platform_admin() or id in (select public.fn_user_partner_ids()));

drop policy if exists partners_write on public.partners;
create policy partners_write on public.partners for all to authenticated
  using (public.fn_is_platform_admin_full())
  with check (public.fn_is_platform_admin_full());

drop policy if exists partner_members_select on public.partner_members;
create policy partner_members_select on public.partner_members for select to authenticated
  using (public.fn_is_platform_admin() or partner_id in (select public.fn_user_partner_ids()));

drop policy if exists partner_members_write on public.partner_members;
create policy partner_members_write on public.partner_members for all to authenticated
  using (public.fn_is_platform_admin_full())
  with check (public.fn_is_platform_admin_full());

-- marcas: plataforma vê tudo; parceiro vê as suas; membro de organização só LÊ a
-- marca da própria organização (NULL = a marca padrão).
drop policy if exists brands_select on public.brands;
create policy brands_select on public.brands for select to authenticated
  using (
    public.fn_is_platform_admin()
    or partner_id in (select public.fn_user_partner_ids())
    or id in (
      select o.brand_id from public.organizations o
       where o.id in (select public.fn_user_org_ids()) and o.brand_id is not null
    )
    or (is_default and exists (
      select 1 from public.organizations o
       where o.id in (select public.fn_user_org_ids()) and o.brand_id is null
    ))
  );

drop policy if exists brands_write on public.brands;
create policy brands_write on public.brands for all to authenticated
  using (public.fn_is_platform_admin_full() or public.fn_is_partner_admin(partner_id))
  with check (public.fn_is_platform_admin_full() or public.fn_is_partner_admin(partner_id));

-- domínios: organização comum NÃO lê (só plataforma e parceiro)
drop policy if exists brand_domains_select on public.brand_domains;
create policy brand_domains_select on public.brand_domains for select to authenticated
  using (
    public.fn_is_platform_admin()
    or exists (select 1 from public.brands b
                where b.id = brand_domains.brand_id and public.fn_is_partner_admin(b.partner_id))
  );

drop policy if exists brand_domains_write on public.brand_domains;
create policy brand_domains_write on public.brand_domains for all to authenticated
  using (
    public.fn_is_platform_admin_full()
    or exists (select 1 from public.brands b
                where b.id = brand_domains.brand_id and public.fn_is_partner_admin(b.partner_id))
  )
  with check (
    public.fn_is_platform_admin_full()
    or exists (select 1 from public.brands b
                where b.id = brand_domains.brand_id and public.fn_is_partner_admin(b.partner_id))
  );

-- planos: leitura herda a visibilidade da marca (a RLS de `brands` filtra o exists)
drop policy if exists brand_plans_select on public.brand_plans;
create policy brand_plans_select on public.brand_plans for select to authenticated
  using (exists (select 1 from public.brands b where b.id = brand_plans.brand_id));

drop policy if exists brand_plans_write on public.brand_plans;
create policy brand_plans_write on public.brand_plans for all to authenticated
  using (
    public.fn_is_platform_admin_full()
    or exists (select 1 from public.brands b
                where b.id = brand_plans.brand_id and public.fn_is_partner_admin(b.partner_id))
  )
  with check (
    public.fn_is_platform_admin_full()
    or exists (select 1 from public.brands b
                where b.id = brand_plans.brand_id and public.fn_is_partner_admin(b.partner_id))
  );

-- pacotes verticais: leitura via marca que o usa
drop policy if exists vertical_packs_select on public.vertical_packs;
create policy vertical_packs_select on public.vertical_packs for select to authenticated
  using (
    public.fn_is_platform_admin()
    or exists (select 1 from public.brands b where b.default_pack_id = vertical_packs.id)
  );

drop policy if exists vertical_packs_write on public.vertical_packs;
create policy vertical_packs_write on public.vertical_packs for all to authenticated
  using (public.fn_is_platform_admin_full())
  with check (public.fn_is_platform_admin_full());

-- só do servidor: RLS ligada e nenhuma policy; os papéis do PostgREST nem têm grant
revoke all on table public.brand_email_context  from anon, authenticated;
revoke all on table public.auth_hook_deliveries from anon, authenticated;
grant  all on table public.brand_email_context  to service_role;
grant  all on table public.auth_hook_deliveries to service_role;

-- anon nunca lê marca nem parceiro por aqui (a página pública resolve no servidor)
revoke all on table public.partners        from anon;
revoke all on table public.partner_members from anon;
revoke all on table public.brands          from anon;
revoke all on table public.brand_domains   from anon;
revoke all on table public.brand_plans     from anon;
revoke all on table public.vertical_packs  from anon;

-- ─── a marca padrão: herda de platform_branding, e as organizações existentes a usam ──
insert into public.partners (slug, name)
values ('plataforma', 'Plataforma')
on conflict (slug) do nothing;

insert into public.brands (partner_id, slug, name, is_default)
select p.id, 'padrao', 'Marca padrão', true
  from public.partners p
 where p.slug = 'plataforma'
   and not exists (select 1 from public.brands b where b.is_default)
on conflict do nothing;

update public.organizations
   set brand_id = (select b.id from public.brands b where b.is_default limit 1)
 where brand_id is null
   and exists (select 1 from public.brands b where b.is_default);
