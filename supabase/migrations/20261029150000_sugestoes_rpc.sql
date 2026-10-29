-- M1 · Registro de sugestões (campo livre) com incremento de uso.
-- Insere a sugestão ou soma 1 ao uso se já existir. Checa pertencimento à org.
create or replace function public.registrar_sugestao(p_org uuid, p_tipo text, p_texto text)
returns void language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is not null and not public.is_member(p_org) then
    raise exception 'sem acesso à organização';
  end if;
  if coalesce(trim(p_texto), '') = '' then
    return;
  end if;
  insert into public.sugestoes (org_id, tipo, texto)
    values (p_org, p_tipo, trim(p_texto))
  on conflict (org_id, tipo, texto)
    do update set uso = public.sugestoes.uso + 1, updated_at = now();
end;
$$;
grant execute on function public.registrar_sugestao(uuid, text, text) to authenticated;
