-- Teste (pgTAP) dos RPCs de equipe/membros. `supabase test db`.
begin;
select plan(13);

-- Existência.
select has_function('public', 'listar_membros', ARRAY['uuid'], 'listar_membros existe');
select has_function('public', 'adicionar_membro', ARRAY['uuid', 'text', 'text'], 'adicionar_membro existe');
select has_function('public', 'mudar_papel_membro', ARRAY['uuid', 'uuid', 'text'], 'mudar_papel_membro existe');
select has_function('public', 'remover_membro', ARRAY['uuid', 'uuid'], 'remover_membro existe');

-- SECURITY DEFINER (precisam ler auth.users e escrever membros com o gate is_gestor).
select is((select bool_or(prosecdef) from pg_proc where proname = 'adicionar_membro'),
  true, 'adicionar_membro é SECURITY DEFINER');
select is((select bool_or(prosecdef) from pg_proc where proname = 'remover_membro'),
  true, 'remover_membro é SECURITY DEFINER');

-- Privilégios: authenticated executa; anon não.
select function_privs_are('public', 'adicionar_membro', ARRAY['uuid', 'text', 'text'],
  'authenticated', ARRAY['EXECUTE'], 'authenticated executa adicionar_membro');
select function_privs_are('public', 'adicionar_membro', ARRAY['uuid', 'text', 'text'],
  'anon', ARRAY[]::text[], 'anon não executa adicionar_membro');
select function_privs_are('public', 'remover_membro', ARRAY['uuid', 'uuid'],
  'authenticated', ARRAY['EXECUTE'], 'authenticated executa remover_membro');
select function_privs_are('public', 'listar_membros', ARRAY['uuid'],
  'anon', ARRAY[]::text[], 'anon não executa listar_membros');

-- Política de membros: sem INSERT/UPDATE/DELETE direto pelo cliente (só via RPC).
select is((select count(*)::int from pg_policies
    where schemaname='public' and tablename='membros' and cmd in ('INSERT','UPDATE','DELETE')),
  0, 'membros não tem policy de escrita direta (gestão só por RPC)');
select is((select count(*)::int from pg_policies
    where schemaname='public' and tablename='membros' and cmd='SELECT'),
  1, 'membros tem policy de SELECT por pertencimento');

-- RLS habilitado em membros.
select ok((select relrowsecurity from pg_class where oid = 'public.membros'::regclass),
  'RLS habilitado em membros');

select * from finish();
rollback;
