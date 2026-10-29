-- Teste (pgTAP) do RPC de nova versão. `supabase test db`.
begin;
select plan(4);

select has_function(
  'public', 'criar_versao',
  ARRAY['uuid', 'numeric', 'integer', 'text', 'text', 'text', 'text', 'jsonb'],
  'função criar_versao existe'
);

select is(
  (select bool_or(prosecdef) from pg_proc where proname = 'criar_versao'),
  false, 'criar_versao é SECURITY INVOKER'
);

select function_privs_are(
  'public', 'criar_versao',
  ARRAY['uuid', 'numeric', 'integer', 'text', 'text', 'text', 'text', 'jsonb'],
  'authenticated', ARRAY['EXECUTE'],
  'authenticated pode executar criar_versao'
);
select function_privs_are(
  'public', 'criar_versao',
  ARRAY['uuid', 'numeric', 'integer', 'text', 'text', 'text', 'text', 'jsonb'],
  'anon', ARRAY[]::text[],
  'anon não pode executar criar_versao'
);

select * from finish();
rollback;
