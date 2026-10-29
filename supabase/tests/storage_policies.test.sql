-- Teste de política (pgTAP). Roda com `supabase test db` quando o projeto existe.
-- M0: confirma que os três buckets existem e são privados, e que storage.objects
-- tem RLS ligado com as políticas do bid.

begin;
select plan(8);

-- Buckets existem e são privados.
select is(
  (select public from storage.buckets where id = 'propostas'),
  false, 'bucket propostas é privado'
);
select is(
  (select public from storage.buckets where id = 'contratos'),
  false, 'bucket contratos é privado'
);
select is(
  (select public from storage.buckets where id = 'assinaturas'),
  false, 'bucket assinaturas é privado'
);

-- RLS habilitado em storage.objects.
select is(
  (select relrowsecurity from pg_class where oid = 'storage.objects'::regclass),
  true, 'RLS habilitado em storage.objects'
);

-- Políticas do bid presentes.
select isnt(
  (select count(*) from pg_policies
     where schemaname = 'storage' and tablename = 'objects'
       and policyname = 'bid_storage_select'),
  0::bigint, 'política bid_storage_select existe'
);
select isnt(
  (select count(*) from pg_policies
     where schemaname = 'storage' and tablename = 'objects'
       and policyname = 'bid_storage_insert'),
  0::bigint, 'política bid_storage_insert existe'
);
select isnt(
  (select count(*) from pg_policies
     where schemaname = 'storage' and tablename = 'objects'
       and policyname = 'bid_storage_update'),
  0::bigint, 'política bid_storage_update existe'
);
select isnt(
  (select count(*) from pg_policies
     where schemaname = 'storage' and tablename = 'objects'
       and policyname = 'bid_storage_delete'),
  0::bigint, 'política bid_storage_delete existe'
);

select * from finish();
rollback;
