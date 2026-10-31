-- M9 · Papéis por obra (regra 13 revisada — docs/contratos/CLAUDE-contratos.md).
-- Dono (criou a obra) e GESTOR gerenciam: aprovam/emitem contratos (M10+),
-- apagam propostas/equalizações/contratos, convidam e trocam papéis.
-- COLABORADOR sobe, equaliza, monta contrato e envia para validação — não
-- aprova, não emite, não apaga. Só o dono apaga a obra (Q1: padrão).
-- Convites aceitos existentes viram 'colaborador' (preserva o que já podiam).

-- ---------- papel no convite ----------
alter table public.obra_convites
  add column if not exists papel text not null default 'colaborador';
alter table public.obra_convites drop constraint if exists obra_convites_papel_check;
alter table public.obra_convites
  add constraint obra_convites_papel_check check (papel in ('gestor', 'colaborador'));

-- ---------- helpers (SECURITY DEFINER: sem recursão de RLS) ----------
-- 'dono' | 'gestor' | 'colaborador' | null (sem acesso)
create or replace function public.papel_obra(p_obra uuid)
returns text language sql stable security definer set search_path = public as $$
  select case
    when exists (
      select 1 from public.obras o
       where o.id = p_obra and o.criado_por = auth.uid() and o.deleted_at is null
    ) then 'dono'
    else (
      select c.papel from public.obra_convites c
        join public.obras o on o.id = c.obra_id and o.deleted_at is null
       where c.obra_id = p_obra and c.user_id = auth.uid() and c.status = 'aceito'
       limit 1
    )
  end;
$$;

