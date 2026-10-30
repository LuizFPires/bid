-- Equipe · gerenciar membros da organização.
--
-- O cadastro cria uma org pessoal por usuário (handle_new_user). Para COMPARTILHAR
-- o acervo, o gestor adiciona outras contas (já existentes) à sua org. Como a RLS
-- libera por pertencimento (is_member) e `fetchMinhaOrg` escolhe a org mais antiga,
-- o convidado passa a enxergar e operar na org do gestor.
--
-- Tudo por RPC SECURITY DEFINER (lê auth.users, escreve membros), com o gate de
-- is_gestor — não há INSERT/UPDATE/DELETE direto do cliente em membros.

-- ---------- listar_membros ----------
create or replace function public.listar_membros(p_org uuid)
returns table (user_id uuid, email text, papel text)
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.is_member(p_org) then
    raise exception 'sem acesso a esta organização';
  end if;
  return query
    select m.user_id, u.email::text, m.papel
      from public.membros m
      join auth.users u on u.id = m.user_id
      where m.org_id = p_org
      order by m.created_at asc;
end;
$$;

-- ---------- adicionar_membro (por e-mail, conta já existente) ----------
create or replace function public.adicionar_membro(p_org uuid, p_email text, p_papel text)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user uuid;
  v_email text := lower(btrim(p_email));
  v_papel text := lower(btrim(p_papel));
begin
  if not public.is_gestor(p_org) then
    raise exception 'apenas gestor pode adicionar membros';
  end if;
  if v_papel not in ('gestor', 'equipe') then
    raise exception 'papel inválido';
  end if;
  if v_email = '' or position('@' in v_email) = 0 then
    raise exception 'e-mail inválido';
  end if;

  select id into v_user from auth.users where lower(email) = v_email limit 1;
  if v_user is null then
    raise exception 'Nenhuma conta com esse e-mail. Peça para a pessoa criar o login primeiro.';
  end if;

  insert into public.membros (org_id, user_id, papel)
    values (p_org, v_user, v_papel)
    on conflict (org_id, user_id) do update set papel = excluded.papel;

  insert into public.eventos (org_id, entidade, entidade_id, tipo, payload)
    values (p_org, 'membro', v_user, 'membro_adicionado',
            jsonb_build_object('email', v_email, 'papel', v_papel));
  return v_user;
end;
$$;

-- ---------- mudar_papel_membro ----------
create or replace function public.mudar_papel_membro(p_org uuid, p_user uuid, p_papel text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_papel text := lower(btrim(p_papel));
  v_gestores integer;
begin
  if not public.is_gestor(p_org) then
    raise exception 'apenas gestor pode mudar papéis';
  end if;
  if v_papel not in ('gestor', 'equipe') then
    raise exception 'papel inválido';
  end if;

  -- Não deixar a org sem nenhum gestor (rebaixar o último gestor).
  if v_papel = 'equipe' then
    select count(*) into v_gestores from public.membros
      where org_id = p_org and papel = 'gestor';
    if v_gestores <= 1 and exists (
      select 1 from public.membros where org_id = p_org and user_id = p_user and papel = 'gestor'
    ) then
      raise exception 'a organização precisa de ao menos um gestor';
    end if;
  end if;

  update public.membros set papel = v_papel where org_id = p_org and user_id = p_user;
  if not found then raise exception 'membro não encontrado'; end if;

  insert into public.eventos (org_id, entidade, entidade_id, tipo, payload)
    values (p_org, 'membro', p_user, 'membro_papel', jsonb_build_object('papel', v_papel));
end;
$$;

-- ---------- remover_membro ----------
create or replace function public.remover_membro(p_org uuid, p_user uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_gestores integer;
begin
  if not public.is_gestor(p_org) then
    raise exception 'apenas gestor pode remover membros';
  end if;

  -- Não remover o último gestor (deixaria a org órfã).
  if exists (select 1 from public.membros where org_id = p_org and user_id = p_user and papel = 'gestor') then
    select count(*) into v_gestores from public.membros where org_id = p_org and papel = 'gestor';
    if v_gestores <= 1 then
      raise exception 'a organização precisa de ao menos um gestor';
    end if;
  end if;

  delete from public.membros where org_id = p_org and user_id = p_user;
  if not found then raise exception 'membro não encontrado'; end if;

  insert into public.eventos (org_id, entidade, entidade_id, tipo, payload)
    values (p_org, 'membro', p_user, 'membro_removido', '{}'::jsonb);
end;
$$;

-- Permissões: só autenticados; nunca anon/public.
revoke all on function public.listar_membros(uuid) from public, anon;
revoke all on function public.adicionar_membro(uuid, text, text) from public, anon;
revoke all on function public.mudar_papel_membro(uuid, uuid, text) from public, anon;
revoke all on function public.remover_membro(uuid, uuid) from public, anon;
grant execute on function public.listar_membros(uuid) to authenticated;
grant execute on function public.adicionar_membro(uuid, text, text) to authenticated;
grant execute on function public.mudar_papel_membro(uuid, uuid, text) to authenticated;
grant execute on function public.remover_membro(uuid, uuid) to authenticated;
