-- M10 · Contrato v2 (minuta padrão): estados novos, dossiê fotografado,
-- parâmetros/partes, itens de cláusula, planilha, blocos, signatários,
-- numeração, triggers de invariantes (SPEC-contratos §2.4). Contratos antigos
-- continuam (modelo_id null = legado).

-- ---------- estados e colunas ----------
alter table public.contratos drop constraint if exists contratos_status_check;
alter table public.contratos add constraint contratos_status_check check (status in
  ('rascunho', 'em_validacao', 'devolvido', 'aprovado', 'emitido', 'enviado', 'assinado', 'cancelado'));

alter table public.contratos
  add column if not exists modelo_id uuid,
  add column if not exists numero text,
  add column if not exists dossie jsonb,
  add column if not exists dossie_em timestamptz,
  add column if not exists parametros jsonb not null default '{}'::jsonb,
  add column if not exists partes jsonb not null default '{}'::jsonb,
  add column if not exists conteudo_hash text,
  add column if not exists docx_path text,
  add column if not exists docx_hash text,
  add column if not exists pdf_hash text,
  add column if not exists emitido_em timestamptz,
  add column if not exists emitido_por uuid,
  add column if not exists cancelado_motivo text;
alter table public.contratos drop constraint if exists contratos_modelo_fk;
alter table public.contratos add constraint contratos_modelo_fk
  foreign key (modelo_id, org_id) references public.contrato_modelos(id, org_id);
create unique index if not exists uq_contrato_numero on public.contratos(org_id, numero) where numero is not null;

create table if not exists public.contrato_numeracao (
  org_id uuid not null references public.organizacoes(id) on delete cascade,
  ano int not null,
  ultimo int not null default 0,
  primary key (org_id, ano)
);

-- ---------- filhos do contrato v2 ----------
create table if not exists public.contrato_itens_clausula (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizacoes(id) on delete cascade,
  contrato_id uuid not null,
  numero text not null,                  -- '3.1', '18.1.1', '3.7' (extra) ou 'decl:4'
  apos text,                             -- extras: depois de qual número entram
  texto text not null,
  texto_padrao text,
  origem text not null check (origem in ('padrao', 'parametro', 'proposta', 'bloco', 'variante')),
  variante_chave text,
  bloco_chave text,
  suprimido boolean not null default false,
  justificativa text,
  reduz_protecao boolean not null default false,
  unique (contrato_id, numero),
  foreign key (contrato_id, org_id) references public.contratos(id, org_id) on delete cascade,
  check (origem <> 'variante' or coalesce(length(trim(justificativa)), 0) >= 10)
);
create index if not exists idx_itens_clausula_contrato on public.contrato_itens_clausula(contrato_id);

create table if not exists public.contrato_planilha (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizacoes(id) on delete cascade,
  contrato_id uuid not null,
  ordem int not null,
  codigo text,
  grupo boolean not null default false,
  descricao text not null,
  unidade text,
  quantidade numeric(18, 4),
  preco_unitario numeric(18, 4),
  total numeric(14, 2),                  -- servidor: round(qtd*unit, 2); grupo = null
  foreign key (contrato_id, org_id) references public.contratos(id, org_id) on delete cascade
);
create index if not exists idx_planilha_contrato on public.contrato_planilha(contrato_id, ordem);

create table if not exists public.contrato_blocos (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizacoes(id) on delete cascade,
  contrato_id uuid not null,
  bloco_chave text not null,
  ordem int not null,
  titulo text not null,
  itens jsonb not null,
  parametros jsonb not null default '{}'::jsonb,
  unique (contrato_id, bloco_chave),
  foreign key (contrato_id, org_id) references public.contratos(id, org_id) on delete cascade
);

create table if not exists public.contrato_signatarios (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizacoes(id) on delete cascade,
  contrato_id uuid not null,
  parte text not null check (parte in ('contratante', 'contratada', 'construtora', 'testemunha')),
  nome text not null,
  cpf text check (cpf is null or cpf ~ '^[0-9]{11}$'),
  cargo text,
  email text,
  telefone text,
  ordem int not null default 1,
  obrigatorio boolean not null default true,
  foreign key (contrato_id, org_id) references public.contratos(id, org_id) on delete cascade
);
create index if not exists idx_signatarios_contrato on public.contrato_signatarios(contrato_id);

