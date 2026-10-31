-- Teste (pgTAP) dos RPCs de editar/apagar/restaurar proposta. `supabase test db`.
begin;
select plan(14);

-- mover_proposta_categoria (20261030310000): existe, invoker, só authenticated.
select has_function('public', 'mover_proposta_categoria', ARRAY['uuid', 'text'], 'mover_proposta_categoria existe');
select is((select bool_or(prosecdef) from pg_proc where proname = 'mover_proposta_categoria'),
  false, 'mover_proposta_categoria é SECURITY INVOKER');
select function_privs_are('public', 'mover_proposta_categoria', ARRAY['uuid', 'text'],
  'anon', ARRAY[]::text[], 'anon não executa mover_proposta_categoria');

-- Existência.
select has_function('public', 'editar_proposta',
  ARRAY['uuid', 'text', 'numeric', 'integer', 'text', 'text', 'text'],
  'editar_proposta existe');
select has_function('public', 'apagar_proposta', ARRAY['uuid'], 'apagar_proposta existe');
select has_function('public', 'restaurar_proposta', ARRAY['uuid'], 'restaurar_proposta existe');

-- SECURITY INVOKER (RLS + guard_soft_delete continuam valendo).
select is((select bool_or(prosecdef) from pg_proc where proname = 'editar_proposta'),
  false, 'editar_proposta é SECURITY INVOKER');
select is((select bool_or(prosecdef) from pg_proc where proname = 'apagar_proposta'),
  false, 'apagar_proposta é SECURITY INVOKER');
select is((select bool_or(prosecdef) from pg_proc where proname = 'restaurar_proposta'),
  false, 'restaurar_proposta é SECURITY INVOKER');

-- Privilégios: authenticated executa; anon não.
select function_privs_are('public', 'editar_proposta',
  ARRAY['uuid', 'text', 'numeric', 'integer', 'text', 'text', 'text'],
  'authenticated', ARRAY['EXECUTE'], 'authenticated executa editar_proposta');
select function_privs_are('public', 'editar_proposta',
  ARRAY['uuid', 'text', 'numeric', 'integer', 'text', 'text', 'text'],
  'anon', ARRAY[]::text[], 'anon não executa editar_proposta');
select function_privs_are('public', 'apagar_proposta', ARRAY['uuid'],
  'authenticated', ARRAY['EXECUTE'], 'authenticated executa apagar_proposta');
select function_privs_are('public', 'apagar_proposta', ARRAY['uuid'],
  'anon', ARRAY[]::text[], 'anon não executa apagar_proposta');

-- Política de exclusão lógica: o guard de soft delete (só gestor) está no lugar
-- e cobre o caminho do apagar/restaurar (que só mexem em deleted_at).
select isnt((select count(*) from pg_trigger where tgname = 'trg_propostas_guard_del'),
  0::bigint, 'guard_soft_delete (só gestor) protege o apagar/restaurar');

select * from finish();
rollback;