create or replace function public.gerencia_obra(p_obra uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select coalesce(public.papel_obra(p_obra) in ('dono', 'gestor'), false);
$$;

create or replace function public.gerencia_certame(p_certame uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.certames c where c.id = p_certame and public.gerencia_obra(c.obra_id)
  );
$$;

create or replace function public.gerencia_proposta(p_proposta uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.propostas p where p.id = p_proposta and public.gerencia_certame(p.certame_id)
  );
$$;

create or replace function public.gerencia_contrato(p_contrato uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.contratos k where k.id = p_contrato and public.gerencia_obra(k.obra_id)
  );
$$;

-- Equalização em uma obra: gerencia a obra do certame. Entre obras: gerencia
-- TODAS as obras das propostas comparadas (colaborador não apaga, nem a que criou).
create or replace function public.gerencia_equalizacao(p_eq uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.equalizacoes e
     where e.id = p_eq
       and (
         (e.certame_id is not null and public.gerencia_certame(e.certame_id))
         or (e.certame_id is null and cardinality(e.proposta_ids) > 0 and not exists (
               select 1 from public.propostas p
                 join public.certames c on c.id = p.certame_id
                where p.id = any(e.proposta_ids) and not public.gerencia_obra(c.obra_id)
             ))
       )
  );
$$;

-- ---------- guards de exclusão: só quem gerencia a obra ----------
-- (auth.uid() nulo = servidor/migração: segue sem gate, como antes)
create or replace function public.guard_certame_soft_delete()
returns trigger language plpgsql as $$
begin
  if auth.uid() is not null
     and (new.deleted_at is distinct from old.deleted_at)
     and not public.gerencia_obra(old.obra_id) then
    raise exception 'Só o dono ou um gestor da obra pode excluir.';
  end if;
  return new;
end;
$$;

create or replace function public.guard_proposta_soft_delete()
returns trigger language plpgsql as $$
declare v_obra uuid;
begin
  if auth.uid() is not null and (new.deleted_at is distinct from old.deleted_at) then
    select obra_id into v_obra from public.certames where id = old.certame_id;
    if not public.gerencia_obra(v_obra) then
      raise exception 'Só o dono ou um gestor da obra pode excluir a proposta.';
    end if;
  end if;
  return new;
end;
$$;

create or replace function public.guard_equalizacao_soft_delete()
returns trigger language plpgsql as $$
begin
  if auth.uid() is not null
     and (new.deleted_at is distinct from old.deleted_at)
     and not public.gerencia_equalizacao(old.id) then
    raise exception 'Só o dono ou um gestor da obra pode excluir a equalização.';
  end if;
  return new;
end;
$$;
drop trigger if exists trg_equalizacoes_guard_del on public.equalizacoes;
create trigger trg_equalizacoes_guard_del before update on public.equalizacoes
  for each row execute function public.guard_equalizacao_soft_delete();

create or replace function public.guard_contrato_soft_delete()
returns trigger language plpgsql as $$
begin
  if new.deleted_at is distinct from old.deleted_at then
    -- Assinado nunca se apaga, nem por update direto (regra 10 / RC-17).
    if new.deleted_at is not null and old.status = 'assinado' then
      raise exception 'Contrato assinado não pode ser excluído.';
    end if;
    if auth.uid() is not null and not public.gerencia_obra(old.obra_id) then
      raise exception 'Só o dono ou um gestor da obra pode excluir o contrato.';
    end if;
  end if;
  return new;
end;
$$;
drop trigger if exists trg_contratos_guard_del on public.contratos;
create trigger trg_contratos_guard_del before update on public.contratos
  for each row execute function public.guard_contrato_soft_delete();

-- Proposta não troca de OBRA pela mão de quem não gerencia as duas (o gate de
-- exclusão lê o pai original; isto impede mover para uma obra onde se é gestor
-- e apagar lá). Trocar de categoria dentro da mesma obra continua livre.
create or replace function public.guard_proposta_certame_change()
returns trigger language plpgsql as $$
declare v_de uuid; v_para uuid;
begin
  if auth.uid() is not null and new.certame_id is distinct from old.certame_id then
    select obra_id into v_de from public.certames where id = old.certame_id;
    select obra_id into v_para from public.certames where id = new.certame_id;
    if v_de is distinct from v_para
       and not (public.gerencia_obra(v_de) and public.gerencia_obra(v_para)) then
      raise exception 'Só o dono ou um gestor das duas obras pode mover a proposta de obra.';
    end if;
  end if;
  return new;
end;
$$;
drop trigger if exists trg_propostas_guard_certame on public.propostas;
create trigger trg_propostas_guard_certame before update on public.propostas
  for each row execute function public.guard_proposta_certame_change();

-- ---------- RPCs de acesso (SECURITY DEFINER; gates explícitos) ----------
drop function if exists public.convidar_para_obra(uuid, text);
create or replace function public.convidar_para_obra(p_obra uuid, p_email text, p_papel text default 'colaborador')
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_org uuid;
  v_email text := lower(btrim(p_email));
  v_papel text := coalesce(nullif(btrim(p_papel), ''), 'colaborador');
  v_user uuid;
  v_id uuid;
begin
  if not public.gerencia_obra(p_obra) then
    raise exception 'Só o dono ou um gestor da obra pode convidar.';
  end if;
  if v_papel not in ('gestor', 'colaborador') then
    raise exception 'papel inválido';
  end if;
  if v_email = '' or position('@' in v_email) = 0 then
    raise exception 'e-mail inválido';
  end if;
  select org_id into v_org from public.obras where id = p_obra and deleted_at is null;
  if v_org is null then raise exception 'obra não encontrada'; end if;

  select id into v_user from auth.users where lower(email) = v_email limit 1;
  if v_user is not null and exists (
    select 1 from public.obras o where o.id = p_obra and o.criado_por = v_user
  ) then
    raise exception 'Essa pessoa é o dono desta obra.';
  end if;
  if exists (
    select 1 from public.obra_convites
     where obra_id = p_obra and lower(email) = v_email and status in ('pendente', 'aceito')
  ) then
    raise exception 'Essa pessoa já foi convidada para esta obra.';
  end if;

  insert into public.obra_convites (org_id, obra_id, email, user_id, convidado_por, papel)
    values (v_org, p_obra, v_email, v_user, auth.uid(), v_papel)
    returning id into v_id;

  insert into public.eventos (org_id, entidade, entidade_id, tipo, payload)
    values (v_org, 'obra', p_obra, 'convite_enviado', jsonb_build_object('email', v_email, 'papel', v_papel));
  return v_id;
end;
$$;

create or replace function public.mudar_papel_obra(p_convite uuid, p_papel text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_org uuid;
  v_obra uuid;
  v_email text;
  v_user uuid;
  v_de text;
begin
  if p_papel not in ('gestor', 'colaborador') then
    raise exception 'papel inválido';
  end if;
  select org_id, obra_id, email, user_id, papel into v_org, v_obra, v_email, v_user, v_de
    from public.obra_convites where id = p_convite and status in ('pendente', 'aceito');
  if v_obra is null then raise exception 'acesso não encontrado'; end if;
  if not public.gerencia_obra(v_obra) then
    raise exception 'Só o dono ou um gestor da obra pode mudar papéis.';
  end if;
  if v_user is not null and v_user = auth.uid() then
    raise exception 'Você não pode mudar o próprio papel.';
  end if;
  if v_de = p_papel then return; end if;

  update public.obra_convites set papel = p_papel where id = p_convite;

  insert into public.eventos (org_id, entidade, entidade_id, tipo, payload)
    values (v_org, 'obra', v_obra, 'papel_alterado', jsonb_build_object('email', v_email, 'de', v_de, 'para', p_papel));
end;
$$;

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
  if not public.gerencia_obra(v_obra) then
    raise exception 'Só o dono ou um gestor da obra pode remover acessos.';
  end if;

  update public.obra_convites set status = 'removido', respondido_em = now() where id = p_convite;

  insert into public.eventos (org_id, entidade, entidade_id, tipo, payload)
    values (v_org, 'obra', v_obra, 'acesso_removido', jsonb_build_object('email', v_email));
end;
$$;

-- Lista com papel (o dono aparece como 'dono'). Tipo de retorno mudou: recria.
drop function if exists public.listar_acesso_obra(uuid);
create or replace function public.listar_acesso_obra(p_obra uuid)
returns table (convite_id uuid, email text, status text, eh_dono boolean, papel text)
language sql
stable
security definer
set search_path = public
as $$
  select null::uuid, u.email::text, 'dono'::text, true, 'dono'::text
    from public.obras o join auth.users u on u.id = o.criado_por
   where o.id = p_obra and public.pode_obra(p_obra)
  union all
  select c.id, c.email, c.status, false, c.papel
    from public.obra_convites c
   where c.obra_id = p_obra and c.status in ('pendente', 'aceito') and public.pode_obra(p_obra)
   order by 4 desc, 3, 2;
$$;

-- Meu papel em cada obra que vejo (para a UI esconder ações que o papel não tem).
create or replace function public.meus_papeis_obras()
returns table (obra_id uuid, papel text)
language sql
stable
security definer
set search_path = public
as $$
  select o.id, 'dono'::text
    from public.obras o
   where o.criado_por = auth.uid() and o.deleted_at is null
  union all
  select c.obra_id, c.papel
    from public.obra_convites c
    join public.obras o on o.id = c.obra_id and o.deleted_at is null
   where c.user_id = auth.uid() and c.status = 'aceito';
$$;

-- ---------- permissões ----------
revoke all on function public.papel_obra(uuid) from public, anon;
revoke all on function public.gerencia_obra(uuid) from public, anon;
revoke all on function public.gerencia_certame(uuid) from public, anon;
revoke all on function public.gerencia_proposta(uuid) from public, anon;
revoke all on function public.gerencia_contrato(uuid) from public, anon;
revoke all on function public.gerencia_equalizacao(uuid) from public, anon;
revoke all on function public.convidar_para_obra(uuid, text, text) from public, anon;
revoke all on function public.mudar_papel_obra(uuid, text) from public, anon;
revoke all on function public.remover_acesso_obra(uuid) from public, anon;
revoke all on function public.listar_acesso_obra(uuid) from public, anon;
revoke all on function public.meus_papeis_obras() from public, anon;
grant execute on function public.papel_obra(uuid) to authenticated;
grant execute on function public.gerencia_obra(uuid) to authenticated;
grant execute on function public.gerencia_certame(uuid) to authenticated;
grant execute on function public.gerencia_proposta(uuid) to authenticated;
grant execute on function public.gerencia_contrato(uuid) to authenticated;
grant execute on function public.gerencia_equalizacao(uuid) to authenticated;
grant execute on function public.convidar_para_obra(uuid, text, text) to authenticated;
grant execute on function public.mudar_papel_obra(uuid, text) to authenticated;
grant execute on function public.remover_acesso_obra(uuid) to authenticated;
grant execute on function public.listar_acesso_obra(uuid) to authenticated;
grant execute on function public.meus_papeis_obras() to authenticated;
