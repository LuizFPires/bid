-- Acesso POR OBRA, com dono e convites.
--
-- Modelo novo: quem cria a obra é o DONO (obras.criado_por). Qualquer pessoa pode
-- criar conta, mas só enxerga/opera uma obra se for o dono ou se tiver ACEITO um
-- convite do dono. O pertencimento à organização (membros/is_member) deixa de dar
-- acesso às obras — fica só para a própria org (criar obra, sugestões, eventos).
-- Apagar obra: SÓ o dono.
--
-- Tabela obra_convites: pendente → aceito/recusado; 'removido' quando o dono tira o
-- acesso. Convite por e-mail: se a conta ainda não existe, o convite fica esperando
-- e aparece quando a pessoa criar o login com esse e-mail.

-- ---------- tabela ----------
create table if not exists public.obra_convites (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizacoes(id) on delete cascade,
  obra_id uuid not null references public.obras(id) on delete cascade,
  email text not null,
  user_id uuid references auth.users(id) on delete cascade,
  convidado_por uuid not null,
  status text not null default 'pendente'
    check (status in ('pendente', 'aceito', 'recusado', 'removido')),
  created_at timestamptz not null default now(),
  respondido_em timestamptz
);
create index if not exists idx_obra_convites_obra on public.obra_convites(obra_id);
create index if not exists idx_obra_convites_user on public.obra_convites(user_id);
create index if not exists idx_obra_convites_email on public.obra_convites(lower(email));
-- Um convite vivo (pendente/aceito) por obra+e-mail.
create unique index if not exists uq_obra_convite_vivo
  on public.obra_convites(obra_id, lower(email))
  where status in ('pendente', 'aceito');

alter table public.obra_convites enable row level security;
-- Sem policies de escrita direta: tudo por RPC. Leitura: dono da obra ou o próprio convidado.

-- ---------- backfill: obras sem criado_por → gestor mais antigo da org ----------
update public.obras o
   set criado_por = (
     select m.user_id from public.membros m
      where m.org_id = o.org_id and m.papel = 'gestor'
      order by m.created_at asc limit 1)
 where o.criado_por is null;

-- ---------- helpers (SECURITY DEFINER: sem recursão de RLS) ----------
create or replace function public.dono_obra(p_obra uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.obras o where o.id = p_obra and o.criado_por = auth.uid()
  );
$$;

create or replace function public.pode_obra(p_obra uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.obras o where o.id = p_obra and o.criado_por = auth.uid()
  ) or exists (
    select 1 from public.obra_convites c
     where c.obra_id = p_obra and c.status = 'aceito' and c.user_id = auth.uid()
  );
$$;

create or replace function public.pode_certame(p_certame uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.certames c where c.id = p_certame and public.pode_obra(c.obra_id)
  );
$$;

create or replace function public.pode_proposta(p_proposta uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.propostas p where p.id = p_proposta and public.pode_certame(p.certame_id)
  );
$$;

create or replace function public.pode_contrato(p_contrato uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.contratos k where k.id = p_contrato and public.pode_obra(k.obra_id)
  );
$$;

