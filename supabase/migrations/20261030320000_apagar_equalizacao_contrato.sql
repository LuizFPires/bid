-- Apagar (exclusão LÓGICA) equalização e contrato, com Desfazer — regras #10/#11.
--
-- Quem pode: gestor da org OU dono da obra (mesma régua das propostas). Para
-- equalização ENTRE OBRAS (sem certame), gestor ou quem a criou.
-- Contrato ASSINADO não se apaga (é documento com assinaturas e trilha).

-- ---------- guards específicos (substituem o guard genérico "só gestor") ----------
create or replace function public.guard_equalizacao_soft_delete()
returns trigger language plpgsql as $$
declare v_obra uuid;
begin
  if auth.uid() is not null
     and (new.deleted_at is distinct from old.deleted_at)
     and not public.is_gestor(old.org_id) then
    if old.certame_id is not null then
      select obra_id into v_obra from public.certames where id = old.certame_id;
      if not public.dono_obra(v_obra) then
        raise exception 'apenas gestor ou o dono da obra pode excluir a equalização';
      end if;
    elsif old.criado_por is distinct from auth.uid() then
      raise exception 'apenas gestor ou quem criou pode excluir a equalização';
    end if;
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
  if auth.uid() is not null and (new.deleted_at is distinct from old.deleted_at) then
    if not public.is_gestor(old.org_id) and not public.dono_obra(old.obra_id) then
      raise exception 'apenas gestor ou o dono da obra pode excluir o contrato';
    end if;
    if new.deleted_at is not null and old.status = 'assinado' then
      raise exception 'Contrato assinado não pode ser excluído.';
    end if;
  end if;
  return new;
end;
$$;
drop trigger if exists trg_contratos_guard_del on public.contratos;
create trigger trg_contratos_guard_del before update on public.contratos
  for each row execute function public.guard_contrato_soft_delete();

-- ---------- equalização ----------
create or replace function public.apagar_equalizacao(p_eq uuid)
returns void
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_org uuid;
  v_certame uuid;
begin
  select org_id, certame_id into v_org, v_certame
    from public.equalizacoes where id = p_eq and deleted_at is null;
  if v_org is null then raise exception 'equalização não encontrada'; end if;

  update public.equalizacoes set deleted_at = now() where id = p_eq;

  -- Sem outra equalização viva, a tomada de preços volta a "aberta" (se não adjudicada).
  if v_certame is not null and not exists (
    select 1 from public.equalizacoes where certame_id = v_certame and deleted_at is null
  ) then
    update public.certames set status = 'aberta'
      where id = v_certame and status = 'analise';
  end if;

  insert into public.eventos (org_id, entidade, entidade_id, tipo, payload)
    values (v_org, 'equalizacao', p_eq, 'equalizacao_excluida', jsonb_build_object('certame', v_certame));
end;
$$;

create or replace function public.restaurar_equalizacao(p_eq uuid)
returns void
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_org uuid;
  v_certame uuid;
begin
  select org_id, certame_id into v_org, v_certame
    from public.equalizacoes where id = p_eq and deleted_at is not null;
  if v_org is null then raise exception 'equalização não encontrada ou já ativa'; end if;

  update public.equalizacoes set deleted_at = null where id = p_eq;
  if v_certame is not null then
    update public.certames set status = 'analise' where id = v_certame and status = 'aberta';
  end if;

  insert into public.eventos (org_id, entidade, entidade_id, tipo, payload)
    values (v_org, 'equalizacao', p_eq, 'equalizacao_restaurada', '{}'::jsonb);
end;
$$;

-- ---------- contrato ----------
create or replace function public.apagar_contrato(p_contrato uuid)
returns void
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_org uuid;
  v_status text;
begin
  select org_id, status into v_org, v_status
    from public.contratos where id = p_contrato and deleted_at is null;
  if v_org is null then raise exception 'contrato não encontrado'; end if;
  if v_status = 'assinado' then
    raise exception 'Contrato assinado não pode ser excluído.';
  end if;

  update public.contratos set deleted_at = now() where id = p_contrato;

  insert into public.eventos (org_id, entidade, entidade_id, tipo, payload)
    values (v_org, 'contrato', p_contrato, 'contrato_excluido', jsonb_build_object('status', v_status));
end;
$$;

create or replace function public.restaurar_contrato(p_contrato uuid)
returns void
language plpgsql
security invoker
set search_path = public
as $$
declare v_org uuid;
begin
  select org_id into v_org from public.contratos where id = p_contrato and deleted_at is not null;
  if v_org is null then raise exception 'contrato não encontrado ou já ativo'; end if;

  update public.contratos set deleted_at = null where id = p_contrato;

  insert into public.eventos (org_id, entidade, entidade_id, tipo, payload)
    values (v_org, 'contrato', p_contrato, 'contrato_restaurado', '{}'::jsonb);
end;
$$;

revoke all on function public.apagar_equalizacao(uuid) from public, anon;
revoke all on function public.restaurar_equalizacao(uuid) from public, anon;
revoke all on function public.apagar_contrato(uuid) from public, anon;
revoke all on function public.restaurar_contrato(uuid) from public, anon;
grant execute on function public.apagar_equalizacao(uuid) to authenticated;
grant execute on function public.restaurar_equalizacao(uuid) to authenticated;
grant execute on function public.apagar_contrato(uuid) to authenticated;
grant execute on function public.restaurar_contrato(uuid) to authenticated;
