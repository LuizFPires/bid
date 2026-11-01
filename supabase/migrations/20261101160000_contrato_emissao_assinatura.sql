-- M13 · Emissão, numeração e assinatura das três partes (PRD-contratos §4
-- passos 9–10, RC-11/12/13/17; SPEC §3 e §7).
-- · emitir_contrato: SÓ service_role (a rota /api/contracts/emitir gera .docx e
--   PDF finais, grava no Storage e chama aqui); número CT-AAAA-NNN por org/ano,
--   sem buracos por corrida (upsert em contrato_numeracao = lock de linha).
-- · assinaturas por SIGNATÁRIO (contratante/contratada/construtora/testemunha),
--   link por signatário (token forte, uso único, 7 dias) e coleta presencial.
-- · cancelar_contrato (emitido/enviado → cancelado, motivo obrigatório);
--   emitido/enviado/assinado/cancelado não se apagam (nem por update direto).

-- ---------- assinaturas por signatário ----------
alter table public.assinaturas add column if not exists signatario_id uuid references public.contrato_signatarios(id) on delete restrict;
alter table public.assinaturas add column if not exists coletado_por uuid;
alter table public.assinaturas drop constraint if exists assinaturas_parte_check;
alter table public.assinaturas add constraint assinaturas_parte_check check (parte in ('contratante', 'contratada', 'construtora', 'testemunha'));
-- Legado (M7): uma por parte quando sem signatário. v2: uma por signatário.
alter table public.assinaturas drop constraint if exists assinaturas_contrato_id_parte_key;
create unique index if not exists uq_assinaturas_legado on public.assinaturas(contrato_id, parte) where signatario_id is null;
create unique index if not exists uq_assinaturas_signatario on public.assinaturas(contrato_id, signatario_id) where signatario_id is not null;
-- Signatário não some depois de ter linha de assinatura (restrict acima); e um
-- contrato emitido não troca signatários (guard_filho_contrato já exige edição).

-- ---------- numeração + emissão (service_role) ----------
create or replace function public.emitir_contrato(
  p_contrato uuid,
  p_docx_path text,
  p_docx_hash text,
  p_pdf_path text,
  p_pdf_hash text,
  p_paginas int,
  p_emitido_por uuid
) returns text
language plpgsql
security definer
set search_path = public
as $$
declare v_org uuid; v_status text; v_hash text; v_ano int; v_n int; v_numero text;
begin
  if auth.uid() is not null then raise exception 'emitir_contrato é só do servidor'; end if;
  select org_id, status, conteudo_hash into v_org, v_status, v_hash
    from public.contratos where id = p_contrato and deleted_at is null and modelo_id is not null for update;
  if v_org is null then raise exception 'contrato não encontrado'; end if;
  if v_status <> 'aprovado' then raise exception 'só contrato aprovado é emitido (status %)', v_status; end if;
  if v_hash is null or not exists (
    select 1 from public.contrato_aprovacoes a
     where a.contrato_id = p_contrato and a.acao = 'aprovado' and a.situacao = 'vigente' and a.conteudo_hash = v_hash
  ) then
    raise exception 'a aprovação vigente não corresponde ao conteúdo atual (RC-10)';
  end if;
  if p_docx_path !~ ('^' || v_org::text || '/') or p_pdf_path !~ ('^' || v_org::text || '/') then
    raise exception 'caminhos dos arquivos fora da organização';
  end if;

  -- Número sequencial por org/ano (RC-11): upsert bloqueia a linha → sem buracos.
  v_ano := extract(year from (now() at time zone 'America/Sao_Paulo'))::int;
  insert into public.contrato_numeracao (org_id, ano, ultimo) values (v_org, v_ano, 1)
    on conflict (org_id, ano) do update set ultimo = public.contrato_numeracao.ultimo + 1
    returning ultimo into v_n;
  v_numero := 'CT-' || v_ano || '-' || lpad(v_n::text, 3, '0');

  update public.contratos
     set status = 'emitido', numero = v_numero,
         docx_path = p_docx_path, docx_hash = p_docx_hash,
         pdf_path = p_pdf_path, pdf_hash = p_pdf_hash, paginas = p_paginas,
         emitido_em = now(), emitido_por = p_emitido_por
   where id = p_contrato;

  insert into public.eventos (org_id, entidade, entidade_id, tipo, payload, autor)
    values (v_org, 'contrato', p_contrato, 'contrato_emitido', jsonb_build_object('numero', v_numero, 'pdf_hash', p_pdf_hash, 'docx_hash', p_docx_hash), p_emitido_por);
  return v_numero;
