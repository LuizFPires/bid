-- Teste de política (pgTAP) do modelo multi-tenant. `supabase test db`.
begin;
select plan(8);

select has_table('public', 'organizacoes', 'tabela organizacoes existe');
select has_table('public', 'membros', 'tabela membros existe');
select has_column('public', 'membros', 'org_id', 'membros tem org_id');

select is(
  (select relrowsecurity from pg_class where oid = 'public.organizacoes'::regclass),
  true, 'RLS habilitado em organizacoes'
);
select is(
  (select relrowsecurity from pg_class where oid = 'public.membros'::regclass),
  true, 'RLS habilitado em membros'
);

select has_function('public', 'is_member', ARRAY['uuid'], 'função is_member existe');

-- trigger de signup presente em auth.users
select isnt(
  (select count(*) from pg_trigger where tgname = 'on_auth_user_created'),
  0::bigint, 'trigger on_auth_user_created existe'
);

-- select de organizacoes é escopado por pertencimento
select ok(
  (select qual from pg_policies
     where schemaname = 'public' and tablename = 'organizacoes' and policyname = 'org_select')
  like '%is_member%',
  'org_select usa is_member (sem vazamento entre orgs)'
);

select * from finish();
rollback;
