-- M12 · Validação do contrato v2 (PRD-contratos §4 passo 8, §5 RC-07/08/10):
-- aprovações (enviado/aprovado/devolvido) com hash, RPCs enviar_validacao,
-- devolver_contrato e aprovar_contrato, e "aprovação superada" quando o
-- contrato aprovado volta a rascunho por edição. Hash e `_faltando` são do
-- servidor (rota /api/contracts/preview, service_role); o cliente só compara.

create table if not exists public.contrato_aprovacoes (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizacoes(id) on delete cascade,
  contrato_id uuid not null,
  acao text not null check (acao in ('enviado', 'aprovado', 'devolvido')),
  conteudo_hash text not null,
  comentario text,
  autoaprovacao boolean not null default false,
  situacao text not null default 'vigente' check (situacao in ('vigente', 'superada')),
  autor uuid not null default auth.uid(),
  created_at timestamptz not null default now(),
  foreign key (contrato_id, org_id) references public.contratos(id, org_id) on delete cascade
);
create index if not exists idx_aprovacoes_contrato on public.contrato_aprovacoes(contrato_id, created_at desc);

alter table public.contrato_aprovacoes enable row level security;
drop policy if exists "aprovacoes_select" on public.contrato_aprovacoes;
create policy "aprovacoes_select" on public.contrato_aprovacoes for select to authenticated using (public.pode_contrato(contrato_id));
-- Sem policy de escrita: só as RPCs abaixo (security definer) gravam.

