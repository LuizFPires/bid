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
begin
  select p.org_id, p.certame_id, p.status, c.status
    into v_org, v_certame, v_status_prop, v_status_cert
    from public.propostas p
    join public.certames c on c.id = p.certame_id
    where p.id = p_proposta and p.deleted_at is null and c.deleted_at is null;
  if v_org is null then raise exception 'proposta não encontrada'; end if;

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
begin
  if p_proposta_status not in ('recebida', 'analise', 'vencedora', 'desclassificada') then
    raise exception 'status de proposta inválido';
  end if;
  if p_certame_status not in ('aberta', 'analise', 'adjudicada') then
    raise exception 'status de certame inválido';
  end if;

  select org_id into v_org from public.propostas where id = p_proposta and deleted_at is null;
  if v_org is null then raise exception 'proposta não encontrada'; end if;

  update public.certames
    set status = p_certame_status, vencedora_proposta_id = null
    where id = p_certame and vencedora_proposta_id = p_proposta;
  update public.propostas set status = p_proposta_status where id = p_proposta;

  insert into public.eventos (org_id, entidade, entidade_id, tipo, payload)
    values (v_org, 'proposta', p_proposta, 'vencedora_desfeita',
            jsonb_build_object('certame', p_certame));
end;
$$;

revoke all on function public.definir_vencedora(uuid) from public, anon;
grant execute on function public.definir_vencedora(uuid) to authenticated;
revoke all on function public.desfazer_vencedora(uuid, uuid, text, text) from public, anon;
grant execute on function public.desfazer_vencedora(uuid, uuid, text, text) to authenticated;