end;
$$;

-- ---------- links de assinatura por signatário (dono/gestor) ----------
-- Um token por signatário pendente (ou só o informado). Hash guardado; o token
-- em claro sai uma vez. Primeiro link leva o contrato a `enviado`.
create or replace function public.gerar_links_assinatura(p_contrato uuid, p_signatario uuid default null)
returns table (o_signatario_id uuid, o_nome text, o_parte text, o_token text)
language plpgsql
security definer
set search_path = public, extensions
as $$
declare v_org uuid; v_status text; r record; v_token text; v_n int := 0;
begin
  select org_id, status into v_org, v_status from public.contratos where id = p_contrato and deleted_at is null and modelo_id is not null;
  if v_org is null then raise exception 'contrato não encontrado'; end if;
  if not public.gerencia_contrato(p_contrato) then raise exception 'Só o dono ou um gestor da obra pode enviar para assinatura.'; end if;
  if v_status not in ('emitido', 'enviado') then raise exception 'contrato precisa estar emitido (status %)', v_status; end if;

  for r in
    select s.id, s.nome, s.parte from public.contrato_signatarios s
     where s.contrato_id = p_contrato and (p_signatario is null or s.id = p_signatario)
       and not exists (select 1 from public.assinaturas a where a.signatario_id = s.id and a.assinado_em is not null)
     order by s.ordem
  loop
    v_token := encode(extensions.gen_random_bytes(24), 'hex');
    insert into public.assinaturas (org_id, contrato_id, signatario_id, parte, signatario_nome, via, token_hash, token_expira)
      values (v_org, p_contrato, r.id, r.parte, r.nome, 'link', encode(extensions.digest(v_token, 'sha256'), 'hex'), now() + interval '7 days')
    on conflict (contrato_id, signatario_id) where assinaturas.signatario_id is not null do update
      set token_hash = excluded.token_hash, token_expira = excluded.token_expira, via = 'link';
    v_n := v_n + 1;
    o_signatario_id := r.id; o_nome := r.nome; o_parte := r.parte; o_token := v_token;
    return next;
  end loop;
  if v_n = 0 then raise exception 'não há signatário pendente'; end if;

  if v_status = 'emitido' then
    perform set_config('bid.interno', '1', true);
    update public.contratos set status = 'enviado' where id = p_contrato;
    perform set_config('bid.interno', '0', true);
  end if;
  insert into public.eventos (org_id, entidade, entidade_id, tipo, payload)
    values (v_org, 'contrato', p_contrato, 'links_assinatura_gerados', jsonb_build_object('n', v_n));
  return;
end;
$$;

