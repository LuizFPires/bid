-- M1 · Modelo de dados do domínio (acervo). Tudo escopado por org_id, RLS por
-- pertencimento. Exclusão é lógica (deleted_at). Isolamento entre orgs é
-- garantido por FKs compostas (id, org_id): um filho só referencia um pai da
-- MESMA org. Triggers forçam autoria de eventos e restringem o soft delete a
-- gestor (sem afetar o service_role/seed, quando auth.uid() é nulo).

-- ---------- obras ----------
create table if not exists public.obras (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizacoes(id) on delete cascade,
  nome text not null,
  cidade text,
  fase text,
  fase_pill text not null default 'neutro' check (fase_pill in ('aberta', 'analise', 'adjudicada', 'neutro')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  unique (id, org_id)
);
create index if not exists idx_obras_org on public.obras(org_id);
create trigger trg_obras_updated before update on public.obras
  for each row execute function public.set_updated_at();

-- ---------- certames (tomada de preços) ----------
create table if not exists public.certames (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizacoes(id) on delete cascade,
  obra_id uuid not null,
  categoria text not null,
  titulo text not null,
  escopo text,
  status text not null default 'aberta' check (status in ('aberta', 'analise', 'adjudicada')),
  abertura date,
  limite date,
  vencedora_proposta_id uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  unique (id, org_id),
  -- parentagem na MESMA org (isolamento entre inquilinos)
  foreign key (obra_id, org_id) references public.obras(id, org_id) on delete cascade
);
create index if not exists idx_certames_org on public.certames(org_id);
create index if not exists idx_certames_obra on public.certames(obra_id);
create index if not exists idx_certames_categoria on public.certames(categoria);
create trigger trg_certames_updated before update on public.certames
  for each row execute function public.set_updated_at();

-- ---------- propostas ----------
create table if not exists public.propostas (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizacoes(id) on delete cascade,
  certame_id uuid not null,
  fornecedor text not null,
  status text not null default 'recebida' check (status in ('recebida', 'analise', 'vencedora', 'desclassificada')),
  valor_atual numeric(14, 2),
  prazo_atual integer,
  condicao_pagamento text,
  garantia text,
  versao_atual integer not null default 1,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  unique (id, org_id),
  foreign key (certame_id, org_id) references public.certames(id, org_id) on delete cascade
);
create index if not exists idx_propostas_org on public.propostas(org_id);
create index if not exists idx_propostas_certame on public.propostas(certame_id);
create trigger trg_propostas_updated before update on public.propostas
  for each row execute function public.set_updated_at();

-- Vencedora: FK simples (SET NULL ao apagar a proposta) + trigger garante a
-- mesma org (FK composta com SET NULL violaria org_id NOT NULL).
alter table public.certames
  drop constraint if exists certames_vencedora_fk,
  add constraint certames_vencedora_fk
    foreign key (vencedora_proposta_id) references public.propostas(id) on delete set null;

create or replace function public.check_vencedora_org()
returns trigger language plpgsql as $$
begin
  if new.vencedora_proposta_id is not null
     and not exists (
       select 1 from public.propostas p
       where p.id = new.vencedora_proposta_id and p.org_id = new.org_id
     ) then
    raise exception 'proposta vencedora deve ser da mesma organização';
  end if;
  return new;
end;
$$;
create trigger trg_certames_vencedora before insert or update on public.certames
  for each row execute function public.check_vencedora_org();

-- ---------- proposta_versoes ----------
create table if not exists public.proposta_versoes (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizacoes(id) on delete cascade,
  proposta_id uuid not null,
  n integer not null,
  data date not null default current_date,
  valor numeric(14, 2),
  prazo integer,
  condicao_pagamento text,
  garantia text,
  obs text,
  arquivo_path text,
  dados_extraidos jsonb,
  created_at timestamptz not null default now(),
  unique (proposta_id, n),
  foreign key (proposta_id, org_id) references public.propostas(id, org_id) on delete cascade
);
create index if not exists idx_versoes_org on public.proposta_versoes(org_id);
create index if not exists idx_versoes_proposta on public.proposta_versoes(proposta_id);

-- ---------- sugestoes (autocomplete, campo livre) ----------
create table if not exists public.sugestoes (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizacoes(id) on delete cascade,
  tipo text not null check (tipo in ('categoria', 'fornecedor', 'obra', 'local')),
  texto text not null,
  uso integer not null default 1,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (org_id, tipo, texto)
);
create index if not exists idx_sugestoes_org_tipo on public.sugestoes(org_id, tipo);
create trigger trg_sugestoes_updated before update on public.sugestoes
  for each row execute function public.set_updated_at();

-- ---------- eventos (auditoria, append-only) ----------
create table if not exists public.eventos (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizacoes(id) on delete cascade,
  entidade text not null,
  entidade_id uuid,
  tipo text not null,
  payload jsonb,
  autor uuid default auth.uid(),
  created_at timestamptz not null default now()
);
create index if not exists idx_eventos_org on public.eventos(org_id);
create index if not exists idx_eventos_entidade on public.eventos(entidade, entidade_id);

-- Força a autoria ao usuário autenticado (impede forjar autor). Service_role
-- (auth.uid() nulo) mantém o autor informado pelo servidor.
create or replace function public.force_evento_autor()
returns trigger language plpgsql as $$
begin
  if auth.uid() is not null then
    new.autor := auth.uid();
  end if;
  return new;
end;
$$;
create trigger trg_eventos_autor before insert on public.eventos
  for each row execute function public.force_evento_autor();

-- org_id é imutável: impede mover uma linha para outra organização (uma linha
-- de org A nunca vira de org B, mesmo que o usuário pertença às duas).
create or replace function public.block_org_change()
returns trigger language plpgsql as $$
begin
  if new.org_id is distinct from old.org_id then
    raise exception 'org_id é imutável';
  end if;
  return new;
end;
$$;
create trigger trg_obras_org_immutable before update on public.obras
  for each row execute function public.block_org_change();
create trigger trg_certames_org_immutable before update on public.certames
  for each row execute function public.block_org_change();
create trigger trg_propostas_org_immutable before update on public.propostas
  for each row execute function public.block_org_change();
create trigger trg_versoes_org_immutable before update on public.proposta_versoes
  for each row execute function public.block_org_change();
create trigger trg_sugestoes_org_immutable before update on public.sugestoes
  for each row execute function public.block_org_change();

-- Soft delete (mexer em deleted_at) só por gestor — para usuários autenticados.
-- Checa a org ORIGINAL (old) da linha; com org_id imutável, old = new.
create or replace function public.guard_soft_delete()
returns trigger language plpgsql as $$
begin
  if auth.uid() is not null
     and (new.deleted_at is distinct from old.deleted_at)
     and not public.is_gestor(old.org_id) then
    raise exception 'apenas gestor pode arquivar/excluir (soft delete)';
  end if;
  return new;
end;
$$;
create trigger trg_obras_guard_del before update on public.obras
  for each row execute function public.guard_soft_delete();
create trigger trg_certames_guard_del before update on public.certames
  for each row execute function public.guard_soft_delete();
create trigger trg_propostas_guard_del before update on public.propostas
  for each row execute function public.guard_soft_delete();

-- ---------- RLS (por pertencimento à org) ----------
alter table public.obras enable row level security;
alter table public.certames enable row level security;
alter table public.propostas enable row level security;
alter table public.proposta_versoes enable row level security;
alter table public.sugestoes enable row level security;
alter table public.eventos enable row level security;

-- obras / certames / propostas / proposta_versoes / sugestoes:
-- select+insert+update para membros da org. Sem DELETE (exclusão é lógica).
-- A parentagem na mesma org é garantida pelas FKs compostas acima.
do $$
declare t text;
begin
  foreach t in array array['obras', 'certames', 'propostas', 'proposta_versoes', 'sugestoes']
  loop
    execute format($f$
      create policy "%1$s_select" on public.%1$s
        for select to authenticated using (public.is_member(org_id));
      create policy "%1$s_insert" on public.%1$s
        for insert to authenticated with check (public.is_member(org_id));
      create policy "%1$s_update" on public.%1$s
        for update to authenticated using (public.is_member(org_id)) with check (public.is_member(org_id));
    $f$, t);
  end loop;
end $$;

-- eventos: membros leem; inserem na própria org (autor é forçado pelo trigger).
-- Sem update/delete (append-only).
create policy "eventos_select" on public.eventos
  for select to authenticated using (public.is_member(org_id));
create policy "eventos_insert" on public.eventos
  for insert to authenticated with check (public.is_member(org_id));