-- Colabora com a org: membro dela OU tem acesso aceito a alguma obra dela
-- (para eventos, sugestões e equalizações entre obras).
create or replace function public.colabora_org(p_org uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select public.is_member(p_org) or exists (
    select 1 from public.obra_convites c
      join public.obras o on o.id = c.obra_id
     where o.org_id = p_org and c.status = 'aceito' and c.user_id = auth.uid()
  );
$$;

-- ---------- preserva o acesso de quem já era membro da org (vira convite aceito) ----------
insert into public.obra_convites (org_id, obra_id, email, user_id, convidado_por, status, respondido_em)
select o.org_id, o.id, lower(u.email), m.user_id, o.criado_por, 'aceito', now()
  from public.obras o
  join public.membros m on m.org_id = o.org_id and m.user_id is distinct from o.criado_por
  join auth.users u on u.id = m.user_id
 where o.deleted_at is null and o.criado_por is not null
on conflict do nothing;

-- ---------- RLS: troca is_member(org_id) por acesso à obra ----------
-- obras
drop policy if exists "obras_select" on public.obras;
drop policy if exists "obras_insert" on public.obras;
drop policy if exists "obras_update" on public.obras;
create policy "obras_select" on public.obras
  for select to authenticated using (public.pode_obra(id));
create policy "obras_insert" on public.obras
  for insert to authenticated with check (public.is_member(org_id));
create policy "obras_update" on public.obras
  for update to authenticated using (public.pode_obra(id)) with check (public.pode_obra(id));

-- certames
drop policy if exists "certames_select" on public.certames;
drop policy if exists "certames_insert" on public.certames;
drop policy if exists "certames_update" on public.certames;
create policy "certames_select" on public.certames
  for select to authenticated using (public.pode_obra(obra_id));
create policy "certames_insert" on public.certames
  for insert to authenticated with check (public.pode_obra(obra_id));
create policy "certames_update" on public.certames
  for update to authenticated using (public.pode_obra(obra_id)) with check (public.pode_obra(obra_id));

-- propostas
drop policy if exists "propostas_select" on public.propostas;
drop policy if exists "propostas_insert" on public.propostas;
drop policy if exists "propostas_update" on public.propostas;
create policy "propostas_select" on public.propostas
  for select to authenticated using (public.pode_certame(certame_id));
create policy "propostas_insert" on public.propostas
  for insert to authenticated with check (public.pode_certame(certame_id));
create policy "propostas_update" on public.propostas
  for update to authenticated using (public.pode_certame(certame_id)) with check (public.pode_certame(certame_id));

-- proposta_versoes
drop policy if exists "proposta_versoes_select" on public.proposta_versoes;
drop policy if exists "proposta_versoes_insert" on public.proposta_versoes;
drop policy if exists "proposta_versoes_update" on public.proposta_versoes;
create policy "proposta_versoes_select" on public.proposta_versoes
  for select to authenticated using (public.pode_proposta(proposta_id));
create policy "proposta_versoes_insert" on public.proposta_versoes
  for insert to authenticated with check (public.pode_proposta(proposta_id));
create policy "proposta_versoes_update" on public.proposta_versoes
  for update to authenticated using (public.pode_proposta(proposta_id)) with check (public.pode_proposta(proposta_id));

-- sugestoes e eventos: quem colabora com a org.
drop policy if exists "sugestoes_select" on public.sugestoes;
drop policy if exists "sugestoes_insert" on public.sugestoes;
drop policy if exists "sugestoes_update" on public.sugestoes;
create policy "sugestoes_select" on public.sugestoes
  for select to authenticated using (public.colabora_org(org_id));
create policy "sugestoes_insert" on public.sugestoes
  for insert to authenticated with check (public.colabora_org(org_id));
create policy "sugestoes_update" on public.sugestoes
  for update to authenticated using (public.colabora_org(org_id)) with check (public.colabora_org(org_id));

drop policy if exists "eventos_select" on public.eventos;
drop policy if exists "eventos_insert" on public.eventos;
create policy "eventos_select" on public.eventos
  for select to authenticated using (public.colabora_org(org_id));
create policy "eventos_insert" on public.eventos
  for insert to authenticated with check (public.colabora_org(org_id));

-- equalizacoes: por certame (escopo obra) ou quem colabora com a org (entre obras).
drop policy if exists "equalizacoes_select" on public.equalizacoes;
drop policy if exists "equalizacoes_insert" on public.equalizacoes;
drop policy if exists "equalizacoes_update" on public.equalizacoes;
create policy "equalizacoes_select" on public.equalizacoes
  for select to authenticated using (
    case when certame_id is not null then public.pode_certame(certame_id)
         else public.colabora_org(org_id) end);
create policy "equalizacoes_insert" on public.equalizacoes
  for insert to authenticated with check (
    case when certame_id is not null then public.pode_certame(certame_id)
         else public.colabora_org(org_id) end);
create policy "equalizacoes_update" on public.equalizacoes
  for update to authenticated
  using (case when certame_id is not null then public.pode_certame(certame_id)
              else public.colabora_org(org_id) end)
  with check (case when certame_id is not null then public.pode_certame(certame_id)
                   else public.colabora_org(org_id) end);

-- contratos / cláusulas / assinaturas
drop policy if exists "contratos_select" on public.contratos;
drop policy if exists "contratos_insert" on public.contratos;
drop policy if exists "contratos_update" on public.contratos;
create policy "contratos_select" on public.contratos
  for select to authenticated using (public.pode_obra(obra_id));
create policy "contratos_insert" on public.contratos
  for insert to authenticated with check (public.pode_obra(obra_id));
create policy "contratos_update" on public.contratos
  for update to authenticated using (public.pode_obra(obra_id)) with check (public.pode_obra(obra_id));

drop policy if exists "contrato_clausulas_select" on public.contrato_clausulas;
drop policy if exists "contrato_clausulas_insert" on public.contrato_clausulas;
drop policy if exists "contrato_clausulas_update" on public.contrato_clausulas;
create policy "contrato_clausulas_select" on public.contrato_clausulas
  for select to authenticated using (public.pode_contrato(contrato_id));
create policy "contrato_clausulas_insert" on public.contrato_clausulas
  for insert to authenticated with check (public.pode_contrato(contrato_id));
create policy "contrato_clausulas_update" on public.contrato_clausulas
  for update to authenticated using (public.pode_contrato(contrato_id)) with check (public.pode_contrato(contrato_id));

drop policy if exists "assinaturas_select" on public.assinaturas;
create policy "assinaturas_select" on public.assinaturas
  for select to authenticated using (public.pode_contrato(contrato_id));

-- obra_convites: dono da obra vê todos; o convidado vê os seus.
create policy "obra_convites_select" on public.obra_convites
  for select to authenticated using (
    public.dono_obra(obra_id)
    or user_id = auth.uid()
    or lower(email) = lower(coalesce(auth.jwt() ->> 'email', '')));

-- Storage `propostas`: além do dono do arquivo, quem tem acesso à obra da
-- proposta pode baixar (URL assinada) o arquivo anexado a uma versão.
drop policy if exists "bid_propostas_select" on storage.objects;
create policy "bid_propostas_select" on storage.objects
  for select to authenticated
  using (
    bucket_id = 'propostas' and (
      owner_id = (select auth.uid()::text)
      or exists (
        select 1 from public.proposta_versoes v
         where v.arquivo_path = storage.objects.name and public.pode_proposta(v.proposta_id))));

-- Storage `contratos`/`assinaturas`: pasta = org; quem colabora com a org lê.
drop policy if exists "bid_contratos_select" on storage.objects;
create policy "bid_contratos_select" on storage.objects
  for select to authenticated
  using (bucket_id = 'contratos' and public.colabora_org(((storage.foldername(name))[1])::uuid));
drop policy if exists "bid_contratos_insert" on storage.objects;
create policy "bid_contratos_insert" on storage.objects
  for insert to authenticated
  with check (bucket_id = 'contratos' and public.colabora_org(((storage.foldername(name))[1])::uuid));
drop policy if exists "bid_contratos_update" on storage.objects;
create policy "bid_contratos_update" on storage.objects
  for update to authenticated
  using (bucket_id = 'contratos' and public.colabora_org(((storage.foldername(name))[1])::uuid))
  with check (bucket_id = 'contratos' and public.colabora_org(((storage.foldername(name))[1])::uuid));
drop policy if exists "bid_assinaturas_select" on storage.objects;
create policy "bid_assinaturas_select" on storage.objects
  for select to authenticated
  using (bucket_id = 'assinaturas' and public.colabora_org(((storage.foldername(name))[1])::uuid));

-- ---------- guards de soft-delete ----------
-- Obra: SÓ o dono apaga.
create or replace function public.guard_obra_soft_delete()
returns trigger language plpgsql as $$
begin
  if auth.uid() is not null
     and (new.deleted_at is distinct from old.deleted_at)
     and old.criado_por is distinct from auth.uid() then
    raise exception 'apenas quem criou a obra pode apagá-la';
  end if;
  return new;
end;
$$;

-- Certame/proposta: gestor da org OU dono da obra.
create or replace function public.guard_certame_soft_delete()
returns trigger language plpgsql as $$
begin
  if auth.uid() is not null
     and (new.deleted_at is distinct from old.deleted_at)
     and not public.is_gestor(old.org_id)
     and not public.dono_obra(old.obra_id) then
    raise exception 'apenas gestor ou o dono da obra pode excluir';
  end if;
  return new;
end;
$$;
drop trigger if exists trg_certames_guard_del on public.certames;
create trigger trg_certames_guard_del before update on public.certames
  for each row execute function public.guard_certame_soft_delete();

create or replace function public.guard_proposta_soft_delete()
returns trigger language plpgsql as $$
declare v_obra uuid;
begin
  if auth.uid() is not null
     and (new.deleted_at is distinct from old.deleted_at)
     and not public.is_gestor(old.org_id) then
    select obra_id into v_obra from public.certames where id = old.certame_id;
    if not public.dono_obra(v_obra) then
      raise exception 'apenas gestor ou o dono da obra pode excluir a proposta';
    end if;
  end if;
  return new;
end;
$$;
drop trigger if exists trg_propostas_guard_del on public.propostas;
create trigger trg_propostas_guard_del before update on public.propostas
  for each row execute function public.guard_proposta_soft_delete();

-- apagar_obra: mensagem coerente com o novo guard (o guard é a trava real).
create or replace function public.apagar_obra(p_obra uuid)
returns void
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_org uuid;
begin
  select org_id into v_org from public.obras where id = p_obra and deleted_at is null;
  if v_org is null then raise exception 'obra não encontrada'; end if;
  if not public.dono_obra(p_obra) then
    raise exception 'Só quem criou a obra pode apagá-la.';
  end if;

  if exists (
    select 1 from public.propostas p
    join public.certames c on c.id = p.certame_id
    where c.obra_id = p_obra and p.deleted_at is null
  ) then
    raise exception 'Esta obra tem propostas. Apague as propostas antes de apagar a obra.';
  end if;

  update public.obras set deleted_at = now() where id = p_obra;

  insert into public.eventos (org_id, entidade, entidade_id, tipo, payload)
    values (v_org, 'obra', p_obra, 'obra_excluida', '{}'::jsonb);
end;
$$;

-- ---------- RPCs de convite (SECURITY DEFINER; gates explícitos) ----------

-- Dono convida por e-mail. A conta pode ainda não existir.
create or replace function public.convidar_para_obra(p_obra uuid, p_email text)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_org uuid;
  v_email text := lower(btrim(p_email));
  v_user uuid;
  v_id uuid;
begin
  if not public.dono_obra(p_obra) then
    raise exception 'Só quem criou a obra pode convidar.';
  end if;
  if v_email = '' or position('@' in v_email) = 0 then
    raise exception 'e-mail inválido';
  end if;
  select org_id into v_org from public.obras where id = p_obra and deleted_at is null;
  if v_org is null then raise exception 'obra não encontrada'; end if;

  select id into v_user from auth.users where lower(email) = v_email limit 1;
  if v_user is not null and public.dono_obra(p_obra) and v_user = auth.uid() then
    raise exception 'Você já é o dono desta obra.';
  end if;
  if exists (
    select 1 from public.obra_convites
     where obra_id = p_obra and lower(email) = v_email and status in ('pendente', 'aceito')
  ) then
    raise exception 'Essa pessoa já foi convidada para esta obra.';
  end if;

  insert into public.obra_convites (org_id, obra_id, email, user_id, convidado_por)
    values (v_org, p_obra, v_email, v_user, auth.uid())
    returning id into v_id;

  insert into public.eventos (org_id, entidade, entidade_id, tipo, payload)
    values (v_org, 'obra', p_obra, 'convite_enviado', jsonb_build_object('email', v_email));
  return v_id;
end;
$$;

-- Meus convites pendentes (por user_id ou pelo e-mail da conta).
create or replace function public.meus_convites()
returns table (id uuid, obra_id uuid, obra_nome text, obra_cidade text, convidado_por_email text, created_at timestamptz)
language sql
stable
security definer
set search_path = public
as $$
  select c.id, c.obra_id, o.nome, o.cidade, u.email::text, c.created_at
    from public.obra_convites c
    join public.obras o on o.id = c.obra_id
    left join auth.users u on u.id = c.convidado_por
   where c.status = 'pendente'
     and o.deleted_at is null
     and (c.user_id = auth.uid()
          or lower(c.email) = lower(coalesce(auth.jwt() ->> 'email', '')))
   order by c.created_at desc;
$$;

-- Aceitar ou recusar um convite meu.
create or replace function public.responder_convite(p_convite uuid, p_aceitar boolean)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_org uuid;
  v_obra uuid;
begin
  select org_id, obra_id into v_org, v_obra
    from public.obra_convites
   where id = p_convite and status = 'pendente'
     and (user_id = auth.uid()
          or lower(email) = lower(coalesce(auth.jwt() ->> 'email', '')));
  if v_obra is null then raise exception 'convite não encontrado'; end if;

  update public.obra_convites
     set status = case when p_aceitar then 'aceito' else 'recusado' end,
         user_id = auth.uid(),
         respondido_em = now()
   where id = p_convite;

  insert into public.eventos (org_id, entidade, entidade_id, tipo, payload)
    values (v_org, 'obra', v_obra,
            case when p_aceitar then 'convite_aceito' else 'convite_recusado' end,
            jsonb_build_object('convite', p_convite));
end;
$$;

-- Quem tem acesso à obra (dono + convites vivos). Visível a quem acessa a obra.
create or replace function public.listar_acesso_obra(p_obra uuid)
returns table (convite_id uuid, email text, status text, eh_dono boolean)
language sql
stable
security definer
set search_path = public
as $$
  select null::uuid, u.email::text, 'dono'::text, true
    from public.obras o join auth.users u on u.id = o.criado_por
   where o.id = p_obra and public.pode_obra(p_obra)
  union all
  select c.id, c.email, c.status, false
    from public.obra_convites c
   where c.obra_id = p_obra and c.status in ('pendente', 'aceito') and public.pode_obra(p_obra)
   order by 4 desc, 3, 2;
$$;

-- Dono remove um acesso (convite pendente ou aceito).
create or replace function public.remover_acesso_obra(p_convite uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_org uuid;
  v_obra uuid;
  v_email text;
begin
  select org_id, obra_id, email into v_org, v_obra, v_email
    from public.obra_convites where id = p_convite and status in ('pendente', 'aceito');
  if v_obra is null then raise exception 'acesso não encontrado'; end if;
  if not public.dono_obra(v_obra) then
    raise exception 'Só quem criou a obra pode remover acessos.';
  end if;

  update public.obra_convites set status = 'removido', respondido_em = now() where id = p_convite;

  insert into public.eventos (org_id, entidade, entidade_id, tipo, payload)
    values (v_org, 'obra', v_obra, 'acesso_removido', jsonb_build_object('email', v_email));
end;
$$;

-- Permissões: só autenticados; nunca anon/public.
revoke all on function public.dono_obra(uuid) from public, anon;
revoke all on function public.pode_obra(uuid) from public, anon;
revoke all on function public.pode_certame(uuid) from public, anon;
revoke all on function public.pode_proposta(uuid) from public, anon;
revoke all on function public.pode_contrato(uuid) from public, anon;
revoke all on function public.colabora_org(uuid) from public, anon;
revoke all on function public.convidar_para_obra(uuid, text) from public, anon;
revoke all on function public.meus_convites() from public, anon;
revoke all on function public.responder_convite(uuid, boolean) from public, anon;
revoke all on function public.listar_acesso_obra(uuid) from public, anon;
revoke all on function public.remover_acesso_obra(uuid) from public, anon;
grant execute on function public.dono_obra(uuid) to authenticated;
grant execute on function public.pode_obra(uuid) to authenticated;
grant execute on function public.pode_certame(uuid) to authenticated;
grant execute on function public.pode_proposta(uuid) to authenticated;
grant execute on function public.pode_contrato(uuid) to authenticated;
grant execute on function public.colabora_org(uuid) to authenticated;
grant execute on function public.convidar_para_obra(uuid, text) to authenticated;
grant execute on function public.meus_convites() to authenticated;
grant execute on function public.responder_convite(uuid, boolean) to authenticated;
grant execute on function public.listar_acesso_obra(uuid) to authenticated;
grant execute on function public.remover_acesso_obra(uuid) to authenticated;
