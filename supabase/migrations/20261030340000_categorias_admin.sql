-- Organizar categorias de serviço: listar com uso, renomear e mesclar.
--
-- A categoria vive em certames.categoria (por obra) e em sugestoes. Mesclar
-- "X" em "Y" = em cada obra acessível: se já existe certame ativo de Y, as
-- propostas de X migram para ele e o certame X é desativado (deleted_at); se
-- não existe, o certame X é renomeado para Y. Renomear sem destino existente é
-- o mesmo caminho. Tudo SECURITY INVOKER: só alcança o que a RLS do usuário
-- enxerga. Evento por certame alterado.

create or replace function public.listar_categorias()
returns table (nome text, propostas bigint, obras bigint)
language sql
stable
security invoker
set search_path = public
as $$
  select c.categoria as nome,
         count(p.id) filter (where p.deleted_at is null) as propostas,
         count(distinct c.obra_id) as obras
    from public.certames c
    left join public.propostas p on p.certame_id = c.id
   where c.deleted_at is null
   group by c.categoria
  union all
  select s.texto, 0::bigint, 0::bigint
    from public.sugestoes s
   where s.tipo = 'categoria'
     and not exists (select 1 from public.certames c where c.categoria = s.texto and c.deleted_at is null)
   order by 2 desc, 1;
$$;

create or replace function public.mesclar_categoria(p_de text, p_para text)
returns integer
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_de text := nullif(btrim(p_de), '');
  v_para text := nullif(btrim(p_para), '');
  r record;
  v_alvo uuid;
  v_n integer := 0;
begin
  if v_de is null or v_para is null then raise exception 'Informe as duas categorias.'; end if;
  if v_de = v_para then return 0; end if;

  for r in
    select c.id, c.org_id, c.obra_id, c.status
      from public.certames c
     where c.categoria = v_de and c.deleted_at is null
  loop
    if r.status = 'adjudicada' then
      raise exception 'A tomada de preços "%" já foi adjudicada em uma obra; desfaça a adjudicação antes de mesclar.', v_de;
    end if;

    select id into v_alvo
      from public.certames
     where org_id = r.org_id and obra_id = r.obra_id and categoria = v_para
       and status <> 'adjudicada' and deleted_at is null
     limit 1;

    if v_alvo is null then
      -- Sem destino na obra: renomeia o certame.
      update public.certames set categoria = v_para, titulo = v_para where id = r.id;
    else
      -- Com destino: propostas migram e o certame de origem é desativado.
      update public.propostas set certame_id = v_alvo where certame_id = r.id and deleted_at is null;
      update public.certames set deleted_at = now() where id = r.id;
    end if;

    insert into public.eventos (org_id, entidade, entidade_id, tipo, payload)
      values (r.org_id, 'certame', r.id, 'categoria_mesclada',
              jsonb_build_object('de', v_de, 'para', v_para, 'destino', v_alvo));
    v_n := v_n + 1;
  end loop;

  -- Sugestões: a antiga sai; a nova ganha o uso.
  update public.sugestoes s
     set uso = s.uso + coalesce((select uso from public.sugestoes o where o.org_id = s.org_id and o.tipo = 'categoria' and o.texto = v_de), 0)
   where s.tipo = 'categoria' and s.texto = v_para;
  insert into public.sugestoes (org_id, tipo, texto, uso)
    select o.org_id, 'categoria', v_para, o.uso
      from public.sugestoes o
     where o.tipo = 'categoria' and o.texto = v_de
       and not exists (select 1 from public.sugestoes n where n.org_id = o.org_id and n.tipo = 'categoria' and n.texto = v_para);
  delete from public.sugestoes where tipo = 'categoria' and texto = v_de;

  return v_n;
end;
$$;

-- Sugestões podem ser removidas por quem colabora com a org (limpeza de categoria).
drop policy if exists "sugestoes_delete" on public.sugestoes;
create policy "sugestoes_delete" on public.sugestoes
  for delete to authenticated using (public.colabora_org(org_id));

revoke all on function public.listar_categorias() from public, anon;
revoke all on function public.mesclar_categoria(text, text) from public, anon;
grant execute on function public.listar_categorias() to authenticated;
grant execute on function public.mesclar_categoria(text, text) to authenticated;
