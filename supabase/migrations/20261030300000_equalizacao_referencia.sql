-- Equalização "na mesma régua": o usuário pode informar, ao iniciar, a
-- REFERÊNCIA DO PROJETO (quantidades/escopo que toda proposta deveria cobrir —
-- ex.: "898,94 m² de ACM + letreiros + plataforma"). A IA usa isso como base
-- comum para equalizar. Opcional.

alter table public.equalizacoes add column if not exists referencia text;
comment on column public.equalizacoes.referencia is
  'Régua do projeto (quantidades/escopo de referência) informada pelo usuário; a IA equaliza as propostas nessa base.';

-- Assinatura muda (4 → 5 parâmetros): remove a antiga (sobrecarga ambígua no PostgREST).
drop function if exists public.criar_equalizacao(text, text, uuid, uuid[]);

create or replace function public.criar_equalizacao(
  p_escopo text,
  p_categoria text,
  p_certame uuid,
  p_proposta_ids uuid[],
  p_referencia text default null
) returns uuid
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_org uuid;
  v_orgs uuid[];
  v_qtd integer;
  v_categoria text := nullif(btrim(p_categoria), '');
  v_referencia text := nullif(btrim(coalesce(p_referencia, '')), '');
  v_eq uuid;
  v_certame uuid := case when p_escopo = 'obra' then p_certame else null end;
begin
  if v_categoria is null then raise exception 'categoria é obrigatória'; end if;
  if p_escopo not in ('obra', 'entre_obras') then raise exception 'escopo inválido'; end if;
  if coalesce(array_length(p_proposta_ids, 1), 0) < 2 then
    raise exception 'selecione ao menos duas propostas';
  end if;
  if p_escopo = 'obra' and p_certame is null then
    raise exception 'escopo obra exige um certame';
  end if;
  if v_referencia is not null and length(v_referencia) > 4000 then
    raise exception 'referência do projeto longa demais (máx. 4000 caracteres)';
  end if;

  select array_agg(distinct org_id), count(*)
    into v_orgs, v_qtd
    from public.propostas
    where id = any (p_proposta_ids) and deleted_at is null;

  if v_qtd <> array_length(p_proposta_ids, 1) then
    raise exception 'alguma proposta não existe ou não é acessível';
  end if;
  if array_length(v_orgs, 1) <> 1 then
    raise exception 'as propostas devem ser da mesma organização';
  end if;
  v_org := v_orgs[1];

  if p_escopo = 'obra' then
    if exists (
      select 1 from public.propostas
      where id = any (p_proposta_ids) and certame_id is distinct from p_certame
    ) then
      raise exception 'todas as propostas devem ser do certame informado';
    end if;
  else
    if exists (
      select 1 from public.propostas p
      join public.certames c on c.id = p.certame_id
      where p.id = any (p_proposta_ids) and c.categoria is distinct from v_categoria
    ) then
      raise exception 'todas as propostas devem ser da categoria informada';
    end if;
  end if;

  insert into public.equalizacoes (org_id, escopo, categoria, certame_id, proposta_ids, referencia)
    values (v_org, p_escopo, v_categoria, v_certame, p_proposta_ids, v_referencia)
    returning id into v_eq;

  if v_certame is not null then
    update public.certames set status = 'analise'
      where id = v_certame and org_id = v_org and status = 'aberta';
  end if;

  insert into public.eventos (org_id, entidade, entidade_id, tipo, payload)
    values (v_org, 'equalizacao', v_eq, 'equalizacao_criada',
            jsonb_build_object('escopo', p_escopo, 'categoria', v_categoria, 'propostas', p_proposta_ids,
                               'com_referencia', v_referencia is not null));

  return v_eq;
end;
$$;

revoke all on function public.criar_equalizacao(text, text, uuid, uuid[], text) from public, anon;
grant execute on function public.criar_equalizacao(text, text, uuid, uuid[], text) to authenticated;
