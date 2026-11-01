-- Reverter a vencedora a qualquer momento (não só no toast de 5 s): a proposta
-- volta a 'analise' (ou 'recebida' se o certame nunca foi equalizado) e o
-- certame deixa de ser adjudicado. Não destrutivo: nada se apaga; evento gravado.
-- Guarda: com contrato ativo da proposta não se reverte — apague o rascunho
-- (ou cancele o emitido) antes; contrato cancelado não impede.
create or replace function public.reverter_vencedora(p_proposta uuid)
returns jsonb
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_org uuid; v_certame uuid; v_status_cert text; v_contrato_status text;
  v_tem_eq boolean; v_prop_novo text; v_cert_novo text; v_afetou int;
begin
  select p.org_id, p.certame_id, c.status
    into v_org, v_certame, v_status_cert
    from public.propostas p
    join public.certames c on c.id = p.certame_id
   where p.id = p_proposta and p.deleted_at is null and c.deleted_at is null
     and p.status = 'vencedora' and c.vencedora_proposta_id = p_proposta;
  if v_org is null then raise exception 'A proposta não é a vencedora corrente deste certame.'; end if;

  select k.status into v_contrato_status from public.contratos k
   where k.proposta_id = p_proposta and k.deleted_at is null and k.status <> 'cancelado'
   order by k.created_at desc limit 1;
  if v_contrato_status is not null then
    if v_contrato_status in ('rascunho', 'devolvido', 'aprovado', 'em_validacao') then
      raise exception 'Esta proposta já tem contrato em andamento: apague o contrato antes de desfazer a vencedora.';
    else
      raise exception 'Esta proposta tem contrato %: cancele o contrato antes de desfazer a vencedora.', v_contrato_status;
    end if;
  end if;

  select exists (select 1 from public.equalizacoes e where e.certame_id = v_certame and e.deleted_at is null) into v_tem_eq;
  v_prop_novo := case when v_tem_eq then 'analise' else 'recebida' end;
  v_cert_novo := case when v_tem_eq then 'analise' else 'aberta' end;

  update public.certames set status = v_cert_novo, vencedora_proposta_id = null
   where id = v_certame and vencedora_proposta_id = p_proposta and status = 'adjudicada';
  get diagnostics v_afetou = row_count;
  if v_afetou = 0 then raise exception 'A proposta não é a vencedora corrente deste certame.'; end if;
  update public.propostas set status = v_prop_novo where id = p_proposta and status = 'vencedora';

  insert into public.eventos (org_id, entidade, entidade_id, tipo, payload)
    values (v_org, 'proposta', p_proposta, 'vencedora_revertida',
            jsonb_build_object('certame', v_certame, 'proposta_status', v_prop_novo, 'certame_status', v_cert_novo, 'certame_status_anterior', v_status_cert));
  return jsonb_build_object('certame_id', v_certame, 'proposta_status', v_prop_novo, 'certame_status', v_cert_novo);
exception
  when unique_violation then
    raise exception 'Não foi possível reverter: já existe outro certame ativo desta categoria na obra.';
end;
$$;
revoke all on function public.reverter_vencedora(uuid) from public, anon;
grant execute on function public.reverter_vencedora(uuid) to authenticated;
