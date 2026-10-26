-- manifest: Cópia atômica do pacote vertical da marca para a organização (SP1, mudança 002): fn_copiar_pacote_para_org, service_role apenas, idempotente (só aditivo)
--
-- A cópia do pacote vertical vive em `organizations.settings.vertical_pack`. Fazer
-- ler-e-gravar no app deixava uma janela: duas criações em paralelo liam
-- `settings` sem a chave e a última gravação apagava a primeira (e qualquer outra
-- chave que um terceiro tivesse gravado entre a leitura e a escrita). Aqui o teste
-- "ainda não tem cópia" e a escrita são UM UPDATE: o Postgres trava a linha, e a
-- segunda chamada reavalia o WHERE depois da primeira e não casa mais.
--
-- Só `service_role` executa. A função recebe a organização por argumento, e por isso
-- NÃO é dada a `authenticated`: o chamador é o servidor, que resolve a organização
-- de fonte confiável (a criação em curso), nunca do corpo de uma requisição.

create or replace function public.fn_copiar_pacote_para_org(p_org_id uuid, p_brand_id uuid)
returns boolean
language plpgsql
security definer
set search_path = public, pg_temp
as $f$
declare
  v_copiou integer;
begin
  if p_org_id is null or p_brand_id is null then
    return false;
  end if;

  update public.organizations o
     set settings = jsonb_set(
           coalesce(o.settings, '{}'::jsonb),
           '{vertical_pack}',
           jsonb_build_object(
             'pack_id',   vp.id,
             'slug',      vp.slug::text,
             'version',   vp.version,
             'seed',      vp.seed,
             'copiado_em', to_char(now() at time zone 'utc', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"')
           ),
           true
         )
    from public.brands b
    join public.vertical_packs vp on vp.id = b.default_pack_id
   where o.id = p_org_id
     and b.id = p_brand_id
     and vp.status = 'active'
     and not (coalesce(o.settings, '{}'::jsonb) ? 'vertical_pack');

  get diagnostics v_copiou = row_count;
  return v_copiou > 0;
end;
$f$;

revoke execute on function public.fn_copiar_pacote_para_org(uuid, uuid) from public, anon, authenticated;
grant  execute on function public.fn_copiar_pacote_para_org(uuid, uuid) to service_role;
