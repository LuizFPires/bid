-- Correção urgente (01/11, homologação): a migration 190000 tirou o SELECT de
-- tabela de `assinaturas` para o cliente (grant só por coluna). A policy do
-- Storage `bid_assinaturas_select` consulta essa tabela e passou a falhar com
-- "permission denied for table assinaturas" — e como todas as policies de
-- storage.objects são avaliadas, QUALQUER leitura de arquivo pelo usuário
-- (propostas, contratos) quebrou. Solução: a policy e o trigger legado que
-- leem `assinaturas` passam a rodar como SECURITY DEFINER (só leitura).
create or replace function public.assinatura_img_visivel(p_name text)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.assinaturas a
     where a.assinatura_img_path = p_name and public.pode_contrato(a.contrato_id)
  );
$$;
revoke all on function public.assinatura_img_visivel(text) from public, anon;
grant execute on function public.assinatura_img_visivel(text) to authenticated;

drop policy if exists "bid_assinaturas_select" on storage.objects;
create policy "bid_assinaturas_select" on storage.objects
  for select to authenticated
  using (bucket_id = 'assinaturas' and (public.is_member(((storage.foldername(name))[1])::uuid) or public.assinatura_img_visivel(name)));

-- Trigger legado (M7): não editar cláusulas depois de assinatura — lê assinaturas.
create or replace function public.block_clausula_pos_assinatura()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is not null and exists (
    select 1 from public.assinaturas a
    where a.contrato_id in (new.contrato_id, old.contrato_id)
      and a.assinado_em is not null
  ) then
    raise exception 'o contrato já tem assinatura: não é possível editar cláusulas';
  end if;
  return coalesce(new, old);
end;
$$;
