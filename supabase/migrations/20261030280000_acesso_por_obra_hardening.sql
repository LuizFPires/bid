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

-- 4) eventos: um convidado só lê eventos das entidades a que tem acesso (ou os
--    que ele mesmo gerou); membros da org seguem lendo tudo da org.
drop policy if exists "eventos_select" on public.eventos;
create policy "eventos_select" on public.eventos
  for select to authenticated using (
    public.is_member(org_id)
    or autor = auth.uid()
    or (entidade = 'obra' and public.pode_obra(entidade_id))
    or (entidade = 'proposta' and public.pode_proposta(entidade_id))
    or (entidade = 'contrato' and public.pode_contrato(entidade_id)));

-- 5) equalizações ENTRE OBRAS (sem certame): só membro da org ou quem criou —
--    não basta colaborar em uma obra qualquer da org.
drop policy if exists "equalizacoes_select" on public.equalizacoes;
drop policy if exists "equalizacoes_insert" on public.equalizacoes;
drop policy if exists "equalizacoes_update" on public.equalizacoes;
create policy "equalizacoes_select" on public.equalizacoes
  for select to authenticated using (
    case when certame_id is not null then public.pode_certame(certame_id)
         else (public.is_member(org_id) or criado_por = auth.uid()) end);
create policy "equalizacoes_insert" on public.equalizacoes
  for insert to authenticated with check (
    case when certame_id is not null then public.pode_certame(certame_id)
         else (public.is_member(org_id) or criado_por = auth.uid()) end);
create policy "equalizacoes_update" on public.equalizacoes
  for update to authenticated
  using (case when certame_id is not null then public.pode_certame(certame_id)
              else (public.is_member(org_id) or criado_por = auth.uid()) end)
  with check (case when certame_id is not null then public.pode_certame(certame_id)
                   else (public.is_member(org_id) or criado_por = auth.uid()) end);

-- 6) proposta_versoes.arquivo_path: o cliente só pode apontar para um arquivo que
--    ELE enviou (dono do objeto no bucket `propostas`), e o caminho é imutável —
--    fecha o uso de uma versão forjada para ler arquivo alheio via policy de storage.
create or replace function public.check_versao_arquivo()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null then return new; end if;  -- servidor: livre
  if tg_op = 'UPDATE' and new.arquivo_path is distinct from old.arquivo_path then
    raise exception 'arquivo_path da versão é imutável';
  end if;
  if tg_op = 'INSERT' and new.arquivo_path is not null and not exists (
    select 1 from storage.objects o
     where o.bucket_id = 'propostas' and o.name = new.arquivo_path
       and o.owner_id = auth.uid()::text
  ) then
    raise exception 'arquivo da proposta não encontrado entre os seus uploads';
  end if;
  return new;
end;
$$;
drop trigger if exists trg_versoes_arquivo on public.proposta_versoes;
create trigger trg_versoes_arquivo before insert or update on public.proposta_versoes
  for each row execute function public.check_versao_arquivo();

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
