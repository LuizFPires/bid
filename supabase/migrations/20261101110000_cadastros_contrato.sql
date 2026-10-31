-- M9 · Cadastros que a minuta padrão precisa (SPEC-contratos §2.2):
-- obra ganha endereço/CNO/foro e as partes CONTRATANTE e CONSTRUTORA;
-- `partes` (contratante/construtora) e `fornecedores` (contratada) com
-- signatários (1..n por parte). CNPJ/CPF validados no core; aqui só o formato.

-- ---------- obras ----------
alter table public.obras
  add column if not exists endereco text,
  add column if not exists cep text,
  add column if not exists cno text,
  add column if not exists foro text,
  add column if not exists contratante_id uuid,
  add column if not exists construtora_id uuid;

-- ---------- partes (CONTRATANTE e CONSTRUTORA) ----------
create table if not exists public.partes (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizacoes(id) on delete cascade,
  tipo text not null check (tipo in ('contratante', 'construtora')),
  razao_social text not null,
  nome_curto text,
  natureza text,
  cnpj text not null check (cnpj ~ '^[A-Z0-9]{12}[0-9]{2}$'), -- CNPJ alfanumérico (Receita, 2026) aceito
  endereco text not null,
  cep text check (cep is null or cep ~ '^[0-9]{8}$'),
  email text,
  marca text check (marca is null or marca in ('ampla', 'classica')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  unique (id, org_id)
);
create unique index if not exists uq_partes_org_cnpj on public.partes(org_id, cnpj) where deleted_at is null;
create index if not exists idx_partes_org on public.partes(org_id);
drop trigger if exists trg_partes_updated on public.partes;
create trigger trg_partes_updated before update on public.partes
  for each row execute function public.set_updated_at();

create table if not exists public.parte_signatarios (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizacoes(id) on delete cascade,
  parte_id uuid not null,
  -- FK composta: signatário sempre da MESMA org da parte (isolamento entre inquilinos)
  foreign key (parte_id, org_id) references public.partes(id, org_id) on delete cascade,
  nome text not null,
  cpf text check (cpf is null or cpf ~ '^[0-9]{11}$'),
  cargo text,
  email text,
  telefone text,
  ordem int not null default 1,
  ativo boolean not null default true
);
create index if not exists idx_parte_sign_parte on public.parte_signatarios(parte_id);

-- ---------- fornecedores (CONTRATADA) ----------
create table if not exists public.fornecedores (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizacoes(id) on delete cascade,
  razao_social text not null,
  nome_curto text,
  natureza text,
  cnpj text not null check (cnpj ~ '^[A-Z0-9]{12}[0-9]{2}$'),
  endereco text not null,
  cep text check (cep is null or cep ~ '^[0-9]{8}$'),
  email text,
  responsavel_tecnico text,
  crea text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  unique (id, org_id)
);
create unique index if not exists uq_fornecedores_org_cnpj on public.fornecedores(org_id, cnpj) where deleted_at is null;
create index if not exists idx_fornecedores_org on public.fornecedores(org_id);
drop trigger if exists trg_fornecedores_updated on public.fornecedores;
create trigger trg_fornecedores_updated before update on public.fornecedores
  for each row execute function public.set_updated_at();

create table if not exists public.fornecedor_signatarios (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizacoes(id) on delete cascade,
  fornecedor_id uuid not null,
  foreign key (fornecedor_id, org_id) references public.fornecedores(id, org_id) on delete cascade,
  nome text not null,
  cpf text check (cpf is null or cpf ~ '^[0-9]{11}$'),
  cargo text,
  email text,
  telefone text,
  ordem int not null default 1,
  ativo boolean not null default true
);
create index if not exists idx_forn_sign_forn on public.fornecedor_signatarios(fornecedor_id);

-- obras → partes (FKs depois de criar as tabelas)
alter table public.obras drop constraint if exists obras_contratante_fk;
-- FKs compostas com org_id: a obra só aponta para partes da PRÓPRIA org.
alter table public.obras add constraint obras_contratante_fk
  foreign key (contratante_id, org_id) references public.partes(id, org_id) on delete set null;
alter table public.obras drop constraint if exists obras_construtora_fk;
alter table public.obras add constraint obras_construtora_fk
  foreign key (construtora_id, org_id) references public.partes(id, org_id) on delete set null;

-- ---------- quem pode escrever cadastros ----------
-- Partes (contratante/construtora) são o cadastro da EMPRESA: só membros reais
-- da organização (membros) editam — um gestor convidado para uma obra não mexe
-- na construtora/contratante usadas pelas outras obras. Fornecedores nascem da
-- proposta: qualquer colaborador da org cria/edita. (Desvio do SPEC §2.2,
-- registrado em Decisões: lá previa "gerencia alguma obra".)
create or replace function public.administra_cadastros(p_org uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select public.is_member(p_org);
$$;
revoke all on function public.administra_cadastros(uuid) from public, anon;
grant execute on function public.administra_cadastros(uuid) to authenticated;

-- ---------- RLS ----------
alter table public.partes enable row level security;
alter table public.parte_signatarios enable row level security;
alter table public.fornecedores enable row level security;
alter table public.fornecedor_signatarios enable row level security;

drop policy if exists "partes_select" on public.partes;
create policy "partes_select" on public.partes for select using (public.colabora_org(org_id));
drop policy if exists "partes_insert" on public.partes;
create policy "partes_insert" on public.partes for insert with check (public.administra_cadastros(org_id));
drop policy if exists "partes_update" on public.partes;
create policy "partes_update" on public.partes for update using (public.administra_cadastros(org_id)) with check (public.administra_cadastros(org_id));

drop policy if exists "parte_sign_select" on public.parte_signatarios;
-- Signatários carregam CPF/telefone: leitura só por membros da org (dados pessoais).
create policy "parte_sign_select" on public.parte_signatarios for select using (public.is_member(org_id));
drop policy if exists "parte_sign_insert" on public.parte_signatarios;
create policy "parte_sign_insert" on public.parte_signatarios for insert with check (public.administra_cadastros(org_id));
drop policy if exists "parte_sign_update" on public.parte_signatarios;
create policy "parte_sign_update" on public.parte_signatarios for update using (public.administra_cadastros(org_id)) with check (public.administra_cadastros(org_id));

drop policy if exists "fornecedores_select" on public.fornecedores;
create policy "fornecedores_select" on public.fornecedores for select using (public.colabora_org(org_id));
drop policy if exists "fornecedores_insert" on public.fornecedores;
create policy "fornecedores_insert" on public.fornecedores for insert with check (public.colabora_org(org_id));
drop policy if exists "fornecedores_update" on public.fornecedores;
create policy "fornecedores_update" on public.fornecedores for update using (public.colabora_org(org_id)) with check (public.colabora_org(org_id));

drop policy if exists "forn_sign_select" on public.fornecedor_signatarios;
create policy "forn_sign_select" on public.fornecedor_signatarios for select using (public.is_member(org_id));
drop policy if exists "forn_sign_insert" on public.fornecedor_signatarios;
create policy "forn_sign_insert" on public.fornecedor_signatarios for insert with check (public.colabora_org(org_id));
drop policy if exists "forn_sign_update" on public.fornecedor_signatarios;
create policy "forn_sign_update" on public.fornecedor_signatarios for update using (public.colabora_org(org_id)) with check (public.colabora_org(org_id));

-- Campos de contrato da obra: só quem gerencia a obra edita (a policy de
-- update de obras já exige pode_obra; o trigger abaixo aperta para esses campos).
create or replace function public.guard_obra_campos_contrato()
returns trigger language plpgsql as $$
begin
  if auth.uid() is not null
     and (new.endereco is distinct from old.endereco
          or new.cep is distinct from old.cep
          or new.cno is distinct from old.cno
          or new.foro is distinct from old.foro
          or new.contratante_id is distinct from old.contratante_id
          or new.construtora_id is distinct from old.construtora_id)
     and not public.gerencia_obra(old.id) then
    raise exception 'Só o dono ou um gestor da obra edita os dados de contrato da obra.';
  end if;
  -- A parte apontada precisa ser do tipo certo.
  if new.contratante_id is not null and not exists (
    select 1 from public.partes p where p.id = new.contratante_id and p.tipo = 'contratante' and p.deleted_at is null
  ) then raise exception 'contratante_id precisa apontar para uma parte do tipo contratante'; end if;
  if new.construtora_id is not null and not exists (
    select 1 from public.partes p where p.id = new.construtora_id and p.tipo = 'construtora' and p.deleted_at is null
  ) then raise exception 'construtora_id precisa apontar para uma parte do tipo construtora'; end if;
  return new;
end;
$$;
drop trigger if exists trg_obras_campos_contrato on public.obras;
create trigger trg_obras_campos_contrato before update on public.obras
  for each row execute function public.guard_obra_campos_contrato();


-- ---------- gravação em UMA transação (parte/fornecedor + signatários) ----------
-- Signatários removidos viram ativo=false (regra 10: nada se apaga de fato).
-- security invoker: RLS das tabelas decide quem pode.
create or replace function public.salvar_parte(p_org uuid, p_parte jsonb, p_signatarios jsonb)
returns uuid
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_id uuid := nullif(p_parte->>'id', '')::uuid;
  v_sig jsonb;
  v_ids uuid[] := '{}';
  v_i int := 0;
  v_sid uuid;
begin
  if jsonb_typeof(p_signatarios) <> 'array' then raise exception 'signatários inválidos'; end if;
  if v_id is null then
    insert into public.partes (org_id, tipo, razao_social, nome_curto, natureza, cnpj, endereco, cep, email, marca)
    values (p_org, p_parte->>'tipo', p_parte->>'razao_social', nullif(p_parte->>'nome_curto',''), nullif(p_parte->>'natureza',''),
            upper(p_parte->>'cnpj'), p_parte->>'endereco', nullif(p_parte->>'cep',''), nullif(p_parte->>'email',''), nullif(p_parte->>'marca',''))
    returning id into v_id;
  else
    update public.partes set
      tipo = p_parte->>'tipo', razao_social = p_parte->>'razao_social', nome_curto = nullif(p_parte->>'nome_curto',''),
      natureza = nullif(p_parte->>'natureza',''), cnpj = upper(p_parte->>'cnpj'), endereco = p_parte->>'endereco',
      cep = nullif(p_parte->>'cep',''), email = nullif(p_parte->>'email',''), marca = nullif(p_parte->>'marca','')
    where id = v_id and org_id = p_org and deleted_at is null;
    if not found then raise exception 'parte não encontrada ou sem permissão'; end if;
  end if;

  for v_sig in select * from jsonb_array_elements(p_signatarios) loop
    v_i := v_i + 1;
    v_sid := nullif(v_sig->>'id', '')::uuid;
    if v_sid is null then
      insert into public.parte_signatarios (org_id, parte_id, nome, cpf, cargo, email, telefone, ordem, ativo)
      values (p_org, v_id, v_sig->>'nome', nullif(v_sig->>'cpf',''), nullif(v_sig->>'cargo',''), nullif(v_sig->>'email',''), nullif(v_sig->>'telefone',''), v_i, true)
      returning id into v_sid;
    else
      update public.parte_signatarios set nome = v_sig->>'nome', cpf = nullif(v_sig->>'cpf',''), cargo = nullif(v_sig->>'cargo',''),
        email = nullif(v_sig->>'email',''), telefone = nullif(v_sig->>'telefone',''), ordem = v_i, ativo = true
      where id = v_sid and parte_id = v_id and org_id = p_org;
      if not found then raise exception 'signatário não encontrado'; end if;
    end if;
    v_ids := array_append(v_ids, v_sid);
  end loop;
  update public.parte_signatarios set ativo = false where parte_id = v_id and org_id = p_org and ativo and not (id = any(v_ids));
  return v_id;
end;
$$;

create or replace function public.salvar_fornecedor(p_org uuid, p_fornecedor jsonb, p_signatarios jsonb)
returns uuid
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_id uuid := nullif(p_fornecedor->>'id', '')::uuid;
  v_sig jsonb;
  v_ids uuid[] := '{}';
  v_i int := 0;
  v_sid uuid;
begin
  if jsonb_typeof(p_signatarios) <> 'array' then raise exception 'signatários inválidos'; end if;
  if v_id is null then
    insert into public.fornecedores (org_id, razao_social, nome_curto, natureza, cnpj, endereco, cep, email, responsavel_tecnico, crea)
    values (p_org, p_fornecedor->>'razao_social', nullif(p_fornecedor->>'nome_curto',''), nullif(p_fornecedor->>'natureza',''),
            upper(p_fornecedor->>'cnpj'), p_fornecedor->>'endereco', nullif(p_fornecedor->>'cep',''), nullif(p_fornecedor->>'email',''),
            nullif(p_fornecedor->>'responsavel_tecnico',''), nullif(p_fornecedor->>'crea',''))
    returning id into v_id;
  else
    update public.fornecedores set
      razao_social = p_fornecedor->>'razao_social', nome_curto = nullif(p_fornecedor->>'nome_curto',''), natureza = nullif(p_fornecedor->>'natureza',''),
      cnpj = upper(p_fornecedor->>'cnpj'), endereco = p_fornecedor->>'endereco', cep = nullif(p_fornecedor->>'cep',''), email = nullif(p_fornecedor->>'email',''),
      responsavel_tecnico = nullif(p_fornecedor->>'responsavel_tecnico',''), crea = nullif(p_fornecedor->>'crea','')
    where id = v_id and org_id = p_org and deleted_at is null;
    if not found then raise exception 'fornecedor não encontrado ou sem permissão'; end if;
  end if;

  for v_sig in select * from jsonb_array_elements(p_signatarios) loop
    v_i := v_i + 1;
    v_sid := nullif(v_sig->>'id', '')::uuid;
    if v_sid is null then
      insert into public.fornecedor_signatarios (org_id, fornecedor_id, nome, cpf, cargo, email, telefone, ordem, ativo)
      values (p_org, v_id, v_sig->>'nome', nullif(v_sig->>'cpf',''), nullif(v_sig->>'cargo',''), nullif(v_sig->>'email',''), nullif(v_sig->>'telefone',''), v_i, true)
      returning id into v_sid;
    else
      update public.fornecedor_signatarios set nome = v_sig->>'nome', cpf = nullif(v_sig->>'cpf',''), cargo = nullif(v_sig->>'cargo',''),
        email = nullif(v_sig->>'email',''), telefone = nullif(v_sig->>'telefone',''), ordem = v_i, ativo = true
      where id = v_sid and fornecedor_id = v_id and org_id = p_org;
      if not found then raise exception 'signatário não encontrado'; end if;
    end if;
    v_ids := array_append(v_ids, v_sid);
  end loop;
  update public.fornecedor_signatarios set ativo = false where fornecedor_id = v_id and org_id = p_org and ativo and not (id = any(v_ids));
  return v_id;
end;
$$;

revoke all on function public.salvar_parte(uuid, jsonb, jsonb) from public, anon;
revoke all on function public.salvar_fornecedor(uuid, jsonb, jsonb) from public, anon;
grant execute on function public.salvar_parte(uuid, jsonb, jsonb) to authenticated;
grant execute on function public.salvar_fornecedor(uuid, jsonb, jsonb) to authenticated;