-- ---------- helpers ----------
-- Edição de conteúdo só nestes estados (RC-10: aprovado volta a rascunho ao editar).
create or replace function public.contrato_editavel(p_contrato uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.contratos k
     where k.id = p_contrato and k.deleted_at is null
       and k.status in ('rascunho', 'devolvido', 'aprovado')
  );
$$;
revoke all on function public.contrato_editavel(uuid) from public, anon;
grant execute on function public.contrato_editavel(uuid) to authenticated;

-- ---------- campos do servidor (amplia o guard existente) ----------
-- Flag interna: triggers do próprio banco (soma da planilha, volta a rascunho)
-- ajustam campos "do servidor" sem passar pelo bloqueio.
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
    new.modelo_id := null;           -- v2 só nasce pela RPC criar_contrato_v2
    new.parametros := '{}'::jsonb;
    new.partes := '{}'::jsonb;
    new.numero := null;
    new.conteudo_hash := null;
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
    -- Conteúdo editável só em rascunho/devolvido/aprovado; aprovado volta a rascunho.
    if (new.parametros is distinct from old.parametros or new.partes is distinct from old.partes) then
      if old.status not in ('rascunho', 'devolvido', 'aprovado') then
        raise exception 'contrato não está em edição (status %)', old.status;
      end if;
      if old.status = 'aprovado' then
        new.status := 'rascunho';
      end if;
      -- Conteúdo mudou: a revisão por IA (que vale para um hash) fica desatualizada.
      new.conteudo_hash := null;
    end if;
  end if;
  return new;
end;
$$;

-- Contratos nascem só por RPC (criar_contrato / criar_contrato_v2): sem INSERT direto do cliente.
drop policy if exists "contratos_insert" on public.contratos;

-- ---------- filhos: só com contrato editável; editar aprovado volta a rascunho ----------
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
         conteudo_hash = null
   where id = v_contrato;
  perform set_config('bid.interno', '0', true);
  return coalesce(new, old);
end;
$$;
drop trigger if exists trg_itens_clausula_guard on public.contrato_itens_clausula;
create trigger trg_itens_clausula_guard before insert or update or delete on public.contrato_itens_clausula
  for each row execute function public.guard_filho_contrato();
drop trigger if exists trg_planilha_guard on public.contrato_planilha;
create trigger trg_planilha_guard before insert or update or delete on public.contrato_planilha
  for each row execute function public.guard_filho_contrato();
drop trigger if exists trg_blocos_guard on public.contrato_blocos;
create trigger trg_blocos_guard before insert or update or delete on public.contrato_blocos
  for each row execute function public.guard_filho_contrato();
drop trigger if exists trg_signatarios_guard on public.contrato_signatarios;
create trigger trg_signatarios_guard before insert or update or delete on public.contrato_signatarios
  for each row execute function public.guard_filho_contrato();

-- ---------- planilha: total da linha e valor do contrato (RC-03) ----------
create or replace function public.planilha_total_linha()
returns trigger language plpgsql as $$
begin
  if new.grupo then
    new.quantidade := null; new.preco_unitario := null; new.total := null;
  else
    new.total := case when new.quantidade is null or new.preco_unitario is null then null
                      else round(new.quantidade * new.preco_unitario, 2) end;
  end if;
  return new;
end;
$$;
drop trigger if exists trg_planilha_total on public.contrato_planilha;
create trigger trg_planilha_total before insert or update on public.contrato_planilha
  for each row execute function public.planilha_total_linha();

create or replace function public.planilha_soma_contrato()
returns trigger language plpgsql as $$
declare v_contrato uuid := coalesce(new.contrato_id, old.contrato_id);
        v_soma numeric(14,2);
        v_n int;
