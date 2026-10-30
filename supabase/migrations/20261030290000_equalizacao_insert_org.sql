-- Revisão de segurança: INSERT de equalização ENTRE OBRAS só por membro da org
-- (a cláusula "criado_por = auth.uid()" fica para leitura/atualização — no insert
-- ela permitiria gravar numa org alheia). E criado_por é forçado = auth.uid().
--
-- Nota: pdf_path de contratos e assinatura_img_path já são só do servidor
-- (block_contrato_campos_servidor; assinaturas sem policy de escrita do cliente).

create or replace function public.force_equalizacao_criador()
returns trigger language plpgsql as $$
begin
  if auth.uid() is not null then
    if tg_op = 'INSERT' then
      new.criado_por := auth.uid();
    else
      new.criado_por := old.criado_por;
    end if;
  end if;
  return new;
end;
$$;
drop trigger if exists trg_equalizacoes_criador on public.equalizacoes;
create trigger trg_equalizacoes_criador before insert or update on public.equalizacoes
  for each row execute function public.force_equalizacao_criador();

drop policy if exists "equalizacoes_insert" on public.equalizacoes;
create policy "equalizacoes_insert" on public.equalizacoes
  for insert to authenticated with check (
    case when certame_id is not null then public.pode_certame(certame_id)
         else public.is_member(org_id) end);
