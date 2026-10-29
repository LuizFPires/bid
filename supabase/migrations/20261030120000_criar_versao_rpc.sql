-- M3 · Nova versão de uma proposta, ATÔMICA (insere a versão n+1 e atualiza a
-- proposta num só RPC transacional). Preserva o histórico: versões anteriores
-- e seus arquivos nunca são apagados (regra #5/#10). Invariantes de escrita
-- (numeração da versão, atualização dos campos "atuais") moram no banco.

create or replace function public.criar_versao(
  p_proposta uuid,
  p_valor numeric,
  p_prazo integer,
  p_pagamento text,
  p_garantia text,
  p_obs text,
  p_arquivo_path text,
  p_dados jsonb
) returns integer
language plpgsql
security invoker            -- RLS continua valendo (o usuário só mexe na própria org)
set search_path = public
as $$
declare
  v_org uuid;
  v_n integer;
begin
  -- Proposta + próxima versão (RLS garante o pertencimento).
  select org_id, versao_atual + 1 into v_org, v_n
    from public.propostas
    where id = p_proposta and deleted_at is null;
  if v_org is null then raise exception 'proposta não encontrada'; end if;

  insert into public.proposta_versoes (
    org_id, proposta_id, n, valor, prazo, condicao_pagamento, garantia, obs,
    arquivo_path, dados_extraidos
  ) values (
    v_org, p_proposta, v_n, p_valor, p_prazo, p_pagamento, p_garantia, p_obs,
    p_arquivo_path, p_dados
  );

  update public.propostas set
    versao_atual = v_n,
    valor_atual = p_valor,
    prazo_atual = p_prazo,
    condicao_pagamento = p_pagamento,
    garantia = p_garantia
  where id = p_proposta;

  -- Trilha de auditoria (regra #10): registra a revisão. O autor é forçado ao
  -- usuário autenticado pelo trigger force_evento_autor.
  insert into public.eventos (org_id, entidade, entidade_id, tipo, payload)
  values (
    v_org, 'proposta', p_proposta, 'versao_criada',
    jsonb_build_object('n', v_n, 'valor', p_valor, 'prazo', p_prazo)
  );

  return v_n;
exception
  when unique_violation then
    -- Corrida: outra sessão criou a versão n em paralelo. Mensagem amigável
    -- (a transação é abortada por inteiro — sem versão duplicada nem update perdido).
    raise exception 'Esta proposta foi revisada em paralelo. Recarregue e tente de novo.';
end;
$$;

revoke all on function public.criar_versao(
  uuid, numeric, integer, text, text, text, text, jsonb
) from public, anon;
grant execute on function public.criar_versao(
  uuid, numeric, integer, text, text, text, text, jsonb
) to authenticated;
