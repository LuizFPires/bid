-- M7 (segurança) · status, pdf_path, paginas e valor do contrato são definidos
-- SÓ pelo servidor (geração de PDF / assinatura via service_role). Impede que um
-- membro autenticado force 'assinado', troque o PDF ou altere o valor por UPDATE
-- direto (a policy de UPDATE existe para o soft-delete). deleted_at segue livre
-- (guardado por guard_soft_delete: só gestor).

create or replace function public.block_contrato_campos_servidor()
returns trigger language plpgsql as $$
begin
  if auth.uid() is not null and (
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

create trigger trg_contratos_campos_servidor before update on public.contratos
  for each row execute function public.block_contrato_campos_servidor();
