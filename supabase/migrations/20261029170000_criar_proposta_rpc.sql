-- M2 · Criação de proposta ATÔMICA (proposta + 1ª versão + certame) num RPC
-- transacional. Resolve o achado da revisão: antes o cliente fazia 3 inserts
-- separados (proposta podia ficar órfã sem versão) e um SELECT→INSERT de certame
-- sujeito a corrida (dois certames ativos para a mesma obra+categoria).
--
-- As INVARIANTES de escrita (reaproveitar certame ativo, status iniciais,
-- numeração da versão) ficam aqui — única camada capaz de garantir atomicidade
-- e ausência de corrida. As normalizações PURAS seguem no core (testadas).

-- Um só certame ATIVO (não adjudicado) por obra+categoria: elimina duplicatas
-- por corrida (ON CONFLICT usa este índice parcial).
create unique index if not exists uq_certame_ativo_obra_categoria
  on public.certames (org_id, obra_id, categoria)
  where (status <> 'adjudicada' and deleted_at is null);

create or replace function public.criar_proposta(
  p_obra uuid,
  p_categoria text,
  p_fornecedor text,
  p_valor numeric,
  p_prazo integer,
  p_pagamento text,
  p_garantia text,
  p_obs text,
  p_arquivo_path text,
  p_dados jsonb
) returns uuid
language plpgsql
security invoker            -- RLS continua valendo: o usuário só grava na própria org
set search_path = public
as $$
declare
  v_org uuid;
  v_certame uuid;
  v_proposta uuid;
  v_categoria text := nullif(btrim(p_categoria), '');
  v_fornecedor text := nullif(btrim(p_fornecedor), '');
begin
  if v_categoria is null then raise exception 'categoria é obrigatória'; end if;
  if v_fornecedor is null then raise exception 'fornecedor é obrigatório'; end if;

  -- Org vem da obra (RLS garante que o usuário é membro; senão não a enxerga).
  select org_id into v_org from public.obras where id = p_obra and deleted_at is null;
  if v_org is null then raise exception 'obra não encontrada'; end if;

  -- Reaproveita o certame ativo ou cria um 'aberta' (atômico via índice parcial).
  select id into v_certame
    from public.certames
    where org_id = v_org and obra_id = p_obra and categoria = v_categoria
      and status <> 'adjudicada' and deleted_at is null
    limit 1;

  if v_certame is null then
    insert into public.certames (org_id, obra_id, categoria, titulo, status)
      values (v_org, p_obra, v_categoria, v_categoria, 'aberta')
      on conflict (org_id, obra_id, categoria)
        where (status <> 'adjudicada' and deleted_at is null)
        do nothing
      returning id into v_certame;

    if v_certame is null then
      -- Corrida: outra sessão criou o certame; reusa o existente.
      select id into v_certame
        from public.certames
        where org_id = v_org and obra_id = p_obra and categoria = v_categoria
          and status <> 'adjudicada' and deleted_at is null
        limit 1;
    end if;
  end if;

  insert into public.propostas (
    org_id, certame_id, fornecedor, status,
    valor_atual, prazo_atual, condicao_pagamento, garantia, versao_atual
  ) values (
    v_org, v_certame, v_fornecedor, 'recebida',
    p_valor, p_prazo, p_pagamento, p_garantia, 1
  ) returning id into v_proposta;

  insert into public.proposta_versoes (
    org_id, proposta_id, n, valor, prazo, condicao_pagamento, garantia, obs,
    arquivo_path, dados_extraidos
  ) values (
    v_org, v_proposta, 1, p_valor, p_prazo, p_pagamento, p_garantia, p_obs,
    p_arquivo_path, p_dados
  );

  return v_proposta;
end;
$$;

-- Fail-closed: só usuários autenticados executam.
revoke all on function public.criar_proposta(
  uuid, text, text, numeric, integer, text, text, text, text, jsonb
) from public, anon;
grant execute on function public.criar_proposta(
  uuid, text, text, numeric, integer, text, text, text, text, jsonb
) to authenticated;
