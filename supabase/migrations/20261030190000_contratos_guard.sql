-- M7 (segurança) · status, pdf_path, paginas e valor do contrato são definidos
-- SÓ pelo servidor (geração de PDF / assinatura via service_role). Impede que um
-- membro autenticado force 'assinado', troque o PDF ou altere o valor por UPDATE
-- direto (a policy de UPDATE existe para o soft-delete). deleted_at segue livre
-- (guardado por guard_soft_delete: só gestor).

create or replace function public.block_contrato_campos_servidor()
returns trigger language plpgsql as $$
begin
  if auth.uid() is null then
    return new;  -- servidor (service_role): livre
  end if;
  if tg_op = 'INSERT' then
    -- Cliente só cria rascunho sem PDF; status/PDF são do servidor.
    new.status := 'rascunho';
    new.pdf_path := null;
    new.paginas := null;
  elsif tg_op = 'UPDATE' and (
       new.status is distinct from old.status
    or new.pdf_path is distinct from old.pdf_path
    or new.paginas is distinct from old.paginas
    or new.valor is distinct from old.valor
  ) then
    raise exception 'status/PDF/valor do contrato são definidos pelo servidor';
  end if;
  return new;
end;
$$;

create trigger trg_contratos_campos_servidor before insert or update on public.contratos
  for each row execute function public.block_contrato_campos_servidor();

-- Não editar cláusulas depois que QUALQUER parte já assinou (o PDF assinado
-- divergiria do texto). Vale para o cliente; o servidor não edita cláusulas.
create or replace function public.block_clausula_pos_assinatura()
returns trigger language plpgsql as $$
begin
  if auth.uid() is not null and exists (
    select 1 from public.assinaturas a
    where a.contrato_id = coalesce(new.contrato_id, old.contrato_id)
      and a.assinado_em is not null
  ) then
    raise exception 'o contrato já tem assinatura: não é possível editar cláusulas';
  end if;
  return coalesce(new, old);
end;
$$;
create trigger trg_clausula_pos_assinatura before insert or update on public.contrato_clausulas
  for each row execute function public.block_clausula_pos_assinatura();
