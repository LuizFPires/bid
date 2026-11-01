-- M10 · Revisão obrigatória por IA (RC-07/RC-08): revisões e achados são
-- gravados SÓ pelo servidor; o usuário resolve achados por RPC (corrigido /
-- aceito com justificativa). Aprovações/validação entram no M12.

create table if not exists public.contrato_revisoes (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizacoes(id) on delete cascade,
  contrato_id uuid not null,
  conteudo_hash text not null,            -- a revisão vale para este hash
  modelo_ia text not null,
  resumo text,
  status text not null check (status in ('processando', 'concluida', 'falhou')),
  erro text,
  autor uuid,
  created_at timestamptz not null default now(),
  concluida_em timestamptz,
  foreign key (contrato_id, org_id) references public.contratos(id, org_id) on delete cascade
);
create index if not exists idx_revisoes_contrato on public.contrato_revisoes(contrato_id, created_at desc);

-- Chave composta ANTES da FK dos achados (ordem importa no db push).
alter table public.contrato_revisoes drop constraint if exists contrato_revisoes_id_org_key;
alter table public.contrato_revisoes add constraint contrato_revisoes_id_org_key unique (id, org_id);

create table if not exists public.contrato_achados (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizacoes(id) on delete cascade,
  revisao_id uuid not null,
  tipo text not null check (tipo in ('conflito', 'lacuna', 'risco')),
  severidade text not null check (severidade in ('alta', 'media', 'baixa')),
  numero text not null,
  titulo text not null,
  explicacao text not null,
  trecho_proposta text,
  sugestao text,
  resolucao text check (resolucao is null or resolucao in ('corrigido', 'aceito')),
  justificativa text,
  resolvido_por uuid,
  resolvido_em timestamptz,
  foreign key (revisao_id, org_id) references public.contrato_revisoes(id, org_id) on delete cascade
);
create index if not exists idx_achados_revisao on public.contrato_achados(revisao_id);

alter table public.contrato_revisoes enable row level security;
alter table public.contrato_achados enable row level security;
drop policy if exists "revisoes_select" on public.contrato_revisoes;
create policy "revisoes_select" on public.contrato_revisoes for select to authenticated using (public.pode_contrato(contrato_id));
drop policy if exists "achados_select" on public.contrato_achados;
create policy "achados_select" on public.contrato_achados for select to authenticated
  using (exists (select 1 from public.contrato_revisoes r where r.id = revisao_id and public.pode_contrato(r.contrato_id)));
-- Sem policy de escrita: só o servidor (service_role) grava; resolução por RPC.

-- Resolver um achado: corrigido (o usuário mudou o contrato) ou aceito com justificativa.
create or replace function public.resolver_achado(p_achado uuid, p_resolucao text, p_justificativa text default null)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare v_org uuid; v_contrato uuid;
begin
  if p_resolucao not in ('corrigido', 'aceito') then raise exception 'resolução inválida'; end if;
  if p_resolucao = 'aceito' and coalesce(length(trim(p_justificativa)), 0) < 10 then
    raise exception 'Aceitar um achado exige justificativa (mínimo 10 caracteres).';
  end if;
  select a.org_id, r.contrato_id into v_org, v_contrato
    from public.contrato_achados a join public.contrato_revisoes r on r.id = a.revisao_id
   where a.id = p_achado;
  if v_org is null then raise exception 'achado não encontrado'; end if;
  if not public.pode_contrato(v_contrato) then raise exception 'sem acesso a este contrato'; end if;
  if not public.contrato_editavel(v_contrato) then raise exception 'contrato não está em edição'; end if;

  update public.contrato_achados
     set resolucao = p_resolucao, justificativa = nullif(trim(p_justificativa), ''), resolvido_por = auth.uid(), resolvido_em = now()
   where id = p_achado;

  insert into public.eventos (org_id, entidade, entidade_id, tipo, payload)
    values (v_org, 'contrato', v_contrato, 'achado_resolvido', jsonb_build_object('achado', p_achado, 'resolucao', p_resolucao));
end;
$$;

-- Última revisão de um contrato (com achados), para a UI e para o envio.
create or replace function public.ultima_revisao(p_contrato uuid)
returns table (id uuid, conteudo_hash text, modelo_ia text, resumo text, status text, erro text, created_at timestamptz, concluida_em timestamptz)
language sql stable security invoker set search_path = public as $$
  select r.id, r.conteudo_hash, r.modelo_ia, r.resumo, r.status, r.erro, r.created_at, r.concluida_em
    from public.contrato_revisoes r
   where r.contrato_id = p_contrato
   order by r.created_at desc
   limit 1;
$$;

revoke all on function public.resolver_achado(uuid, text, text) from public, anon;
revoke all on function public.ultima_revisao(uuid) from public, anon;
grant execute on function public.resolver_achado(uuid, text, text) to authenticated;
grant execute on function public.ultima_revisao(uuid) to authenticated;
