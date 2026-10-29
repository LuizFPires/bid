-- M4 · Equalização: tabela `equalizacoes` + RPC de criação atômica.
-- Escopo por org, RLS por pertencimento, soft-delete, sem DELETE de cliente.
-- A recomendação da IA é apoio (regra #6): fica em `resultado_ia` e nunca decide
-- sozinha — a vencedora é escolhida pelo usuário (M5).

create table if not exists public.equalizacoes (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizacoes(id) on delete cascade,
  escopo text not null check (escopo in ('obra', 'entre_obras')),
  categoria text not null,
  certame_id uuid,                        -- nulo para entre_obras
  proposta_ids uuid[] not null default '{}',
  resultado_ia jsonb,                     -- { veredito, achados[], recomendacao }
  criado_por uuid default auth.uid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  unique (id, org_id)
);
create index if not exists idx_equalizacoes_org on public.equalizacoes(org_id);
create index if not exists idx_equalizacoes_certame on public.equalizacoes(certame_id);

create trigger trg_equalizacoes_updated before update on public.equalizacoes
  for each row execute function public.set_updated_at();
create trigger trg_equalizacoes_org_immutable before update on public.equalizacoes
  for each row execute function public.block_org_change();
create trigger trg_equalizacoes_guard_del before update on public.equalizacoes
  for each row execute function public.guard_soft_delete();

-- certame_id na MESMA org (FK simples + trigger; SET NULL com FK composta
-- violaria org_id NOT NULL, mesmo padrão de certames.vencedora).
alter table public.equalizacoes
  drop constraint if exists equalizacoes_certame_fk,
  add constraint equalizacoes_certame_fk
    foreign key (certame_id) references public.certames(id) on delete set null;

create or replace function public.check_equalizacao_certame_org()
returns trigger language plpgsql as $$
begin
  if new.certame_id is not null
     and not exists (
       select 1 from public.certames c
       where c.id = new.certame_id and c.org_id = new.org_id
     ) then
    raise exception 'certame deve ser da mesma organização';
  end if;
  return new;
end;
$$;
create trigger trg_equalizacoes_certame_org before insert or update on public.equalizacoes
  for each row execute function public.check_equalizacao_certame_org();

-- Força o autor ao usuário autenticado no INSERT e torna `criado_por` IMUTÁVEL
-- no UPDATE (impede forjar/alterar a autoria por qualquer caminho).
create or replace function public.force_criado_por()
returns trigger language plpgsql as $$
begin
  if tg_op = 'UPDATE' then
    new.criado_por := old.criado_por;
  elsif auth.uid() is not null then
    new.criado_por := auth.uid();
  end if;
  return new;
end;
$$;
create trigger trg_equalizacoes_criador before insert or update on public.equalizacoes
  for each row execute function public.force_criado_por();

-- RLS.
alter table public.equalizacoes enable row level security;
create policy "equalizacoes_select" on public.equalizacoes
  for select to authenticated using (public.is_member(org_id));
create policy "equalizacoes_insert" on public.equalizacoes
  for insert to authenticated with check (public.is_member(org_id));
create policy "equalizacoes_update" on public.equalizacoes
  for update to authenticated using (public.is_member(org_id)) with check (public.is_member(org_id));
-- Sem DELETE (exclusão é lógica).

-- Criação atômica: valida que todas as propostas são visíveis (mesma org via
-- RLS), fixa a org, para escopo 'obra' exige certame e o move aberta->analise,
-- e grava o evento de auditoria.
create or replace function public.criar_equalizacao(
  p_escopo text,
  p_categoria text,
  p_certame uuid,
  p_proposta_ids uuid[]
) returns uuid
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_org uuid;
  v_orgs uuid[];
  v_qtd integer;
  v_categoria text := nullif(btrim(p_categoria), '');
  v_eq uuid;
  v_certame uuid := case when p_escopo = 'obra' then p_certame else null end;
begin
  if v_categoria is null then raise exception 'categoria é obrigatória'; end if;
  if p_escopo not in ('obra', 'entre_obras') then raise exception 'escopo inválido'; end if;
  if coalesce(array_length(p_proposta_ids, 1), 0) < 2 then
    raise exception 'selecione ao menos duas propostas';
  end if;
  if p_escopo = 'obra' and p_certame is null then
    raise exception 'escopo obra exige um certame';
  end if;

  -- Propostas visíveis (RLS) e todas da mesma org.
  select array_agg(distinct org_id), count(*)
    into v_orgs, v_qtd
    from public.propostas
    where id = any (p_proposta_ids) and deleted_at is null;

  if v_qtd <> array_length(p_proposta_ids, 1) then
    raise exception 'alguma proposta não existe ou não é acessível';
  end if;
  if array_length(v_orgs, 1) <> 1 then
    raise exception 'as propostas devem ser da mesma organização';
  end if;
  v_org := v_orgs[1];

  insert into public.equalizacoes (org_id, escopo, categoria, certame_id, proposta_ids)
    values (v_org, p_escopo, v_categoria, v_certame, p_proposta_ids)
    returning id into v_eq;

  -- Começar a equalizar move o certame de 'aberta' para 'analise' (SPEC).
  if v_certame is not null then
    update public.certames set status = 'analise'
      where id = v_certame and org_id = v_org and status = 'aberta';
  end if;

  insert into public.eventos (org_id, entidade, entidade_id, tipo, payload)
    values (v_org, 'equalizacao', v_eq, 'equalizacao_criada',
            jsonb_build_object('escopo', p_escopo, 'categoria', v_categoria, 'propostas', p_proposta_ids));

  return v_eq;
end;
$$;

revoke all on function public.criar_equalizacao(text, text, uuid, uuid[]) from public, anon;
grant execute on function public.criar_equalizacao(text, text, uuid, uuid[]) to authenticated;
