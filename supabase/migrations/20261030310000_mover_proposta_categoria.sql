-- Editar a CATEGORIA de uma proposta já arquivada.
--
-- A categoria vive no certame (obra + categoria). Mudar a categoria = mover a
-- proposta para o certame ativo dessa categoria na MESMA obra (criando-o se não
-- existir), com a mesma regra de reaproveitamento do criar_proposta. Casos de
-- uso: a IA/usuário errou a categoria no cadastro, ou propostas que precisam
-- ficar na mesma categoria para serem equalizadas.
-- Travas: não move a VENCEDORA de um certame adjudicado (desadjudique antes) nem
-- para um certame já adjudicado. Evento registrado (regra #10).

create or replace function public.mover_proposta_categoria(p_proposta uuid, p_categoria text)
returns uuid
language plpgsql
security invoker            -- RLS: só quem acessa a obra; guards continuam valendo
set search_path = public
as $$
declare
  v_org uuid;
  v_obra uuid;
  v_certame_antigo uuid;
  v_certame uuid;
  v_categoria text := nullif(btrim(p_categoria), '');
  v_categoria_antiga text;
begin
  if v_categoria is null then raise exception 'Informe a categoria.'; end if;

  select p.org_id, p.certame_id, c.obra_id, c.categoria
    into v_org, v_certame_antigo, v_obra, v_categoria_antiga
    from public.propostas p
    join public.certames c on c.id = p.certame_id
    where p.id = p_proposta and p.deleted_at is null;
  if v_org is null then raise exception 'proposta não encontrada'; end if;

  if v_categoria = v_categoria_antiga then return v_certame_antigo; end if;

  if exists (
    select 1 from public.certames
    where id = v_certame_antigo and vencedora_proposta_id = p_proposta
  ) then
    raise exception 'Esta proposta é a vencedora da tomada de preços atual. Desfaça a adjudicação antes de mudar a categoria.';
  end if;

  select id into v_certame
    from public.certames
    where org_id = v_org and obra_id = v_obra and categoria = v_categoria
      and status <> 'adjudicada' and deleted_at is null
    limit 1;

  if v_certame is null then
    insert into public.certames (org_id, obra_id, categoria, titulo, status)
      values (v_org, v_obra, v_categoria, v_categoria, 'aberta')
      on conflict (org_id, obra_id, categoria)
        where (status <> 'adjudicada' and deleted_at is null)
        do nothing
      returning id into v_certame;
    if v_certame is null then
      select id into v_certame
        from public.certames
        where org_id = v_org and obra_id = v_obra and categoria = v_categoria
          and status <> 'adjudicada' and deleted_at is null
        limit 1;
    end if;
  end if;

  update public.propostas set certame_id = v_certame where id = p_proposta;

  insert into public.eventos (org_id, entidade, entidade_id, tipo, payload)
    values (v_org, 'proposta', p_proposta, 'proposta_categoria_alterada',
            jsonb_build_object('de', v_categoria_antiga, 'para', v_categoria,
                               'certame_de', v_certame_antigo, 'certame_para', v_certame));
  return v_certame;
end;
$$;

revoke all on function public.mover_proposta_categoria(uuid, text) from public, anon;
grant execute on function public.mover_proposta_categoria(uuid, text) to authenticated;
