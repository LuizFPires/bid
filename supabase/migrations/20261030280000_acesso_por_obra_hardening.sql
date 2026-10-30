-- Endurecimento do acesso por obra (revisão de segurança da 20261030270000).
--
-- 1) guard_obra_soft_delete: recupera a defesa "não apagar obra com propostas"
--    (perdida ao reescrever o guard para "só o dono").
-- 2) certames.obra_id imutável pelo cliente: um certame não pode ser movido de
--    obra (os guards confiam em old.obra_id/old.org_id). criado_por de obras e
--    org_id de tudo já eram imutáveis (force_obra_criador, block_org_change).
-- 3) Buckets `contratos` e `assinaturas`: leitura escopada ao ARQUIVO do contrato
--    a que a pessoa tem acesso (pode_contrato), não à org inteira — um convidado
--    de uma obra não lê PDFs de contratos de outras obras da mesma org. Membros
--    da org continuam lendo tudo da org.

create or replace function public.guard_obra_soft_delete()
returns trigger language plpgsql as $$
begin
  if auth.uid() is not null and (new.deleted_at is distinct from old.deleted_at) then
    if old.criado_por is distinct from auth.uid() then
      raise exception 'apenas quem criou a obra pode apagá-la';
    end if;
    if new.deleted_at is not null and old.deleted_at is null and exists (
      select 1 from public.propostas p
      join public.certames c on c.id = p.certame_id
      where c.obra_id = old.id and p.deleted_at is null
    ) then
      raise exception 'Esta obra tem propostas. Apague as propostas antes de apagar a obra.';
    end if;
  end if;
  return new;
end;
$$;

create or replace function public.block_certame_obra_change()
returns trigger language plpgsql as $$
begin
  if auth.uid() is not null and new.obra_id is distinct from old.obra_id then
    raise exception 'obra_id do certame é imutável';
  end if;
  return new;
end;
$$;
drop trigger if exists trg_certames_obra_immutable on public.certames;
create trigger trg_certames_obra_immutable before update on public.certames
  for each row execute function public.block_certame_obra_change();

-- Storage: leitura por contrato acessível (ou membro da org).
drop policy if exists "bid_contratos_select" on storage.objects;
create policy "bid_contratos_select" on storage.objects
  for select to authenticated
  using (
    bucket_id = 'contratos' and (
      public.is_member(((storage.foldername(name))[1])::uuid)
      or exists (
        select 1 from public.contratos k
         where k.pdf_path = storage.objects.name and public.pode_contrato(k.id))));

drop policy if exists "bid_assinaturas_select" on storage.objects;
create policy "bid_assinaturas_select" on storage.objects
  for select to authenticated
  using (
    bucket_id = 'assinaturas' and (
      public.is_member(((storage.foldername(name))[1])::uuid)
      or exists (
        select 1 from public.assinaturas a
         where a.assinatura_img_path = storage.objects.name and public.pode_contrato(a.contrato_id))));
