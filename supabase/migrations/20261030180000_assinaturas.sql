-- M7 · Assinatura eletrônica simples. Tabela assinaturas (uma por parte do
-- contrato), token de uso único para o link externo, trilha de auditoria.
-- A aplicação ao PDF e o registro da trilha acontecem nas funções de servidor;
-- aqui ficam a tabela, a RLS, a geração de token e as policies de storage.

create table if not exists public.assinaturas (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizacoes(id) on delete cascade,
  contrato_id uuid not null,
  parte text not null check (parte in ('contratante', 'contratada')),
  signatario_nome text,
  assinatura_img_path text,
  via text check (via in ('app', 'link')),
  token text unique,
  token_expira timestamptz,
  assinado_em timestamptz,
  ip text,
  user_agent text,
  doc_hash text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (contrato_id, parte),
  foreign key (contrato_id, org_id) references public.contratos(id, org_id) on delete cascade
);
create index if not exists idx_assinaturas_contrato on public.assinaturas(contrato_id);

create trigger trg_assinaturas_updated before update on public.assinaturas
  for each row execute function public.set_updated_at();
create trigger trg_assinaturas_org_immutable before update on public.assinaturas
  for each row execute function public.block_org_change();

-- RLS: membros da org leem e lançam (assinatura no app). O fluxo de LINK externo
-- roda via service_role (assinante sem login), que ignora a RLS. Sem DELETE.
alter table public.assinaturas enable row level security;
create policy "assinaturas_select" on public.assinaturas
  for select to authenticated using (public.is_member(org_id));
create policy "assinaturas_insert" on public.assinaturas
  for insert to authenticated with check (public.is_member(org_id));
create policy "assinaturas_update" on public.assinaturas
  for update to authenticated using (public.is_member(org_id)) with check (public.is_member(org_id));

-- Storage do bucket privado `assinaturas`: upload/leitura por pertencimento à
-- org (caminho {org_id}/...), para a assinatura no app. O M0 deixava sem policy
-- de cliente (só server). O link externo grava via service_role.
drop policy if exists "bid_assinaturas_insert" on storage.objects;
create policy "bid_assinaturas_insert" on storage.objects
  for insert to authenticated
  with check (bucket_id = 'assinaturas' and public.is_member(((storage.foldername(name))[1])::uuid));
drop policy if exists "bid_assinaturas_select" on storage.objects;
create policy "bid_assinaturas_select" on storage.objects
  for select to authenticated
  using (bucket_id = 'assinaturas' and public.is_member(((storage.foldername(name))[1])::uuid));

-- Gera (ou recria) o token de assinatura por LINK de uma parte. Uso único:
-- a função de assinatura externa o invalida ao concluir. Expira em 7 dias.
create or replace function public.gerar_token_assinatura(
  p_contrato uuid,
  p_parte text,
  p_signatario text
) returns text
language plpgsql
security invoker
set search_path = public, extensions
as $$
declare
  v_org uuid;
  v_token text;
  v_assinado timestamptz;
begin
  if p_parte not in ('contratante', 'contratada') then
    raise exception 'parte inválida';
  end if;
  select org_id into v_org from public.contratos where id = p_contrato and deleted_at is null;
  if v_org is null then raise exception 'contrato não encontrado'; end if;

  -- Já assinou? Não emite token (uso único, não reabre).
  select assinado_em into v_assinado from public.assinaturas
    where contrato_id = p_contrato and parte = p_parte;
  if v_assinado is not null then raise exception 'esta parte já assinou'; end if;

  v_token := encode(extensions.gen_random_bytes(24), 'hex');

  insert into public.assinaturas (org_id, contrato_id, parte, signatario_nome, via, token, token_expira)
    values (v_org, p_contrato, p_parte, nullif(btrim(p_signatario), ''), 'link', v_token, now() + interval '7 days')
  on conflict (contrato_id, parte) do update
    set token = excluded.token,
        token_expira = excluded.token_expira,
        signatario_nome = coalesce(excluded.signatario_nome, public.assinaturas.signatario_nome),
        via = 'link';

  return v_token;
end;
$$;

revoke all on function public.gerar_token_assinatura(uuid, text, text) from public, anon;
grant execute on function public.gerar_token_assinatura(uuid, text, text) to authenticated;
