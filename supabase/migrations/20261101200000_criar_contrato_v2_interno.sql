-- Homologação (01/11): `criar_contrato_v2` inseria com modelo_id, mas o trigger
-- block_contrato_campos_servidor zera modelo_id em INSERT de usuário (auth.uid()
-- presente) quando o sinal interno não está ligado — o contrato nascia LEGADO e
-- /api/contracts/dossie respondia 409. A RPC é security definer e já validou
-- tudo: liga `bid.interno` só em volta do insert. Recupera os contratos criados
-- nesse estado (evento contrato_criado_v2 sem modelo_id).
create or replace function public.criar_contrato_v2(p_proposta uuid)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_org uuid; v_certame uuid; v_obra uuid; v_categoria text; v_valor numeric(14,2);
  v_contrato uuid; v_modelo uuid;
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
  if not public.pode_obra(v_obra) then raise exception 'sem acesso a esta obra'; end if;

  select id into v_contrato from public.contratos
    where proposta_id = p_proposta and deleted_at is null limit 1;
  if v_contrato is not null then return v_contrato; end if;

  select id into v_modelo from public.contrato_modelos where org_id = v_org and ativo limit 1;
  if v_modelo is null then raise exception 'organização sem modelo de minuta ativo' using errcode = 'P0201'; end if;

  perform set_config('bid.interno', '1', true);
  insert into public.contratos (org_id, certame_id, proposta_id, obra_id, categoria, valor, status, modelo_id)
    values (v_org, v_certame, p_proposta, v_obra, v_categoria, v_valor, 'rascunho', v_modelo)
    returning id into v_contrato;
  perform set_config('bid.interno', '0', true);

  insert into public.eventos (org_id, entidade, entidade_id, tipo, payload)
    values (v_org, 'contrato', v_contrato, 'contrato_criado_v2',
            jsonb_build_object('proposta', p_proposta, 'certame', v_certame, 'modelo', v_modelo));
  return v_contrato;
end;
$$;

-- Recupera contratos v2 que nasceram sem modelo (só os com evento contrato_criado_v2 e ainda em rascunho).
update public.contratos k
   set modelo_id = (e.payload->>'modelo')::uuid
  from public.eventos e
 where e.entidade = 'contrato' and e.entidade_id = k.id and e.tipo = 'contrato_criado_v2'
   and k.modelo_id is null and k.status = 'rascunho' and k.deleted_at is null
   and exists (select 1 from public.contrato_modelos m where m.id = (e.payload->>'modelo')::uuid and m.org_id = k.org_id);
