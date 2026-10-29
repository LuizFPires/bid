-- Teste (pgTAP) dos RPCs de vencedora. `supabase test db`.
begin;
select plan(6);

select has_function('public', 'definir_vencedora', ARRAY['uuid'], 'definir_vencedora existe');
select has_function('public', 'desfazer_vencedora', ARRAY['uuid', 'uuid', 'text', 'text'], 'desfazer_vencedora existe');

select is(
  (select bool_or(prosecdef) from pg_proc where proname = 'definir_vencedora'),
  false, 'definir_vencedora é SECURITY INVOKER'
);
select is(
  (select bool_or(prosecdef) from pg_proc where proname = 'desfazer_vencedora'),
  false, 'desfazer_vencedora é SECURITY INVOKER'
);

select function_privs_are('public', 'definir_vencedora', ARRAY['uuid'],
  'anon', ARRAY[]::text[], 'anon não executa definir_vencedora');
select function_privs_are('public', 'desfazer_vencedora', ARRAY['uuid', 'uuid', 'text', 'text'],
  'authenticated', ARRAY['EXECUTE'], 'authenticated executa desfazer_vencedora');

select * from finish();
rollback;
