-- M0 · Fundação: extensões e buckets privados de Storage com RLS.
-- A regra: buckets privados, acesso só por usuário autenticado e via URL
-- assinada. O modelo de dados (obras, certames, propostas…) entra no M1.

create extension if not exists "pgcrypto" with schema "extensions";

-- Buckets privados.
insert into storage.buckets (id, name, public)
values
  ('propostas', 'propostas', false),
  ('contratos', 'contratos', false),
  ('assinaturas', 'assinaturas', false)
on conflict (id) do nothing;

-- storage.objects já vem com RLS habilitado no Supabase; definimos as políticas.
-- No M0, acesso restrito a usuários autenticados nos três buckets do bid.
-- O escopo por organização é refinado no M1, junto com o modelo de dados.

drop policy if exists "bid_storage_select" on storage.objects;
create policy "bid_storage_select" on storage.objects
  for select to authenticated
  using (bucket_id in ('propostas', 'contratos', 'assinaturas'));

drop policy if exists "bid_storage_insert" on storage.objects;
create policy "bid_storage_insert" on storage.objects
  for insert to authenticated
  with check (bucket_id in ('propostas', 'contratos', 'assinaturas'));

drop policy if exists "bid_storage_update" on storage.objects;
create policy "bid_storage_update" on storage.objects
  for update to authenticated
  using (bucket_id in ('propostas', 'contratos', 'assinaturas'))
  with check (bucket_id in ('propostas', 'contratos', 'assinaturas'));

drop policy if exists "bid_storage_delete" on storage.objects;
create policy "bid_storage_delete" on storage.objects
  for delete to authenticated
  using (bucket_id in ('propostas', 'contratos', 'assinaturas'));
