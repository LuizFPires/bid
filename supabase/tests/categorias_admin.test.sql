-- Teste (pgTAP) de listar/mesclar categorias. `supabase test db`.
begin;
select plan(5);

select has_function('public', 'listar_categorias', ARRAY[]::text[], 'listar_categorias existe');
select has_function('public', 'mesclar_categoria', ARRAY['text', 'text'], 'mesclar_categoria existe');
select is((select bool_or(prosecdef) from pg_proc where proname in ('listar_categorias', 'mesclar_categoria')),
  false, 'RPCs de categoria são SECURITY INVOKER (RLS do usuário vale)');
select function_privs_are('public', 'mesclar_categoria', ARRAY['text', 'text'],
  'anon', ARRAY[]::text[], 'anon não mescla categorias');
select function_privs_are('public', 'mesclar_categoria', ARRAY['text', 'text'],
  'authenticated', ARRAY['EXECUTE'], 'authenticated mescla categorias');

select * from finish();
rollback;
