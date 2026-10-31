-- Lote de propostas: arquivar várias propostas (mesma obra e categoria) de uma
-- vez, em UMA transação — se uma falhar, nenhuma fica pela metade.
-- Reusa criar_proposta / criar_versao (mesmas regras, eventos e RLS).

create or replace function public.criar_propostas_lote(
  p_obra uuid,
  p_categoria text,
  p_itens jsonb
) returns uuid[]
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_item jsonb;
  v_id uuid;
  v_ids uuid[] := '{}';
  v_org uuid;
  v_n integer := 0;
begin
  if p_itens is null or jsonb_typeof(p_itens) <> 'array' then
    raise exception 'itens do lote inválidos';
  end if;
  if jsonb_array_length(p_itens) = 0 then
    raise exception 'lote vazio';
  end if;
  if jsonb_array_length(p_itens) > 30 then
    raise exception 'lote grande demais (máx. 30 propostas)';
  end if;

  select org_id into v_org from public.obras where id = p_obra and deleted_at is null;
  if v_org is null then raise exception 'obra não encontrada'; end if;

  for v_item in select * from jsonb_array_elements(p_itens) loop
    if nullif(v_item->>'proposta_id', '') is not null then
      -- Fornecedor já tem proposta na categoria: entra como NOVA VERSÃO dela.
      v_id := (v_item->>'proposta_id')::uuid;
      perform public.criar_versao(
        v_id,
        (v_item->>'valor')::numeric,
        (v_item->>'prazo')::integer,
        v_item->>'pagamento',
        v_item->>'garantia',
        v_item->>'obs',
        v_item->>'arquivo_path',
        coalesce(v_item->'dados', '{}'::jsonb)
      );
    else
      v_id := public.criar_proposta(
        p_obra,
        p_categoria,
        v_item->>'fornecedor',
        (v_item->>'valor')::numeric,
        (v_item->>'prazo')::integer,
        v_item->>'pagamento',
        v_item->>'garantia',
        v_item->>'obs',
        v_item->>'arquivo_path',
        coalesce(v_item->'dados', '{}'::jsonb),
        nullif(v_item->>'opcao', '')
      );
    end if;
    v_ids := array_append(v_ids, v_id);
    v_n := v_n + 1;
  end loop;

  -- Trilha: um evento do lote na obra (cada proposta já tem o seu).
  insert into public.eventos (org_id, entidade, entidade_id, tipo, payload)
  values (v_org, 'obra', p_obra, 'lote_propostas', jsonb_build_object('categoria', p_categoria, 'total', v_n, 'propostas', to_jsonb(v_ids)));

  return v_ids;
end;
$$;

revoke all on function public.criar_propostas_lote(uuid, text, jsonb) from public, anon;
grant execute on function public.criar_propostas_lote(uuid, text, jsonb) to authenticated;
