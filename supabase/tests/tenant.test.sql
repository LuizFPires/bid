-- Teste de política (pgTAP) do modelo multi-tenant. `supabase test db`.
begin;
select plan(12);

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
select has_function('public', 'is_gestor', ARRAY['uuid'], 'função is_gestor existe');
select has_function('public', 'create_org', ARRAY['text'], 'função create_org existe');

-- Criação só por RPC/trigger: sem INSERT direto pelo cliente.
select is(
  (select count(*) from pg_policies
    where schemaname='public' and tablename='membros' and cmd='INSERT'),
  0::bigint, 'membros não tem policy de INSERT pelo cliente'
);
select is(
  (select count(*) from pg_policies
    where schemaname='public' and tablename='organizacoes' and cmd='INSERT'),
  0::bigint, 'organizacoes não tem policy de INSERT pelo cliente'
);
-- org_update exige gestor.
select ok(
  (select qual from pg_policies where schemaname='public' and tablename='organizacoes' and policyname='org_update')
  like '%is_gestor%',
  'org_update exige is_gestor'
);

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
