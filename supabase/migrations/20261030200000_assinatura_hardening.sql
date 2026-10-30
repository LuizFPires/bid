-- M7 (segurança) · Endurece a integridade do documento assinado e a criação do
-- contrato (achados da revisão):
--  1) O PDF do contrato passa a ser escrito SÓ pelo servidor (service_role):
--     removem-se as policies de INSERT/UPDATE de cliente no bucket `contratos`.
--     Assim um membro não pode sobrescrever o PDF (inclusive após assinado).
--     O SELECT (download por membro da org) permanece.
--  2) Contratos são criados SÓ via `criar_contrato` (agora SECURITY DEFINER, com
--     checagem explícita de pertencimento): remove-se a policy de INSERT direto,
--     fechando o bypass de `valor`/campos no insert do cliente.

drop policy if exists "bid_contratos_insert" on storage.objects;
drop policy if exists "bid_contratos_update" on storage.objects;

drop policy if exists "contratos_insert" on public.contratos;

create or replace function public.criar_contrato(p_proposta uuid, p_clausulas jsonb)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_org uuid;
  v_certame uuid;
  v_obra uuid;
  v_categoria text;
  v_valor numeric(14, 2);
  v_contrato uuid;
  v_cl jsonb;
begin
  select p.org_id, p.certame_id, c.obra_id, c.categoria, p.valor_atual
    into v_org, v_certame, v_obra, v_categoria, v_valor
    from public.propostas p
    join public.certames c on c.id = p.certame_id
    where p.id = p_proposta and p.deleted_at is null and c.deleted_at is null
      and c.status = 'adjudicada' and c.vencedora_proposta_id = p_proposta;
  if v_org is null then
    raise exception 'contrato exige uma proposta vencedora de certame adjudicado';
  end if;
  -- DEFINER ignora a RLS: autorizar explicitamente o chamador.
  if not public.is_member(v_org) then raise exception 'sem acesso a este contrato'; end if;

  select id into v_contrato from public.contratos
    where proposta_id = p_proposta and deleted_at is null limit 1;
  if v_contrato is not null then
    return v_contrato;
  end if;

  insert into public.contratos (org_id, certame_id, proposta_id, obra_id, categoria, valor, status)
    values (v_org, v_certame, p_proposta, v_obra, v_categoria, v_valor, 'rascunho')
    returning id into v_contrato;

  for v_cl in select * from jsonb_array_elements(coalesce(p_clausulas, '[]'::jsonb))
  loop
    insert into public.contrato_clausulas (org_id, contrato_id, numero, titulo, texto, origem)
      values (
        v_org, v_contrato,
        (v_cl->>'numero')::integer,
        coalesce(v_cl->>'titulo', ''),
        coalesce(v_cl->>'texto', ''),
        coalesce(v_cl->>'origem', 'modelo')
      );
  end loop;

  insert into public.eventos (org_id, entidade, entidade_id, tipo, payload)
    values (v_org, 'contrato', v_contrato, 'contrato_criado',
            jsonb_build_object('proposta', p_proposta, 'certame', v_certame));

  return v_contrato;
end;
$$;

revoke all on function public.criar_contrato(uuid, jsonb) from public, anon;
grant execute on function public.criar_contrato(uuid, jsonb) to authenticated;
