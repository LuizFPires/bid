-- Teste (pgTAP) da equalização. `supabase test db`.
begin;
select plan(9);

select has_table('public', 'equalizacoes', 'tabela equalizacoes existe');
select has_column('public', 'equalizacoes', 'org_id', 'equalizacoes tem org_id');
select has_column('public', 'equalizacoes', 'resultado_ia', 'equalizacoes tem resultado_ia');

select is(
  (select relrowsecurity from pg_class where oid = 'public.equalizacoes'::regclass),
  true, 'RLS habilitado em equalizacoes'
);

-- select escopado por pertencimento.
select ok(
  (select qual from pg_policies where schemaname='public' and tablename='equalizacoes' and policyname='equalizacoes_select')
  like '%is_member%',
  'equalizacoes_select usa is_member'
);

-- exclusão é lógica: sem policy de DELETE.
select is(
  (select count(*) from pg_policies where schemaname='public' and tablename='equalizacoes' and cmd='DELETE'),
  0::bigint, 'equalizacoes não tem policy de DELETE'
);

-- RPC criar_equalizacao.
select has_function(
  'public', 'criar_equalizacao', ARRAY['text', 'text', 'uuid', 'uuid[]', 'text'],
  'função criar_equalizacao existe'
);
select is(
  (select bool_or(prosecdef) from pg_proc where proname = 'criar_equalizacao'),
  false, 'criar_equalizacao é SECURITY INVOKER'
);
select function_privs_are(
  'public', 'criar_equalizacao', ARRAY['text', 'text', 'uuid', 'uuid[]', 'text'],
  'anon', ARRAY[]::text[], 'anon não executa criar_equalizacao'
);

select * from finish();
rollback;
