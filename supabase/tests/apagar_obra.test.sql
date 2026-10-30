-- Teste (pgTAP) do apagar/restaurar obra. `supabase test db`.
begin;
select plan(9);

select has_column('public', 'obras', 'criado_por', 'obras tem criado_por');
select has_function('public', 'apagar_obra', ARRAY['uuid'], 'apagar_obra existe');
select has_function('public', 'restaurar_obra', ARRAY['uuid'], 'restaurar_obra existe');

select is((select bool_or(prosecdef) from pg_proc where proname = 'apagar_obra'),
  false, 'apagar_obra é SECURITY INVOKER');

select function_privs_are('public', 'apagar_obra', ARRAY['uuid'],
  'authenticated', ARRAY['EXECUTE'], 'authenticated executa apagar_obra');
select function_privs_are('public', 'apagar_obra', ARRAY['uuid'],
  'anon', ARRAY[]::text[], 'anon não executa apagar_obra');

-- Guard de obra (gestor OU criador) e trigger de criador presentes.
select isnt((select count(*) from pg_trigger where tgname = 'trg_obras_guard_del'),
  0::bigint, 'guard de soft-delete em obras presente');
select isnt((select count(*) from pg_trigger where tgname = 'trg_obras_criador'),
  0::bigint, 'trigger que força criado_por presente');

-- obras segue com soft-delete (sem DELETE direto pelo cliente).
select is((select count(*)::int from pg_policies
    where schemaname='public' and tablename='obras' and cmd='DELETE'),
  0, 'obras não tem policy de DELETE direto');

select * from finish();
rollback;
