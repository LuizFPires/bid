-- Teste (pgTAP) de contratos. `supabase test db`.
begin;
select plan(12);

select has_table('public', 'contratos', 'tabela contratos existe');
select has_table('public', 'contrato_clausulas', 'tabela contrato_clausulas existe');
select has_column('public', 'contratos', 'org_id', 'contratos tem org_id');
select has_column('public', 'contratos', 'pdf_path', 'contratos tem pdf_path');

select is((select relrowsecurity from pg_class where oid = 'public.contratos'::regclass), true, 'RLS em contratos');
select is((select relrowsecurity from pg_class where oid = 'public.contrato_clausulas'::regclass), true, 'RLS em contrato_clausulas');

select ok(
  (select qual from pg_policies where schemaname='public' and tablename='contratos' and policyname='contratos_select') like '%is_member%',
  'contratos_select usa is_member'
);
select is(
  (select count(*) from pg_policies where schemaname='public' and tablename in ('contratos','contrato_clausulas') and cmd='DELETE'),
  0::bigint, 'sem policy de DELETE (exclusão lógica)'
);

-- Storage: INSERT no bucket contratos escopado ao dono.
select isnt(
  (select count(*) from pg_policies where schemaname='storage' and tablename='objects' and policyname='bid_contratos_insert'),
  0::bigint, 'policy de INSERT em contratos (storage) existe'
);

-- RPC.
select has_function('public', 'criar_contrato', ARRAY['uuid', 'jsonb'], 'criar_contrato existe');
select is((select bool_or(prosecdef) from pg_proc where proname = 'criar_contrato'), false, 'criar_contrato é SECURITY INVOKER');
select function_privs_are('public', 'criar_contrato', ARRAY['uuid', 'jsonb'], 'anon', ARRAY[]::text[], 'anon não executa criar_contrato');

select * from finish();
rollback;
