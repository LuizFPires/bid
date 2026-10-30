-- Teste (pgTAP) de assinaturas. `supabase test db`.
begin;
select plan(10);

select has_table('public', 'assinaturas', 'tabela assinaturas existe');
select has_column('public', 'assinaturas', 'token', 'assinaturas tem token');
select has_column('public', 'assinaturas', 'doc_hash', 'assinaturas tem doc_hash (trilha)');
select is((select relrowsecurity from pg_class where oid = 'public.assinaturas'::regclass), true, 'RLS em assinaturas');

select ok(
  (select qual from pg_policies where schemaname='public' and tablename='assinaturas' and policyname='assinaturas_select') like '%is_member%',
  'assinaturas_select usa is_member'
);
select is(
  (select count(*) from pg_policies where schemaname='public' and tablename='assinaturas' and cmd='DELETE'),
  0::bigint, 'assinaturas sem DELETE (trilha imutável)'
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

-- Storage do bucket assinaturas (upload pela org).
select isnt(
  (select count(*) from pg_policies where schemaname='storage' and tablename='objects' and policyname='bid_assinaturas_insert'),
  0::bigint, 'policy de INSERT em assinaturas (storage) existe'
);

-- RPC de token.
select has_function('public', 'gerar_token_assinatura', ARRAY['uuid', 'text', 'text'], 'gerar_token_assinatura existe');
select function_privs_are('public', 'gerar_token_assinatura', ARRAY['uuid', 'text', 'text'], 'anon', ARRAY[]::text[], 'anon não executa gerar_token_assinatura');

select * from finish();
rollback;