begin
  select count(*) filter (where not grupo), coalesce(sum(total) filter (where not grupo), 0)
    into v_n, v_soma from public.contrato_planilha where contrato_id = v_contrato;
  perform set_config('bid.interno', '1', true);
  if v_n > 0 then
    update public.contratos set valor = v_soma where id = v_contrato and valor is distinct from v_soma;
  elsif tg_op = 'DELETE' then
    -- Apagaram todas as linhas: sem planilha não há valor (RC-03).
    update public.contratos set valor = null where id = v_contrato and valor is not null;
  end if;
  perform set_config('bid.interno', '0', true);
  return null;
end;
$$;
drop trigger if exists trg_planilha_soma on public.contrato_planilha;
create trigger trg_planilha_soma after insert or update or delete on public.contrato_planilha
  for each row execute function public.planilha_soma_contrato();

-- ---------- RLS dos filhos ----------
alter table public.contrato_itens_clausula enable row level security;
alter table public.contrato_planilha enable row level security;
alter table public.contrato_blocos enable row level security;
alter table public.contrato_signatarios enable row level security;
alter table public.contrato_numeracao enable row level security;  -- sem policy: só servidor

do $$
declare t text;
begin
  foreach t in array array['contrato_itens_clausula', 'contrato_planilha', 'contrato_blocos', 'contrato_signatarios'] loop
    execute format('drop policy if exists %I on public.%I', t || '_select', t);
    execute format('create policy %I on public.%I for select to authenticated using (public.pode_contrato(contrato_id))', t || '_select', t);
    execute format('drop policy if exists %I on public.%I', t || '_write', t);
    execute format('create policy %I on public.%I for all to authenticated using (public.pode_contrato(contrato_id) and public.contrato_editavel(contrato_id)) with check (public.pode_contrato(contrato_id) and public.contrato_editavel(contrato_id))', t || '_write', t);
  end loop;
end $$;

-- ---------- RPCs ----------
-- Cria o contrato v2 a partir da vencedora (idempotente por proposta). O
-- dossiê é montado pelo servidor logo depois (rota /api/contracts/dossie).
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

  insert into public.contratos (org_id, certame_id, proposta_id, obra_id, categoria, valor, status, modelo_id)
    values (v_org, v_certame, p_proposta, v_obra, v_categoria, v_valor, 'rascunho', v_modelo)
    returning id into v_contrato;

  insert into public.eventos (org_id, entidade, entidade_id, tipo, payload)
    values (v_org, 'contrato', v_contrato, 'contrato_criado_v2',
            jsonb_build_object('proposta', p_proposta, 'certame', v_certame, 'modelo', v_modelo));
  return v_contrato;
end;
$$;

-- Só o servidor (service_role) grava o dossiê fotografado.
create or replace function public.atualizar_dossie(p_contrato uuid, p_dossie jsonb)
returns void
language plpgsql
security invoker
set search_path = public
as $$
declare v_org uuid;
begin
  if auth.uid() is not null then raise exception 'atualizar_dossie é do servidor'; end if;
  update public.contratos set dossie = p_dossie, dossie_em = now()
    where id = p_contrato and deleted_at is null and status in ('rascunho', 'devolvido')
    returning org_id into v_org;
  if v_org is null then raise exception 'contrato não encontrado ou fora de rascunho'; end if;
  insert into public.eventos (org_id, entidade, entidade_id, tipo, payload)
    values (v_org, 'contrato', p_contrato, 'dossie_atualizado', jsonb_build_object('gerado_em', p_dossie->>'geradoEm'));
end;
$$;

