-- M5 · Definir/Desfazer vencedora, atômico. Marca a proposta 'vencedora', o
-- certame 'adjudicada' + vencedora_proposta_id, e grava evento. Devolve os
-- estados anteriores para o "Desfazer" (toast de 5s, regra #11). As demais
-- propostas NÃO mudam de status (reversível e não destrutivo).

create or replace function public.definir_vencedora(p_proposta uuid)
returns jsonb
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_org uuid;
  v_certame uuid;
  v_status_prop text;
  v_status_cert text;
  v_vencedora_anterior uuid;
begin
  select p.org_id, p.certame_id, p.status, c.status, c.vencedora_proposta_id
    into v_org, v_certame, v_status_prop, v_status_cert, v_vencedora_anterior
    from public.propostas p
    join public.certames c on c.id = p.certame_id
    where p.id = p_proposta and p.deleted_at is null and c.deleted_at is null;
  if v_org is null then raise exception 'proposta não encontrada'; end if;

  -- Trocar vencedora: rebaixa a anterior (vencedora única por certame — não
  -- deixa duas propostas 'vencedora'). Idempotente se for a mesma.
  if v_vencedora_anterior is not null and v_vencedora_anterior <> p_proposta then
    update public.propostas set status = 'analise' where id = v_vencedora_anterior;
  end if;

  update public.propostas set status = 'vencedora' where id = p_proposta;
  update public.certames
    set status = 'adjudicada', vencedora_proposta_id = p_proposta
    where id = v_certame;

  insert into public.eventos (org_id, entidade, entidade_id, tipo, payload)
    values (v_org, 'proposta', p_proposta, 'vencedora_definida',
            jsonb_build_object('certame', v_certame,
                               'proposta_status_anterior', v_status_prop,
                               'certame_status_anterior', v_status_cert));

  return jsonb_build_object(
    'certame_id', v_certame,
    'proposta_status_anterior', v_status_prop,
    'certame_status_anterior', v_status_cert
  );
end;
$$;

-- Desfaz, usando os estados anteriores capturados no "Definir" (passados pelo
-- cliente no toast). Limpa a vencedora e reverte os status.
create or replace function public.desfazer_vencedora(
  p_proposta uuid,
  p_certame uuid,
  p_proposta_status text,
  p_certame_status text
) returns void
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_org uuid;
  v_afetou integer;
begin
  -- Reverter nunca mantém 'vencedora' (senão não desfez nada).
  if p_proposta_status not in ('recebida', 'analise', 'desclassificada') then
    raise exception 'status de proposta inválido para desfazer';
  end if;
  if p_certame_status not in ('aberta', 'analise') then
    raise exception 'status de certame inválido para desfazer';
  end if;

  select org_id into v_org from public.propostas where id = p_proposta and deleted_at is null;
  if v_org is null then raise exception 'proposta não encontrada'; end if;

  -- Só desfaz se ESTA proposta é a vencedora corrente do certame (guarda real,
  -- não baseada apenas no enum vindo do cliente).
  update public.certames
    set status = p_certame_status, vencedora_proposta_id = null
    where id = p_certame and vencedora_proposta_id = p_proposta and status = 'adjudicada';
  get diagnostics v_afetou = row_count;
  if v_afetou = 0 then
    raise exception 'nada a desfazer: a proposta não é a vencedora corrente';
  end if;

  update public.propostas set status = p_proposta_status
    where id = p_proposta and status = 'vencedora';

  insert into public.eventos (org_id, entidade, entidade_id, tipo, payload)
    values (v_org, 'proposta', p_proposta, 'vencedora_desfeita',
            jsonb_build_object('certame', p_certame));
exception
  when unique_violation then
    -- Reabrir o certame colidiu com outro certame ativo da mesma obra+categoria
    -- (criado na janela do Desfazer).
    raise exception 'não foi possível desfazer: já existe outro certame ativo desta categoria';
end;
$$;

revoke all on function public.definir_vencedora(uuid) from public, anon;
grant execute on function public.definir_vencedora(uuid) to authenticated;
revoke all on function public.desfazer_vencedora(uuid, uuid, text, text) from public, anon;
grant execute on function public.desfazer_vencedora(uuid, uuid, text, text) to authenticated;
