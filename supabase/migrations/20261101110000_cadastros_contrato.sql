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
  cnpj text not null check (cnpj ~ '^[0-9]{14}$'),
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
  parte_id uuid not null references public.partes(id) on delete cascade,
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
  cnpj text not null check (cnpj ~ '^[0-9]{14}$'),
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
  fornecedor_id uuid not null references public.fornecedores(id) on delete cascade,
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
alter table public.obras add constraint obras_contratante_fk
  foreign key (contratante_id) references public.partes(id) on delete set null;
alter table public.obras drop constraint if exists obras_construtora_fk;
alter table public.obras add constraint obras_construtora_fk
  foreign key (construtora_id) references public.partes(id) on delete set null;

-- ---------- quem pode escrever cadastros ----------
-- Partes (contratante/construtora) são administração: gestor da org ou quem
-- gerencia (dono/gestor) alguma obra da org. Fornecedores nascem da proposta:
-- qualquer colaborador da org cria/edita.
create or replace function public.administra_cadastros(p_org uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select public.is_gestor(p_org) or exists (
    select 1 from public.obras o
     where o.org_id = p_org and o.deleted_at is null and public.gerencia_obra(o.id)
  );
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
create policy "parte_sign_select" on public.parte_signatarios for select using (public.colabora_org(org_id));
drop policy if exists "parte_sign_insert" on public.parte_signatarios;
create policy "parte_sign_insert" on public.parte_signatarios for insert with check (public.administra_cadastros(org_id));
drop policy if exists "parte_sign_update" on public.parte_signatarios;
create policy "parte_sign_update" on public.parte_signatarios for update using (public.administra_cadastros(org_id)) with check (public.administra_cadastros(org_id));
drop policy if exists "parte_sign_delete" on public.parte_signatarios;
create policy "parte_sign_delete" on public.parte_signatarios for delete using (public.administra_cadastros(org_id));

drop policy if exists "fornecedores_select" on public.fornecedores;
create policy "fornecedores_select" on public.fornecedores for select using (public.colabora_org(org_id));
drop policy if exists "fornecedores_insert" on public.fornecedores;
create policy "fornecedores_insert" on public.fornecedores for insert with check (public.colabora_org(org_id));
drop policy if exists "fornecedores_update" on public.fornecedores;
create policy "fornecedores_update" on public.fornecedores for update using (public.colabora_org(org_id)) with check (public.colabora_org(org_id));

drop policy if exists "forn_sign_select" on public.fornecedor_signatarios;
create policy "forn_sign_select" on public.fornecedor_signatarios for select using (public.colabora_org(org_id));
drop policy if exists "forn_sign_insert" on public.fornecedor_signatarios;
create policy "forn_sign_insert" on public.fornecedor_signatarios for insert with check (public.colabora_org(org_id));
drop policy if exists "forn_sign_update" on public.fornecedor_signatarios;
create policy "forn_sign_update" on public.fornecedor_signatarios for update using (public.colabora_org(org_id)) with check (public.colabora_org(org_id));
drop policy if exists "forn_sign_delete" on public.fornecedor_signatarios;
create policy "forn_sign_delete" on public.fornecedor_signatarios for delete using (public.colabora_org(org_id));

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
  return new;
end;
$$;
drop trigger if exists trg_obras_campos_contrato on public.obras;
create trigger trg_obras_campos_contrato before update on public.obras
  for each row execute function public.guard_obra_campos_contrato();