-- Patch em lote (uma transação): parâmetros (merge), partes (substitui),
-- itens (upsert por número), planilha/blocos/signatários (substitui tudo).
create or replace function public.salvar_contrato(p_contrato uuid, p_patch jsonb)
returns void
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_org uuid; v_status text; v_x jsonb; v_i int := 0;
begin
  select org_id, status into v_org, v_status from public.contratos where id = p_contrato and deleted_at is null;
  if v_org is null then raise exception 'contrato não encontrado'; end if;
  if not public.pode_contrato(p_contrato) then raise exception 'sem acesso a este contrato'; end if;
  if v_status not in ('rascunho', 'devolvido', 'aprovado') then
    raise exception 'contrato não está em edição (status %)', v_status;
  end if;

  if p_patch ? 'parametros' then
    update public.contratos set parametros = parametros || coalesce(p_patch->'parametros', '{}'::jsonb) where id = p_contrato;
  end if;
  if p_patch ? 'partes' then
    update public.contratos set partes = coalesce(p_patch->'partes', '{}'::jsonb) where id = p_contrato;
  end if;
  if p_patch ? 'itens' then
    for v_x in select * from jsonb_array_elements(p_patch->'itens') loop
      insert into public.contrato_itens_clausula (org_id, contrato_id, numero, apos, texto, texto_padrao, origem, variante_chave, bloco_chave, suprimido, justificativa, reduz_protecao)
      values (v_org, p_contrato, v_x->>'numero', nullif(v_x->>'apos',''), coalesce(v_x->>'texto',''), v_x->>'textoPadrao', coalesce(v_x->>'origem','padrao'),
              nullif(v_x->>'varianteChave',''), nullif(v_x->>'blocoChave',''), coalesce((v_x->>'suprimido')::boolean, false), nullif(v_x->>'justificativa',''), coalesce((v_x->>'reduzProtecao')::boolean, false))
      on conflict (contrato_id, numero) do update set
        apos = excluded.apos, texto = excluded.texto, texto_padrao = excluded.texto_padrao, origem = excluded.origem,
        variante_chave = excluded.variante_chave, bloco_chave = excluded.bloco_chave, suprimido = excluded.suprimido,
        justificativa = excluded.justificativa, reduz_protecao = excluded.reduz_protecao;
    end loop;
  end if;
  if p_patch ? 'planilha' then
    delete from public.contrato_planilha where contrato_id = p_contrato;
    for v_x in select * from jsonb_array_elements(p_patch->'planilha') loop
      v_i := v_i + 1;
      insert into public.contrato_planilha (org_id, contrato_id, ordem, codigo, grupo, descricao, unidade, quantidade, preco_unitario)
      values (v_org, p_contrato, v_i, nullif(v_x->>'codigo',''), coalesce((v_x->>'grupo')::boolean, false), coalesce(v_x->>'descricao',''),
              nullif(v_x->>'unidade',''), (v_x->>'quantidade')::numeric, (v_x->>'preco_unitario')::numeric);
    end loop;
  end if;
  if p_patch ? 'blocos' then
    delete from public.contrato_blocos where contrato_id = p_contrato;
    v_i := 0;
    for v_x in select * from jsonb_array_elements(p_patch->'blocos') loop
      v_i := v_i + 1;
      insert into public.contrato_blocos (org_id, contrato_id, bloco_chave, ordem, titulo, itens, parametros)
      values (v_org, p_contrato, v_x->>'chave', v_i, coalesce(v_x->>'titulo',''), coalesce(v_x->'itens','[]'::jsonb), coalesce(v_x->'parametros','{}'::jsonb));
    end loop;
  end if;
  if p_patch ? 'signatarios' then
    delete from public.contrato_signatarios where contrato_id = p_contrato;
    v_i := 0;
    for v_x in select * from jsonb_array_elements(p_patch->'signatarios') loop
      v_i := v_i + 1;
      insert into public.contrato_signatarios (org_id, contrato_id, parte, nome, cpf, cargo, email, telefone, ordem, obrigatorio)
      values (v_org, p_contrato, v_x->>'parte', coalesce(v_x->>'nome',''), nullif(v_x->>'cpf',''), nullif(v_x->>'cargo',''), nullif(v_x->>'email',''), nullif(v_x->>'telefone',''), v_i, coalesce((v_x->>'obrigatorio')::boolean, true));
    end loop;
  end if;

  insert into public.eventos (org_id, entidade, entidade_id, tipo, payload)
    values (v_org, 'contrato', p_contrato, 'contrato_salvo', jsonb_build_object('chaves', (select jsonb_agg(k) from jsonb_object_keys(p_patch) k)));
end;
$$;

