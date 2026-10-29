-- M1 · Multi-tenant por organização.
-- Toda tabela de domínio terá org_id; a RLS libera quem é membro da org.
-- Um trigger cria a organização pessoal + membership no primeiro login.

-- Helper genérico: mantém updated_at.
create or replace function public.set_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

-- ---------- organizacoes ----------
create table if not exists public.organizacoes (
  id uuid primary key default gen_random_uuid(),
  nome text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);
create trigger trg_organizacoes_updated before update on public.organizacoes
  for each row execute function public.set_updated_at();

-- ---------- membros (usuário ↔ organização) ----------
create table if not exists public.membros (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizacoes(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  papel text not null default 'gestor' check (papel in ('gestor', 'equipe')),
  created_at timestamptz not null default now(),
  unique (org_id, user_id)
);
create index if not exists idx_membros_user on public.membros(user_id);

-- Pertencimento (SECURITY DEFINER evita recursão de RLS ao checar membros).
create or replace function public.is_member(p_org uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.membros
    where org_id = p_org and user_id = auth.uid()
  );
$$;

-- Papel de gestor na org (para ações administrativas, ex.: editar a org).
create or replace function public.is_gestor(p_org uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.membros
    where org_id = p_org and user_id = auth.uid() and papel = 'gestor'
  );
$$;

-- Criação de organização pelo cliente: insere a org e o vínculo de gestor do
-- próprio usuário atomicamente. É o ÚNICO caminho de criação pelo cliente
-- (não há INSERT direto em organizacoes/membros) — evita órfãs e evita que
-- alguém se adicione a uma org alheia.
create or replace function public.create_org(p_nome text)
returns uuid language plpgsql security definer set search_path = public as $$
declare
  v_org uuid;
begin
  if auth.uid() is null then
    raise exception 'não autenticado';
  end if;
  insert into public.organizacoes (nome)
    values (coalesce(nullif(trim(p_nome), ''), 'Minha organização'))
    returning id into v_org;
  insert into public.membros (org_id, user_id, papel) values (v_org, auth.uid(), 'gestor');
  return v_org;
end;
$$;
revoke execute on function public.create_org(text) from public;
grant execute on function public.create_org(text) to authenticated;

-- Primeira organização + membership no cadastro do usuário.
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  v_org uuid;
begin
  insert into public.organizacoes (nome)
    values (coalesce(nullif(new.raw_user_meta_data ->> 'org_nome', ''), 'Minha organização'))
    returning id into v_org;
  insert into public.membros (org_id, user_id, papel) values (v_org, new.id, 'gestor');
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ---------- RLS ----------
alter table public.organizacoes enable row level security;
alter table public.membros enable row level security;

-- organizacoes: membros leem; só gestor edita. A criação é pela RPC create_org
-- (SECURITY DEFINER) — não há INSERT direto pelo cliente.
create policy "org_select" on public.organizacoes
  for select to authenticated using (public.is_member(id));
create policy "org_update" on public.organizacoes
  for update to authenticated using (public.is_gestor(id)) with check (public.is_gestor(id));

-- membros: cada um vê os membros das suas orgs. Vínculos são criados só pelo
-- trigger de signup e pela RPC create_org (ambos SECURITY DEFINER); não há
-- INSERT direto pelo cliente (evita entrar em qualquer org).
create policy "membros_select" on public.membros
  for select to authenticated using (public.is_member(org_id));
