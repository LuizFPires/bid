-- Proposta que virou contrato não se apaga enquanto o contrato existir
-- (pedido do usuário, 01/11). `apagar_proposta` já recusava; aqui a regra passa
-- a ignorar contrato CANCELADO (encerrado) e ganha um trigger para o caminho
-- direto (update de deleted_at), com a mesma mensagem. Apagar o contrato
-- (rascunho/devolvido/aprovado) libera a exclusão da proposta.
create or replace function public.proposta_tem_contrato(p_proposta uuid)
returns boolean language sql stable security definer set search_path = public as $$
  -- Só responde para proposta que o chamador pode ver (não vira oráculo de outras orgs).
  select public.pode_proposta(p_proposta) and exists (
    select 1 from public.contratos k
     where k.proposta_id = p_proposta and k.deleted_at is null and k.status <> 'cancelado'
  );
$$;
revoke all on function public.proposta_tem_contrato(uuid) from public, anon;
grant execute on function public.proposta_tem_contrato(uuid) to authenticated;

create or replace function public.block_delete_proposta_com_contrato()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.deleted_at is not null and old.deleted_at is null and public.proposta_tem_contrato(old.id) then
    raise exception 'Esta proposta tem contrato. Apague (ou cancele) o contrato antes de apagar a proposta.';
  end if;
  return new;
end;
$$;
drop trigger if exists trg_proposta_block_delete_contrato on public.propostas;
create trigger trg_proposta_block_delete_contrato before update of deleted_at on public.propostas
  for each row execute function public.block_delete_proposta_com_contrato();

create or replace function public.apagar_proposta(p_proposta uuid)
returns void
language plpgsql
security invoker
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
  if not public.gerencia_proposta(p_proposta) then raise exception 'Só o dono ou um gestor da obra pode excluir a proposta.'; end if;
  if public.proposta_tem_contrato(p_proposta) then
    raise exception 'Esta proposta tem contrato. Apague (ou cancele) o contrato antes de apagar a proposta.';
  end if;

  if coalesce(v_era_vencedora, false) then
    update public.certames set vencedora_proposta_id = null, status = 'analise' where id = v_certame;
    update public.propostas set status = 'recebida' where id = p_proposta;
  end if;
  update public.propostas set deleted_at = now() where id = p_proposta;
  insert into public.eventos (org_id, entidade, entidade_id, tipo, payload)
    values (v_org, 'proposta', p_proposta, 'proposta_excluida', jsonb_build_object('certame', v_certame, 'era_vencedora', coalesce(v_era_vencedora, false)));
end;
$$;