-- ---------- enviar para validação ----------
-- Exige: hash do cliente = hash atual do servidor; revisão IA concluída para
-- esse hash; nenhum achado ALTO sem resolução; nenhum marcador vazio apontado
-- pelo servidor (parametros->'_faltando', já sem os de emissão).
create or replace function public.enviar_validacao(p_contrato uuid, p_hash text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_org uuid; v_status text; v_hash text; v_faltando jsonb; v_rev uuid; v_altos int;
begin
  select org_id, status, conteudo_hash, parametros->'_faltando'
    into v_org, v_status, v_hash, v_faltando
    from public.contratos where id = p_contrato and deleted_at is null and modelo_id is not null;
  if v_org is null then raise exception 'contrato não encontrado'; end if;
  if not public.pode_contrato(p_contrato) then raise exception 'sem acesso a este contrato'; end if;
  if v_status not in ('rascunho', 'devolvido') then
    raise exception 'contrato não pode ser enviado neste estado (%)', v_status;
  end if;
  if v_hash is null or p_hash is null or p_hash <> v_hash then
    raise exception 'O conteúdo mudou: gere a minuta de novo antes de enviar.';
  end if;
  if v_faltando is not null and jsonb_typeof(v_faltando) = 'array' and jsonb_array_length(v_faltando) > 0 then
    raise exception 'Há % marcador(es) vazio(s) no documento: %', jsonb_array_length(v_faltando), v_faltando::text;
  end if;
  select r.id into v_rev from public.contrato_revisoes r
   where r.contrato_id = p_contrato and r.status = 'concluida' and r.conteudo_hash = v_hash
   order by r.created_at desc limit 1;
  if v_rev is null then
    raise exception 'A revisão por IA desta versão não está concluída (RC-07).';
  end if;
  select count(*) into v_altos from public.contrato_achados a
   where a.revisao_id = v_rev and a.severidade = 'alta' and a.resolucao is null;
  if v_altos > 0 then
    raise exception '% achado(s) de severidade alta sem resolução (RC-08).', v_altos;
  end if;

  update public.contrato_aprovacoes set situacao = 'superada' where contrato_id = p_contrato and situacao = 'vigente';
  insert into public.contrato_aprovacoes (org_id, contrato_id, acao, conteudo_hash) values (v_org, p_contrato, 'enviado', v_hash);

  perform set_config('bid.interno', '1', true);
  update public.contratos set status = 'em_validacao' where id = p_contrato;
  perform set_config('bid.interno', '0', true);

  insert into public.eventos (org_id, entidade, entidade_id, tipo, payload)
    values (v_org, 'contrato', p_contrato, 'contrato_enviado_validacao', jsonb_build_object('hash', v_hash, 'revisao', v_rev));
end;
$$;

-- ---------- devolver (dono/gestor) ----------
create or replace function public.devolver_contrato(p_contrato uuid, p_comentario text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare v_org uuid; v_status text; v_hash text;
begin
  select org_id, status, conteudo_hash into v_org, v_status, v_hash
    from public.contratos where id = p_contrato and deleted_at is null;
  if v_org is null then raise exception 'contrato não encontrado'; end if;
  if not public.gerencia_contrato(p_contrato) then raise exception 'Só o dono ou um gestor da obra pode devolver o contrato.'; end if;
  if v_status <> 'em_validacao' then raise exception 'contrato não está em validação (%)', v_status; end if;
  if coalesce(length(trim(p_comentario)), 0) < 3 then raise exception 'Devolver exige um comentário.'; end if;

  update public.contrato_aprovacoes set situacao = 'superada' where contrato_id = p_contrato and situacao = 'vigente';
  insert into public.contrato_aprovacoes (org_id, contrato_id, acao, conteudo_hash, comentario)
    values (v_org, p_contrato, 'devolvido', coalesce(v_hash, ''), trim(p_comentario));

  perform set_config('bid.interno', '1', true);
  update public.contratos set status = 'devolvido' where id = p_contrato;
  perform set_config('bid.interno', '0', true);

  insert into public.eventos (org_id, entidade, entidade_id, tipo, payload)
    values (v_org, 'contrato', p_contrato, 'contrato_devolvido', jsonb_build_object('comentario', trim(p_comentario)));
end;
$$;

-- ---------- aprovar (dono/gestor) ----------
-- `autoaprovacao` = quem aprova é quem enviou (Q2: permitido, mas registrado e
-- avisado na UI). O hash aprovado fica na aprovação vigente (RC-10).
create or replace function public.aprovar_contrato(p_contrato uuid, p_hash text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare v_org uuid; v_status text; v_hash text; v_enviou uuid;
begin
  select org_id, status, conteudo_hash into v_org, v_status, v_hash
    from public.contratos where id = p_contrato and deleted_at is null;
  if v_org is null then raise exception 'contrato não encontrado'; end if;
  if not public.gerencia_contrato(p_contrato) then raise exception 'Só o dono ou um gestor da obra pode aprovar o contrato.'; end if;
  if v_status <> 'em_validacao' then raise exception 'contrato não está em validação (%)', v_status; end if;
  if v_hash is null or p_hash is null or p_hash <> v_hash then
    raise exception 'O conteúdo mudou desde o envio: devolva ou peça novo envio.';
  end if;
  select autor into v_enviou from public.contrato_aprovacoes
   where contrato_id = p_contrato and acao = 'enviado' order by created_at desc limit 1;

  update public.contrato_aprovacoes set situacao = 'superada' where contrato_id = p_contrato and situacao = 'vigente' and acao <> 'enviado';
  insert into public.contrato_aprovacoes (org_id, contrato_id, acao, conteudo_hash, autoaprovacao)
    values (v_org, p_contrato, 'aprovado', v_hash, coalesce(v_enviou = auth.uid(), false));

  perform set_config('bid.interno', '1', true);
  update public.contratos set status = 'aprovado' where id = p_contrato;
  perform set_config('bid.interno', '0', true);

  insert into public.eventos (org_id, entidade, entidade_id, tipo, payload)
    values (v_org, 'contrato', p_contrato, 'contrato_aprovado', jsonb_build_object('hash', v_hash, 'autoaprovacao', coalesce(v_enviou = auth.uid(), false)));
end;
$$;

-- ---------- aprovado → rascunho por edição: aprovação vigente fica superada (RC-10) ----------
create or replace function public.superar_aprovacao()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  update public.contrato_aprovacoes set situacao = 'superada'
   where contrato_id = new.id and situacao = 'vigente' and acao = 'aprovado';
  insert into public.eventos (org_id, entidade, entidade_id, tipo, payload)
    values (new.org_id, 'contrato', new.id, 'aprovacao_superada', jsonb_build_object('de', old.status, 'para', new.status));
  return new;
end;
$$;
drop trigger if exists trg_contrato_superar_aprovacao on public.contratos;
create trigger trg_contrato_superar_aprovacao after update of status on public.contratos
  for each row when (old.status = 'aprovado' and new.status = 'rascunho')
  execute function public.superar_aprovacao();

-- ---------- aprovação vigente (para a UI) ----------
create or replace function public.aprovacao_vigente(p_contrato uuid)
returns table (id uuid, acao text, conteudo_hash text, comentario text, autoaprovacao boolean, autor uuid, created_at timestamptz)
language sql stable security invoker set search_path = public as $$
  select a.id, a.acao, a.conteudo_hash, a.comentario, a.autoaprovacao, a.autor, a.created_at
    from public.contrato_aprovacoes a
   where a.contrato_id = p_contrato and a.situacao = 'vigente'
   order by a.created_at desc
   limit 1;
$$;

revoke all on function public.enviar_validacao(uuid, text) from public, anon;
revoke all on function public.devolver_contrato(uuid, text) from public, anon;
revoke all on function public.aprovar_contrato(uuid, text) from public, anon;
revoke all on function public.aprovacao_vigente(uuid) from public, anon;
grant execute on function public.enviar_validacao(uuid, text) to authenticated;
grant execute on function public.devolver_contrato(uuid, text) to authenticated;
grant execute on function public.aprovar_contrato(uuid, text) to authenticated;
grant execute on function public.aprovacao_vigente(uuid) to authenticated;

-- ---------- integridade do hash (revisão de segurança M12) ----------
-- `faltando` sai de parametros (que o cliente edita) para uma coluna só do
-- servidor; `conteudo_versao` sobe a cada edição de conteúdo e permite ao
-- servidor gravar hash/faltando SÓ se o conteúdo não mudou entre ler e gravar.
alter table public.contratos add column if not exists faltando jsonb;
alter table public.contratos add column if not exists conteudo_versao integer not null default 0;

create or replace function public.block_contrato_campos_servidor()
returns trigger language plpgsql as $$
begin
  if auth.uid() is null or current_setting('bid.interno', true) = '1' then
    return new;  -- servidor (service_role) ou trigger interno: livre
  end if;
  if tg_op = 'INSERT' then
    new.status := 'rascunho';
    new.pdf_path := null;
    new.paginas := null;
    new.modelo_id := null;
    new.parametros := '{}'::jsonb;
    new.partes := '{}'::jsonb;
    new.numero := null;
    new.conteudo_hash := null;
    new.faltando := null;
    new.conteudo_versao := 0;
    new.docx_path := null;
    new.docx_hash := null;
    new.pdf_hash := null;
    new.emitido_em := null;
    new.emitido_por := null;
    new.dossie := null;
    new.dossie_em := null;
  elsif tg_op = 'UPDATE' then
    if new.status is distinct from old.status
       or new.pdf_path is distinct from old.pdf_path
       or new.paginas is distinct from old.paginas
       or new.valor is distinct from old.valor
       or new.numero is distinct from old.numero
       or new.conteudo_hash is distinct from old.conteudo_hash
       or new.faltando is distinct from old.faltando
       or new.conteudo_versao is distinct from old.conteudo_versao
       or new.docx_path is distinct from old.docx_path
       or new.docx_hash is distinct from old.docx_hash
       or new.pdf_hash is distinct from old.pdf_hash
       or new.emitido_em is distinct from old.emitido_em
       or new.emitido_por is distinct from old.emitido_por
       or new.dossie is distinct from old.dossie
       or new.dossie_em is distinct from old.dossie_em
       or new.modelo_id is distinct from old.modelo_id then
      raise exception 'status, número, hashes, PDF/DOCX, valor, dossiê e modelo do contrato são definidos pelo servidor';
    end if;
    if (new.parametros is distinct from old.parametros or new.partes is distinct from old.partes) then
      if old.status not in ('rascunho', 'devolvido', 'aprovado') then
        raise exception 'contrato não está em edição (status %)', old.status;
      end if;
      if old.status = 'aprovado' then
        new.status := 'rascunho';
      end if;
      -- Conteúdo mudou: hash e pendências do servidor ficam inválidos; versão sobe.
      new.conteudo_hash := null;
      new.faltando := null;
      new.conteudo_versao := old.conteudo_versao + 1;
    end if;
  end if;
  return new;
end;
$$;

create or replace function public.guard_filho_contrato()
returns trigger language plpgsql as $$
declare v_contrato uuid := coalesce(new.contrato_id, old.contrato_id);
        v_status text;
begin
  if auth.uid() is null or current_setting('bid.interno', true) = '1' then
    return coalesce(new, old);
  end if;
  select status into v_status from public.contratos where id = v_contrato;
  if v_status is null or v_status not in ('rascunho', 'devolvido', 'aprovado') then
    raise exception 'contrato não está em edição (status %)', coalesce(v_status, '?');
  end if;
  perform set_config('bid.interno', '1', true);
  update public.contratos
     set status = case when v_status = 'aprovado' then 'rascunho' else status end,
         conteudo_hash = null,
         faltando = null,
         conteudo_versao = conteudo_versao + 1
   where id = v_contrato;
  perform set_config('bid.interno', '0', true);
  return coalesce(new, old);
end;
$$;

-- Marcador vazio: só a coluna do servidor conta; sem ela (minuta não gerada) falha fechado.
create or replace function public.enviar_validacao(p_contrato uuid, p_hash text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_org uuid; v_status text; v_hash text; v_faltando jsonb; v_rev uuid; v_altos int;
begin
  select org_id, status, conteudo_hash, faltando
    into v_org, v_status, v_hash, v_faltando
    from public.contratos where id = p_contrato and deleted_at is null and modelo_id is not null;
  if v_org is null then raise exception 'contrato não encontrado'; end if;
  if not public.pode_contrato(p_contrato) then raise exception 'sem acesso a este contrato'; end if;
  if v_status not in ('rascunho', 'devolvido') then
    raise exception 'contrato não pode ser enviado neste estado (%)', v_status;
  end if;
  if v_hash is null or p_hash is null or p_hash <> v_hash then
    raise exception 'O conteúdo mudou: gere a minuta de novo antes de enviar.';
  end if;
  if v_faltando is null or jsonb_typeof(v_faltando) <> 'array' then
    raise exception 'Gere a minuta antes de enviar (pendências do documento não conferidas).';
  end if;
  if jsonb_array_length(v_faltando) > 0 then
    raise exception 'Há % marcador(es) vazio(s) no documento: %', jsonb_array_length(v_faltando), v_faltando::text;
  end if;
  select r.id into v_rev from public.contrato_revisoes r
   where r.contrato_id = p_contrato and r.status = 'concluida' and r.conteudo_hash = v_hash
   order by r.created_at desc limit 1;
  if v_rev is null then
    raise exception 'A revisão por IA desta versão não está concluída (RC-07).';
  end if;
  select count(*) into v_altos from public.contrato_achados a
   where a.revisao_id = v_rev and a.severidade = 'alta' and a.resolucao is null;
  if v_altos > 0 then
    raise exception '% achado(s) de severidade alta sem resolução (RC-08).', v_altos;
  end if;

  update public.contrato_aprovacoes set situacao = 'superada' where contrato_id = p_contrato and situacao = 'vigente';
  insert into public.contrato_aprovacoes (org_id, contrato_id, acao, conteudo_hash) values (v_org, p_contrato, 'enviado', v_hash);

  perform set_config('bid.interno', '1', true);
  update public.contratos set status = 'em_validacao' where id = p_contrato;
  perform set_config('bid.interno', '0', true);

  insert into public.eventos (org_id, entidade, entidade_id, tipo, payload)
    values (v_org, 'contrato', p_contrato, 'contrato_enviado_validacao', jsonb_build_object('hash', v_hash, 'revisao', v_rev));
end;
$$;
