-- M6 · Contrato derivado da proposta vencedora. Tabelas contratos +
-- contrato_clausulas, policy de INSERT no bucket `contratos` (upload pela
-- função user-scoped, sem service_role) e RPC de criação atômica.

create table if not exists public.contratos (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizacoes(id) on delete cascade,
  certame_id uuid not null,
  proposta_id uuid not null,
  obra_id uuid not null,
  categoria text not null,
  valor numeric(14, 2),
  status text not null default 'rascunho' check (status in ('rascunho', 'enviado', 'assinado')),
  pdf_path text,
  paginas integer,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  unique (id, org_id),
  foreign key (certame_id, org_id) references public.certames(id, org_id) on delete cascade,
  foreign key (proposta_id, org_id) references public.propostas(id, org_id) on delete cascade,
  foreign key (obra_id, org_id) references public.obras(id, org_id) on delete cascade
);
create index if not exists idx_contratos_org on public.contratos(org_id);
create index if not exists idx_contratos_proposta on public.contratos(proposta_id);

create table if not exists public.contrato_clausulas (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizacoes(id) on delete cascade,
  contrato_id uuid not null,
  numero integer not null,
  titulo text not null,
  texto text not null,
  origem text not null default 'modelo' check (origem in ('proposta', 'modelo')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (contrato_id, numero),
  foreign key (contrato_id, org_id) references public.contratos(id, org_id) on delete cascade
);
create index if not exists idx_clausulas_contrato on public.contrato_clausulas(contrato_id);

create trigger trg_contratos_updated before update on public.contratos
  for each row execute function public.set_updated_at();
create trigger trg_contratos_org_immutable before update on public.contratos
  for each row execute function public.block_org_change();
create trigger trg_contratos_guard_del before update on public.contratos
  for each row execute function public.guard_soft_delete();
create trigger trg_clausulas_updated before update on public.contrato_clausulas
  for each row execute function public.set_updated_at();
create trigger trg_clausulas_org_immutable before update on public.contrato_clausulas
  for each row execute function public.block_org_change();

-- RLS.
alter table public.contratos enable row level security;
alter table public.contrato_clausulas enable row level security;
do $$
declare t text;
begin
  foreach t in array array['contratos', 'contrato_clausulas']
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
-- Sem DELETE (exclusão é lógica).

-- Storage: o PDF do contrato é gravado pela função (user-scoped) na pasta do
-- usuário dentro do bucket privado `contratos`. (No M0 só havia SELECT do dono.)
-- Caminho dos objetos: {org_id}/{user_id}/contrato-*.pdf. Além de owner_id,
-- exige que a pasta do usuário (2º segmento) seja o próprio uid (defesa extra).
drop policy if exists "bid_contratos_insert" on storage.objects;
create policy "bid_contratos_insert" on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'contratos'
    and owner_id = (select auth.uid()::text)
    and (storage.foldername(name))[2] = (select auth.uid()::text)
  );
drop policy if exists "bid_contratos_update" on storage.objects;
create policy "bid_contratos_update" on storage.objects
  for update to authenticated
  using (
    bucket_id = 'contratos'
    and owner_id = (select auth.uid()::text)
    and (storage.foldername(name))[2] = (select auth.uid()::text)
  )
  with check (
    bucket_id = 'contratos'
    and owner_id = (select auth.uid()::text)
    and (storage.foldername(name))[2] = (select auth.uid()::text)
  );

-- Criação atômica do contrato a partir da proposta VENCEDORA de um certame
-- ADJUDICADO. As cláusulas (texto gerado no core) chegam em p_clausulas; o valor
-- é fixado a partir da proposta (autoritativo, não do cliente).
create or replace function public.criar_contrato(p_proposta uuid, p_clausulas jsonb)
returns uuid
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_org uuid;
  v_certame uuid;
  v_obra uuid;
  v_categoria text;
  v_valor numeric(14, 2);
  v_contrato uuid;
  v_cl jsonb;
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

  insert into public.contratos (org_id, certame_id, proposta_id, obra_id, categoria, valor, status)
    values (v_org, v_certame, p_proposta, v_obra, v_categoria, v_valor, 'rascunho')
    returning id into v_contrato;

  for v_cl in select * from jsonb_array_elements(coalesce(p_clausulas, '[]'::jsonb))
  loop
    insert into public.contrato_clausulas (org_id, contrato_id, numero, titulo, texto, origem)
      values (
        v_org, v_contrato,
        (v_cl->>'numero')::integer,
        coalesce(v_cl->>'titulo', ''),
        coalesce(v_cl->>'texto', ''),
        coalesce(v_cl->>'origem', 'modelo')
      );
  end loop;

  insert into public.eventos (org_id, entidade, entidade_id, tipo, payload)
    values (v_org, 'contrato', v_contrato, 'contrato_criado',
            jsonb_build_object('proposta', p_proposta, 'certame', v_certame));

  return v_contrato;
end;
$$;

revoke all on function public.criar_contrato(uuid, jsonb) from public, anon;
grant execute on function public.criar_contrato(uuid, jsonb) to authenticated;
