-- Correção (segurança) · `obras.criado_por` IMUTÁVEL pelo cliente.
--
-- O trigger anterior só setava criado_por no INSERT. Como a policy de UPDATE de
-- obras é por membro, um membro poderia se DECLARAR criador (update de
-- criado_por) e então apagar a obra — bypass de autorização. Agora o trigger
-- preserva criado_por em updates do cliente. O servidor (service_role, sem
-- auth.uid()) ainda pode definir.
create or replace function public.force_obra_criador()
returns trigger language plpgsql as $$
begin
  if auth.uid() is not null then
    if tg_op = 'INSERT' then
      new.criado_por := auth.uid();
    else
      new.criado_por := old.criado_por;  -- imutável pelo cliente
    end if;
  end if;
  return new;
end;
$$;
drop trigger if exists trg_obras_criador on public.obras;
create trigger trg_obras_criador before insert or update on public.obras
  for each row execute function public.force_obra_criador();

-- Defesa em profundidade: a regra "não apagar obra com propostas" também no
-- guard, caso alguém mexa em deleted_at direto (fora do RPC apagar_obra).
create or replace function public.guard_obra_soft_delete()
returns trigger language plpgsql as $$
begin
  if auth.uid() is not null and (new.deleted_at is distinct from old.deleted_at) then
    -- Autorização: gestor ou criador.
    if not public.is_gestor(old.org_id) and old.criado_por is distinct from auth.uid() then
      raise exception 'apenas gestor ou quem criou a obra pode apagá-la';
    end if;
    -- Ao APAGAR (setar deleted_at), não deixar perder uma obra com propostas.
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
