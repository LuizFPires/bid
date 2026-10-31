-- Teste (pgTAP) do apagar/restaurar equalização e contrato. `supabase test db`.
begin;
select plan(8);

select has_function('public', 'apagar_equalizacao', ARRAY['uuid'], 'apagar_equalizacao existe');
select has_function('public', 'restaurar_equalizacao', ARRAY['uuid'], 'restaurar_equalizacao existe');
select has_function('public', 'apagar_contrato', ARRAY['uuid'], 'apagar_contrato existe');
select has_function('public', 'restaurar_contrato', ARRAY['uuid'], 'restaurar_contrato existe');

select is((select bool_or(prosecdef) from pg_proc
           where proname in ('apagar_equalizacao', 'restaurar_equalizacao', 'apagar_contrato', 'restaurar_contrato')),
  false, 'RPCs de apagar/restaurar são SECURITY INVOKER');
select function_privs_are('public', 'apagar_contrato', ARRAY['uuid'],
  'anon', ARRAY[]::text[], 'anon não executa apagar_contrato');

-- Guards específicos presentes; contrato assinado não se apaga (texto do guard).
select isnt((select count(*) from pg_trigger where tgname = 'trg_equalizacoes_guard_del'), 0::bigint,
  'guard de soft-delete em equalizacoes presente');
select ok((select prosrc like '%Contrato assinado não pode ser excluído%' from pg_proc where proname = 'guard_contrato_soft_delete'),
  'guard de contrato bloqueia exclusão de assinado');

select * from finish();
rollback;
