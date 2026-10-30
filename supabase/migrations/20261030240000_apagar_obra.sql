-- Apagar obra: gestor OU quem criou a obra.
--
-- Exclusão LÓGICA (deleted_at), com "Desfazer". Até agora o guard de soft-delete
-- em obras exigia GESTOR; passa a permitir também o CRIADOR da obra. Para isso,
-- obras ganha `criado_por` (forçado = auth.uid() no insert, sem spoof).
-- Bloqueia apagar uma obra que ainda tem propostas (evita perder o projeto).

-- Criador da obra.
alter table public.obras add column if not exists criado_por uuid;

-- Força criado_por = usuário autenticado no insert (servidor/service pode definir).
create or replace function public.force_obra_criador()
returns trigger language plpgsql as $$
begin
  if auth.uid() is not null then
    new.criado_por := auth.uid();
  end if;
  return new;
end;
$$;
drop trigger if exists trg_obras_criador on public.obras;
create trigger trg_obras_criador before insert on public.obras
  for each row execute function public.force_obra_criador();

-- Guard de soft-delete específico de obras: GESTOR ou CRIADOR.
create or replace function public.guard_obra_soft_delete()
returns trigger language plpgsql as $$
begin
  if auth.uid() is not null
     and (new.deleted_at is distinct from old.deleted_at)
     and not public.is_gestor(old.org_id)
     and old.criado_por is distinct from auth.uid() then
    raise exception 'apenas gestor ou quem criou a obra pode apagá-la';
  end if;
  return new;
end;
$$;
drop trigger if exists trg_obras_guard_del on public.obras;
create trigger trg_obras_guard_del before update on public.obras
  for each row execute function public.guard_obra_soft_delete();

-- ---------- apagar_obra ----------
create or replace function public.apagar_obra(p_obra uuid)
returns void
language plpgsql
security invoker            -- RLS + guard (gestor/criador) continuam valendo
set search_path = public
as $$
declare
  v_org uuid;
begin
  select org_id into v_org from public.obras where id = p_obra and deleted_at is null;
  if v_org is null then raise exception 'obra não encontrada'; end if;

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

-- ---------- restaurar_obra (Desfazer) ----------
create or replace function public.restaurar_obra(p_obra uuid)
returns void
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_org uuid;
begin
  select org_id into v_org from public.obras where id = p_obra and deleted_at is not null;
  if v_org is null then raise exception 'obra não encontrada ou já ativa'; end if;

  update public.obras set deleted_at = null where id = p_obra;

  insert into public.eventos (org_id, entidade, entidade_id, tipo, payload)
    values (v_org, 'obra', p_obra, 'obra_restaurada', '{}'::jsonb);
end;
$$;

revoke all on function public.apagar_obra(uuid) from public, anon;
revoke all on function public.restaurar_obra(uuid) from public, anon;
grant execute on function public.apagar_obra(uuid) to authenticated;
grant execute on function public.restaurar_obra(uuid) to authenticated;
