-- Revisão de segurança: os guards de exclusão de equalização e contrato
-- decidem por old.certame_id / old.obra_id. Para que ninguém "mude de obra"
-- uma linha antes de apagá-la (ou leve-a para onde é dono), essas chaves ficam
-- IMUTÁVEIS para o cliente (servidor/service_role segue livre).

create or replace function public.block_equalizacao_chaves()
returns trigger language plpgsql as $$
begin
  if auth.uid() is not null and (
       new.certame_id is distinct from old.certame_id
    or new.criado_por is distinct from old.criado_por
    or new.proposta_ids is distinct from old.proposta_ids
  ) then
    raise exception 'certame, propostas e criador da equalização são imutáveis';
  end if;
  return new;
end;
$$;
drop trigger if exists trg_equalizacoes_chaves on public.equalizacoes;
create trigger trg_equalizacoes_chaves before update on public.equalizacoes
  for each row execute function public.block_equalizacao_chaves();

create or replace function public.block_contrato_chaves()
returns trigger language plpgsql as $$
begin
  if auth.uid() is not null and (
       new.obra_id is distinct from old.obra_id
    or new.certame_id is distinct from old.certame_id
    or new.proposta_id is distinct from old.proposta_id
  ) then
    raise exception 'obra, certame e proposta do contrato são imutáveis';
  end if;
  return new;
end;
$$;
drop trigger if exists trg_contratos_chaves on public.contratos;
create trigger trg_contratos_chaves before update on public.contratos
  for each row execute function public.block_contrato_chaves();
