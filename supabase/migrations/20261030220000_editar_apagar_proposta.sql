-- Editar e apagar proposta.
--
-- EDITAR: corrige os dados da proposta (fornecedor + valor/prazo/pagamento/
-- garantia) SEM criar uma nova versão — é correção, não revisão (regra #5 vale
-- para revisões). Atualiza os campos "atuais" da proposta E a última versão, em
-- sincronia, de forma atômica. RLS (membro da org) continua valendo.
--
-- APAGAR: exclusão LÓGICA (deleted_at) — nada se apaga de fato (regra #10). O
-- trigger guard_soft_delete já exige GESTOR para mexer em deleted_at. Tem
-- "Desfazer" via restaurar_proposta (regra #11). Se a proposta era a vencedora
-- do certame, desadjudica (limpa vencedora_proposta_id e volta o certame a
-- 'analise') para não deixar referência pendente. Bloqueia se já virou contrato.

-- ---------- editar_proposta ----------
create or replace function public.editar_proposta(
  p_proposta uuid,
  p_fornecedor text,
  p_valor numeric,
  p_prazo integer,
  p_pagamento text,
  p_garantia text,
  p_obs text
) returns void
language plpgsql
security invoker            -- RLS: o usuário só edita proposta da própria org
set search_path = public
as $$
declare
  v_org uuid;
  v_n integer;
  v_forn text := nullif(btrim(p_fornecedor), '');
begin
  if v_forn is null then raise exception 'Informe o fornecedor.'; end if;

  select org_id, versao_atual into v_org, v_n
    from public.propostas
    where id = p_proposta and deleted_at is null;
  if v_org is null then raise exception 'proposta não encontrada'; end if;

  update public.propostas set
    fornecedor = v_forn,
    valor_atual = p_valor,
    prazo_atual = p_prazo,
    condicao_pagamento = p_pagamento,
    garantia = p_garantia
  where id = p_proposta;

  -- Correção em cima da versão atual (não cria v+1): mantém "atual" e versão
  -- coerentes. O histórico de versões anteriores permanece intacto.
  update public.proposta_versoes set
    valor = p_valor,
    prazo = p_prazo,
    condicao_pagamento = p_pagamento,
    garantia = p_garantia,
    obs = p_obs
  where proposta_id = p_proposta and n = v_n;

  insert into public.eventos (org_id, entidade, entidade_id, tipo, payload)
  values (
    v_org, 'proposta', p_proposta, 'proposta_editada',
    jsonb_build_object('n', v_n, 'fornecedor', v_forn, 'valor', p_valor, 'prazo', p_prazo)
  );
end;
$$;

-- ---------- apagar_proposta (exclusão lógica) ----------
create or replace function public.apagar_proposta(p_proposta uuid)
returns void
language plpgsql
security invoker            -- guard_soft_delete exige GESTOR; RLS escopa à org
set search_path = public
as $$
declare
  v_org uuid;
  v_certame uuid;
  v_era_vencedora boolean;
begin
  select p.org_id, p.certame_id, (c.vencedora_proposta_id = p.id)
    into v_org, v_certame, v_era_vencedora
    from public.propostas p
    join public.certames c on c.id = p.certame_id
    where p.id = p_proposta and p.deleted_at is null;
  if v_org is null then raise exception 'proposta não encontrada'; end if;

  -- Não apagar uma proposta que já virou contrato (anexo/fonte das cláusulas).
  if exists (
    select 1 from public.contratos
    where proposta_id = p_proposta and deleted_at is null
  ) then
    raise exception 'Esta proposta virou contrato. Exclua o contrato antes de apagar a proposta.';
  end if;

  -- Desadjudica o certame se estávamos apagando a vencedora (sem referência órfã).
  if coalesce(v_era_vencedora, false) then
    update public.certames
      set vencedora_proposta_id = null, status = 'analise'
      where id = v_certame;
    update public.propostas
      set status = 'recebida'
      where id = p_proposta;
  end if;

  update public.propostas set deleted_at = now() where id = p_proposta;

  insert into public.eventos (org_id, entidade, entidade_id, tipo, payload)
  values (v_org, 'proposta', p_proposta, 'proposta_excluida',
          jsonb_build_object('era_vencedora', coalesce(v_era_vencedora, false)));
end;
$$;

-- ---------- restaurar_proposta (Desfazer do apagar) ----------
create or replace function public.restaurar_proposta(p_proposta uuid)
returns void
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_org uuid;
begin
  select org_id into v_org
    from public.propostas
    where id = p_proposta and deleted_at is not null;
  if v_org is null then raise exception 'proposta não encontrada ou já ativa'; end if;

  update public.propostas set deleted_at = null where id = p_proposta;

  insert into public.eventos (org_id, entidade, entidade_id, tipo, payload)
  values (v_org, 'proposta', p_proposta, 'proposta_restaurada', '{}'::jsonb);
end;
$$;

-- Permissões: só usuários autenticados; nunca anon/public.
revoke all on function public.editar_proposta(uuid, text, numeric, integer, text, text, text) from public, anon;
revoke all on function public.apagar_proposta(uuid) from public, anon;
revoke all on function public.restaurar_proposta(uuid) from public, anon;
grant execute on function public.editar_proposta(uuid, text, numeric, integer, text, text, text) to authenticated;
grant execute on function public.apagar_proposta(uuid) to authenticated;
grant execute on function public.restaurar_proposta(uuid) to authenticated;
