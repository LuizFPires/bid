-- M7 · Assinatura eletrônica simples. Tabela assinaturas (uma por parte do
-- contrato) + trilha de auditoria. INTEGRIDADE: o cliente NÃO grava a trilha —
-- os campos de assinatura (assinado_em, ip, user_agent, doc_hash, imagem, token)
-- são escritos SÓ pelo servidor (service_role), nas funções de assinatura, que
-- os calculam de forma autoritativa. O cliente só LÊ (membros da org). Assim um
-- membro não pode forjar uma assinatura/auditoria.

create table if not exists public.assinaturas (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizacoes(id) on delete cascade,
  contrato_id uuid not null,
  parte text not null check (parte in ('contratante', 'contratada')),
  signatario_nome text,
  assinatura_img_path text,
  via text check (via in ('app', 'link')),
  token_hash text unique,       -- guarda só o hash; o token em claro sai 1x do RPC
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

-- RLS: membros LEEM (para ver o status). Sem INSERT/UPDATE/DELETE de cliente —
-- toda escrita é do servidor (service_role), que ignora a RLS.
alter table public.assinaturas enable row level security;
create policy "assinaturas_select" on public.assinaturas
  for select to authenticated using (public.is_member(org_id));

-- Storage do bucket privado `assinaturas`: SELECT por pertencimento à org (para
-- exibir a assinatura, se preciso). O upload da imagem é feito pelo servidor
-- (service_role) — sem policy de INSERT de cliente.
drop policy if exists "bid_assinaturas_select" on storage.objects;
create policy "bid_assinaturas_select" on storage.objects
  for select to authenticated
  using (bucket_id = 'assinaturas' and public.is_member(((storage.foldername(name))[1])::uuid));

-- Gera o token de assinatura por LINK de uma parte. SECURITY DEFINER (grava a
-- linha, que não tem policy de cliente) com checagem EXPLÍCITA de pertencimento.
-- Guarda só o hash do token; devolve o token em claro uma única vez. Uso único:
-- a função de assinatura externa o invalida ao concluir. Expira em 7 dias.
create or replace function public.gerar_token_assinatura(
  p_contrato uuid,
  p_parte text,
  p_signatario text
) returns text
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_org uuid;
  v_token text;
  v_assinado timestamptz;
begin
  -- O link externo é só para a CONTRATADA (fornecedor). A CONTRATANTE (a org)
  -- assina no app. Mantém a separação dos dois caminhos (não emite link da
  -- contratante nem por chamada direta ao RPC).
  if p_parte <> 'contratada' then
    raise exception 'o link de assinatura é apenas para a contratada';
  end if;
  select org_id into v_org from public.contratos where id = p_contrato and deleted_at is null;
  if v_org is null then raise exception 'contrato não encontrado'; end if;
  -- DEFINER ignora a RLS: autorizar explicitamente o chamador.
  if not public.is_member(v_org) then raise exception 'sem acesso a este contrato'; end if;

  select assinado_em into v_assinado from public.assinaturas
    where contrato_id = p_contrato and parte = p_parte;
  if v_assinado is not null then raise exception 'esta parte já assinou'; end if;

  v_token := encode(extensions.gen_random_bytes(24), 'hex');

  insert into public.assinaturas (org_id, contrato_id, parte, signatario_nome, via, token_hash, token_expira)
    values (v_org, p_contrato, p_parte, nullif(btrim(p_signatario), ''), 'link',
            encode(extensions.digest(v_token, 'sha256'), 'hex'), now() + interval '7 days')
  on conflict (contrato_id, parte) do update
    set token_hash = excluded.token_hash,
        token_expira = excluded.token_expira,
        signatario_nome = coalesce(excluded.signatario_nome, public.assinaturas.signatario_nome),
        via = 'link';

  -- Auditoria: registra QUEM gerou o link (autor = auth.uid(), via trigger).
  -- (Assinatura eletrônica SIMPLES — regra #9: vincular o token à identidade do
  -- fornecedor/e-mail é modelo mais forte, fora de escopo nesta fase.)
  insert into public.eventos (org_id, entidade, entidade_id, tipo, payload)
    values (v_org, 'contrato', p_contrato, 'token_assinatura_gerado', jsonb_build_object('parte', p_parte));

  return v_token;
end;
$$;

revoke all on function public.gerar_token_assinatura(uuid, text, text) from public, anon;
grant execute on function public.gerar_token_assinatura(uuid, text, text) to authenticated;