-- ---------- cancelar (dono/gestor) ----------
create or replace function public.cancelar_contrato(p_contrato uuid, p_motivo text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare v_org uuid; v_status text;
begin
  select org_id, status into v_org, v_status from public.contratos where id = p_contrato and deleted_at is null;
  if v_org is null then raise exception 'contrato não encontrado'; end if;
  if not public.gerencia_contrato(p_contrato) then raise exception 'Só o dono ou um gestor da obra pode cancelar o contrato.'; end if;
  if v_status not in ('emitido', 'enviado') then raise exception 'só contrato emitido ou enviado se cancela (status %)', v_status; end if;
  if coalesce(length(trim(p_motivo)), 0) < 5 then raise exception 'Cancelar exige um motivo.'; end if;
  perform set_config('bid.interno', '1', true);
  update public.contratos set status = 'cancelado', cancelado_motivo = trim(p_motivo) where id = p_contrato;
  perform set_config('bid.interno', '0', true);
  update public.assinaturas set token_hash = null, token_expira = null where contrato_id = p_contrato and assinado_em is null;
  insert into public.eventos (org_id, entidade, entidade_id, tipo, payload)
    values (v_org, 'contrato', p_contrato, 'contrato_cancelado', jsonb_build_object('motivo', trim(p_motivo)));
end;
$$;

-- ---------- emitido/enviado/assinado/cancelado não se apagam (RC-17) ----------
create or replace function public.block_delete_contrato_emitido()
returns trigger language plpgsql as $$
begin
  if new.deleted_at is not null and old.deleted_at is null and old.status in ('emitido', 'enviado', 'assinado', 'cancelado') then
    raise exception 'Contrato % não pode ser excluído; cancele com motivo.', old.status;
  end if;
  return new;
end;
$$;
drop trigger if exists trg_contrato_block_delete_emitido on public.contratos;
create trigger trg_contrato_block_delete_emitido before update of deleted_at on public.contratos
  for each row execute function public.block_delete_contrato_emitido();

-- apagar_contrato: mensagem coerente para os estados finais.
create or replace function public.apagar_contrato(p_contrato uuid)
returns void
language plpgsql
security invoker
set search_path = public
as $$
declare v_org uuid; v_status text;
begin
  select org_id, status into v_org, v_status from public.contratos where id = p_contrato and deleted_at is null;
  if v_org is null then raise exception 'contrato não encontrado'; end if;
  if not public.gerencia_contrato(p_contrato) then raise exception 'Só o dono ou um gestor da obra pode excluir o contrato.'; end if;
  if v_status in ('emitido', 'enviado', 'assinado', 'cancelado') then
    raise exception 'Contrato % não pode ser excluído; cancele com motivo.', v_status;
  end if;
  update public.contratos set deleted_at = now() where id = p_contrato;
  insert into public.eventos (org_id, entidade, entidade_id, tipo, payload)
    values (v_org, 'contrato', p_contrato, 'contrato_excluido', jsonb_build_object('status', v_status));
end;
$$;

-- Legado (M7): o ON CONFLICT precisa do predicado do índice parcial.
create or replace function public.gerar_token_assinatura(p_contrato uuid, p_parte text, p_signatario text)
returns text
language plpgsql
security definer
set search_path = public, extensions
as $$
declare v_org uuid; v_token text; v_assinado timestamptz;
begin
  if p_parte <> 'contratada' then raise exception 'o link de assinatura é apenas para a contratada'; end if;
  select org_id into v_org from public.contratos where id = p_contrato and deleted_at is null and modelo_id is null;
  if v_org is null then raise exception 'contrato não encontrado'; end if;
  if not public.is_member(v_org) then raise exception 'sem acesso a este contrato'; end if;
  select assinado_em into v_assinado from public.assinaturas where contrato_id = p_contrato and parte = p_parte and signatario_id is null;
  if v_assinado is not null then raise exception 'esta parte já assinou'; end if;
  v_token := encode(extensions.gen_random_bytes(24), 'hex');
  insert into public.assinaturas (org_id, contrato_id, parte, signatario_nome, via, token_hash, token_expira)
    values (v_org, p_contrato, p_parte, nullif(btrim(p_signatario), ''), 'link', encode(extensions.digest(v_token, 'sha256'), 'hex'), now() + interval '7 days')
  on conflict (contrato_id, parte) where signatario_id is null do update
    set token_hash = excluded.token_hash, token_expira = excluded.token_expira,
        signatario_nome = coalesce(excluded.signatario_nome, public.assinaturas.signatario_nome), via = 'link';
  insert into public.eventos (org_id, entidade, entidade_id, tipo, payload)
    values (v_org, 'contrato', p_contrato, 'token_assinatura_gerado', jsonb_build_object('parte', p_parte));
  return v_token;
end;
$$;

-- restaurar_contrato: mesma gerência da exclusão.
create or replace function public.restaurar_contrato(p_contrato uuid)
returns void
language plpgsql
security invoker
set search_path = public
as $$
declare v_org uuid;
begin
  select org_id into v_org from public.contratos where id = p_contrato and deleted_at is not null;
  if v_org is null then raise exception 'contrato não encontrado'; end if;
  if not public.gerencia_contrato(p_contrato) then raise exception 'Só o dono ou um gestor da obra pode restaurar o contrato.'; end if;
  update public.contratos set deleted_at = null where id = p_contrato;
  insert into public.eventos (org_id, entidade, entidade_id, tipo, payload)
    values (v_org, 'contrato', p_contrato, 'contrato_restaurado', '{}'::jsonb);
end;
$$;

revoke all on function public.emitir_contrato(uuid, text, text, text, text, int, uuid) from public, anon, authenticated;
grant execute on function public.emitir_contrato(uuid, text, text, text, text, int, uuid) to service_role;
revoke all on function public.gerar_links_assinatura(uuid, uuid) from public, anon;
grant execute on function public.gerar_links_assinatura(uuid, uuid) to authenticated;
revoke all on function public.cancelar_contrato(uuid, text) from public, anon;
grant execute on function public.cancelar_contrato(uuid, text) to authenticated;

-- ---------- trilha da assinatura v2: transação única no banco (service_role) ----------
-- O servidor carimba o PDF e grava o arquivo num caminho NOVO por versão; a
-- trilha, a troca do ponteiro (contratos.pdf_path) e a transição para
-- `assinado` acontecem aqui, com trava da linha do contrato e compare-and-swap
-- do hash da cadeia (último doc_hash ou pdf_hash da emissão). Duas assinaturas
-- simultâneas não se sobrescrevem: a segunda lê a cadeia já avançada e falha.
create or replace function public.registrar_assinatura_v2(
  p_contrato uuid,
  p_signatario uuid,
  p_hash_anterior text,
  p_doc_hash text,
  p_pdf_path text,
  p_img_path text,
  p_via text,
  p_coletado_por uuid,
  p_ip text,
  p_user_agent text
) returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare v_org uuid; v_status text; v_pdf_hash text; v_cadeia text; v_parte text; v_nome text; v_id uuid; v_todas boolean;
begin
  if auth.uid() is not null then raise exception 'registrar_assinatura_v2 é só do servidor'; end if;
  select org_id, status, pdf_hash into v_org, v_status, v_pdf_hash
    from public.contratos where id = p_contrato and deleted_at is null and modelo_id is not null for update;
  if v_org is null then raise exception 'contrato não encontrado'; end if;
  if v_status not in ('emitido', 'enviado') then raise exception 'contrato não está em assinatura (status %)', v_status; end if;
  if p_pdf_path !~ ('^' || v_org::text || '/' || p_contrato::text || '/') then raise exception 'caminho do PDF fora do contrato'; end if;

  select a.doc_hash into v_cadeia from public.assinaturas a
   where a.contrato_id = p_contrato and a.doc_hash is not null order by a.assinado_em desc limit 1;
  v_cadeia := coalesce(v_cadeia, v_pdf_hash);
  if v_cadeia is distinct from p_hash_anterior then
    raise exception 'O documento foi alterado desde a emissão ou a última assinatura.';
  end if;

  select s.parte, s.nome into v_parte, v_nome from public.contrato_signatarios s where s.id = p_signatario and s.contrato_id = p_contrato;
  if v_parte is null then raise exception 'signatário não pertence ao contrato'; end if;
  select a.id into v_id from public.assinaturas a where a.contrato_id = p_contrato and a.signatario_id = p_signatario;
  if v_id is not null and exists (select 1 from public.assinaturas where id = v_id and assinado_em is not null) then
    raise exception 'Este signatário já assinou.';
  end if;
  if v_id is null then
    insert into public.assinaturas (org_id, contrato_id, signatario_id, parte, signatario_nome, assinatura_img_path, via, coletado_por, assinado_em, ip, user_agent, doc_hash, token_hash, token_expira)
      values (v_org, p_contrato, p_signatario, v_parte, v_nome, p_img_path, p_via, p_coletado_por, now(), p_ip, p_user_agent, p_doc_hash, null, null);
  else
    update public.assinaturas
       set assinatura_img_path = p_img_path, via = p_via, coletado_por = p_coletado_por, assinado_em = now(),
           ip = p_ip, user_agent = p_user_agent, doc_hash = p_doc_hash, token_hash = null, token_expira = null, signatario_nome = coalesce(signatario_nome, v_nome)
     where id = v_id;
  end if;

  v_todas := not exists (
    select 1 from public.contrato_signatarios s
     where s.contrato_id = p_contrato and s.obrigatorio
       and not exists (select 1 from public.assinaturas a where a.signatario_id = s.id and a.assinado_em is not null)
  );
  update public.contratos
     set pdf_path = p_pdf_path, status = case when v_todas then 'assinado' else status end
   where id = p_contrato;
  insert into public.eventos (org_id, entidade, entidade_id, tipo, payload)
    values (v_org, 'contrato', p_contrato,
            case when v_todas then 'contrato_assinado' else 'assinatura_coletada' end,
            jsonb_build_object('signatario', p_signatario, 'parte', v_parte, 'via', p_via, 'doc_hash', p_doc_hash));
  return v_todas;
end;
$$;
revoke all on function public.registrar_assinatura_v2(uuid, uuid, text, text, text, text, text, uuid, text, text) from public, anon, authenticated;
grant execute on function public.registrar_assinatura_v2(uuid, uuid, text, text, text, text, text, uuid, text, text) to service_role;
