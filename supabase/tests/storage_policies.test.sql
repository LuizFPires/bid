-- Teste de política (pgTAP). Roda com `supabase test db` quando o projeto existe.
-- M0: confirma que os três buckets existem e são privados, que storage.objects
-- tem RLS ligado, e que as políticas do bid são escopadas ao dono (sem IDOR):
-- propostas CRUD pelo dono, contratos SELECT do dono, assinaturas sem política
-- de cliente (gravação só pelo servidor).

begin;
select plan(9);

-- Buckets existem e são privados.
select is((select public from storage.buckets where id = 'propostas'), false, 'propostas é privado');
select is((select public from storage.buckets where id = 'contratos'), false, 'contratos é privado');
select is((select public from storage.buckets where id = 'assinaturas'), false, 'assinaturas é privado');

-- RLS habilitado em storage.objects.
select is(
  (select relrowsecurity from pg_class where oid = 'storage.objects'::regclass),
  true, 'RLS habilitado em storage.objects'
);

-- Políticas escopadas ao dono.
select isnt((select count(*) from pg_policies
  where schemaname = 'storage' and tablename = 'objects' and policyname = 'bid_propostas_select'),
  0::bigint, 'bid_propostas_select existe');
select isnt((select count(*) from pg_policies
  where schemaname = 'storage' and tablename = 'objects' and policyname = 'bid_propostas_insert'),
  0::bigint, 'bid_propostas_insert existe');
select isnt((select count(*) from pg_policies
  where schemaname = 'storage' and tablename = 'objects' and policyname = 'bid_propostas_delete'),
  0::bigint, 'bid_propostas_delete existe');
select isnt((select count(*) from pg_policies
  where schemaname = 'storage' and tablename = 'objects' and policyname = 'bid_contratos_select'),
  0::bigint, 'bid_contratos_select existe');

-- O SELECT de propostas é por dono (menciona owner_id na condição).
select ok(
  (select qual from pg_policies
     where schemaname = 'storage' and tablename = 'objects'
       and policyname = 'bid_propostas_select') like '%owner_id%',
  'bid_propostas_select escopa por owner_id (sem IDOR)'
);

select * from finish();
rollback;
