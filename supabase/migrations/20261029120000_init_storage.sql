-- M0 · Fundação: extensões e buckets privados de Storage com RLS.
-- Buckets privados; download sempre por URL assinada. O modelo de dados
-- (obras, certames, propostas…) e o escopo por organização entram no M1.
--
-- Escopo de segurança no M0 (baseline sem org ainda): cada objeto pertence a
-- quem o enviou (storage.objects.owner_id = auth.uid()). O cliente só acessa
-- os próprios arquivos; o servidor (service_role) ignora a RLS para gerar URLs
-- assinadas e gravar artefatos. No M1 o SELECT de propostas/contratos passa a
-- ser por participação na organização/obra.

create extension if not exists "pgcrypto" with schema "extensions";

-- Buckets privados.
insert into storage.buckets (id, name, public)
values
  ('propostas', 'propostas', false),
  ('contratos', 'contratos', false),
  ('assinaturas', 'assinaturas', false)
on conflict (id) do nothing;

-- storage.objects já vem com RLS habilitado no Supabase; definimos as políticas.

-- limpa políticas anteriores (idempotente)
drop policy if exists "bid_storage_select" on storage.objects;
drop policy if exists "bid_storage_insert" on storage.objects;
drop policy if exists "bid_storage_update" on storage.objects;
drop policy if exists "bid_storage_delete" on storage.objects;

-- propostas: o dono (quem enviou) gerencia seus arquivos.
drop policy if exists "bid_propostas_select" on storage.objects;
create policy "bid_propostas_select" on storage.objects
  for select to authenticated
  using (bucket_id = 'propostas' and owner_id = (select auth.uid()::text));

drop policy if exists "bid_propostas_insert" on storage.objects;
create policy "bid_propostas_insert" on storage.objects
  for insert to authenticated
  with check (bucket_id = 'propostas' and owner_id = (select auth.uid()::text));

drop policy if exists "bid_propostas_update" on storage.objects;
create policy "bid_propostas_update" on storage.objects
  for update to authenticated
  using (bucket_id = 'propostas' and owner_id = (select auth.uid()::text))
  with check (bucket_id = 'propostas' and owner_id = (select auth.uid()::text));

drop policy if exists "bid_propostas_delete" on storage.objects;
create policy "bid_propostas_delete" on storage.objects
  for delete to authenticated
  using (bucket_id = 'propostas' and owner_id = (select auth.uid()::text));

-- contratos: PDFs são gerados pelo servidor (service_role, ignora RLS). O
-- cliente baixa via URL assinada; damos apenas SELECT do próprio objeto.
drop policy if exists "bid_contratos_select" on storage.objects;
create policy "bid_contratos_select" on storage.objects
  for select to authenticated
  using (bucket_id = 'contratos' and owner_id = (select auth.uid()::text));

-- assinaturas: trilha imutável, gravada só pelo servidor (service_role). Sem
-- políticas de cliente => negado por padrão para usuários autenticados.