revoke all on function public.criar_contrato_v2(uuid) from public, anon;
revoke all on function public.atualizar_dossie(uuid, jsonb) from public, anon;
revoke all on function public.salvar_contrato(uuid, jsonb) from public, anon;
grant execute on function public.criar_contrato_v2(uuid) to authenticated;
grant execute on function public.atualizar_dossie(uuid, jsonb) to service_role;
grant execute on function public.salvar_contrato(uuid, jsonb) to authenticated;


-- ---------- itens de cláusula: padrão e "reduz proteção" vêm do MODELO, não do cliente ----------
-- texto_padrao é sempre o do catálogo da versão do modelo (null para item extra);
-- origem 'padrao' só vale se o texto for igual ao padrão; variante do catálogo
-- herda reduz_protecao da biblioteca (o cliente não "desmarca" risco).
create or replace function public.guard_item_clausula_origem()
returns trigger language plpgsql as $$
declare v_modelo uuid; v_padrao text; v_reduz boolean;
begin
  if auth.uid() is null or current_setting('bid.interno', true) = '1' then return new; end if;
  select modelo_id into v_modelo from public.contratos where id = new.contrato_id;
  if v_modelo is null then return new; end if; -- legado não usa esta tabela

  select coalesce(
    (select it->>'texto'
       from public.contrato_modelos m,
            jsonb_array_elements(m.catalogo->'clausulas') cl,
            jsonb_array_elements(cl->'itens') it
      where m.id = v_modelo and it->>'numero' = new.numero limit 1),
    (select d->>'texto'
       from public.contrato_modelos m, jsonb_array_elements(m.catalogo->'anexo_ii') d
      where m.id = v_modelo and 'decl:' || (d->>'numero') = new.numero limit 1)
  ) into v_padrao;
  new.texto_padrao := v_padrao;

  if new.variante_chave is not null then
    select reduz_protecao into v_reduz from public.modelo_variantes
     where modelo_id = v_modelo and chave = new.variante_chave and numero = new.numero;
    if v_reduz is null then raise exception 'variante % não existe no modelo para o item %', new.variante_chave, new.numero; end if;
    if coalesce(length(trim(new.justificativa)), 0) < 10 then
      raise exception 'item % como variante exige justificativa (mínimo 10 caracteres)', new.numero;
    end if;
    new.origem := 'variante';
    new.reduz_protecao := v_reduz;
  elsif new.bloco_chave is not null then
    if not exists (select 1 from public.modelo_blocos b where b.modelo_id = v_modelo and b.chave = new.bloco_chave) then
      raise exception 'bloco % não existe no modelo', new.bloco_chave;
    end if;
    new.origem := 'bloco';
    new.reduz_protecao := false;
  elsif v_padrao is not null and new.texto = v_padrao and not new.suprimido then
    new.origem := 'padrao';
    new.reduz_protecao := false;
    new.justificativa := null;
  else
    -- Texto diferente do padrão, item extra ou suprimido: precisa de origem
    -- explícita; 'padrao' é recusado. Fora do catálogo de variantes, o cliente
    -- não decide se reduz proteção (a revisão IA avalia): fica false.
    if new.origem = 'padrao' then
      raise exception 'item % alterado/suprimido precisa de origem (variante com justificativa)', new.numero;
    end if;
    -- 'parametro' e 'proposta' são atribuídos pelo resolvedor do servidor (M11),
    -- nunca pelo cliente: pelo cliente, alteração de item do catálogo é variante.
    if v_padrao is not null and new.origem in ('parametro', 'proposta') then
      raise exception 'item % do catálogo alterado pelo usuário é variante (com justificativa)', new.numero;
    end if;
    if new.origem = 'variante' and coalesce(length(trim(new.justificativa)), 0) < 10 then
      raise exception 'item % como variante exige justificativa (mínimo 10 caracteres)', new.numero;
    end if;
    new.reduz_protecao := false;
  end if;
  return new;
end;
$$;
drop trigger if exists trg_itens_clausula_origem on public.contrato_itens_clausula;
create trigger trg_itens_clausula_origem before insert or update on public.contrato_itens_clausula
  for each row execute function public.guard_item_clausula_origem();
