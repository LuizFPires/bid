-- Teste (pgTAP) de assinaturas. `supabase test db`.
begin;
select plan(10);

select has_table('public', 'assinaturas', 'tabela assinaturas existe');
select has_column('public', 'assinaturas', 'token_hash', 'assinaturas guarda token_hash (não o token em claro)');
select hasnt_column('public', 'assinaturas', 'token', 'não há coluna token em claro');
select has_column('public', 'assinaturas', 'doc_hash', 'assinaturas tem doc_hash (trilha)');
select is((select relrowsecurity from pg_class where oid = 'public.assinaturas'::regclass), true, 'RLS em assinaturas');

-- Cliente só LÊ: sem policies de INSERT/UPDATE/DELETE (escrita é server-only).
select is(
  (select count(*) from pg_policies where schemaname='public' and tablename='assinaturas' and cmd in ('INSERT','UPDATE','DELETE')),
  0::bigint, 'assinaturas sem INSERT/UPDATE/DELETE de cliente (trilha server-only)'
);
select ok(
  (select qual from pg_policies where schemaname='public' and tablename='assinaturas' and policyname='assinaturas_select') like '%is_member%',
  'assinaturas_select usa is_member'
);

-- Uma assinatura por parte do contrato.
select ok(
  (select count(*) from pg_constraint
    where conrelid = 'public.assinaturas'::regclass and contype = 'u'
      and conkey = (select array_agg(attnum order by attnum) from pg_attribute
                    where attrelid = 'public.assinaturas'::regclass and attname in ('contrato_id','parte'))
  ) >= 1,
  'unique (contrato_id, parte)'
);

-- RPC de token: existe e anon não executa.
select has_function('public', 'gerar_token_assinatura', ARRAY['uuid', 'text', 'text'], 'gerar_token_assinatura existe');
select function_privs_are('public', 'gerar_token_assinatura', ARRAY['uuid', 'text', 'text'], 'anon', ARRAY[]::text[], 'anon não executa gerar_token_assinatura');

select * from finish();
rollback;
