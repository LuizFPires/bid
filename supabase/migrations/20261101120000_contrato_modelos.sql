-- M9 · Modelo da minuta, versionado (SPEC-contratos §2.3). O TEXTO da minuta
-- nunca entra em migration/seed (repo público): o .docx vai ao bucket privado
-- `modelos` e o catálogo/biblioteca são carregados pelo script local
-- scripts/seed-modelo-contrato.mjs (service_role, fora do git).

create table if not exists public.contrato_modelos (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizacoes(id) on delete cascade,
  codigo text not null,                 -- 'empreitada'
  versao text not null,                 -- '1.0'
  docx_path text not null,              -- bucket `modelos`: {org}/empreitada-1.0.docx
  catalogo jsonb not null,              -- clausulas-v1.json (texto padrão de cada item + Anexo II)
  ativo boolean not null default false,
  created_at timestamptz not null default now(),
  unique (org_id, codigo, versao),
  unique (id, org_id)
);
-- só uma versão ativa por (org, codigo)
create unique index if not exists uq_modelo_ativo on public.contrato_modelos(org_id, codigo) where ativo;

create table if not exists public.modelo_blocos (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizacoes(id) on delete cascade,
  modelo_id uuid not null,
  -- FK composta: filho sempre da MESMA org do modelo (isolamento entre inquilinos)
  foreign key (modelo_id, org_id) references public.contrato_modelos(id, org_id) on delete cascade,
  chave text not null,                  -- 'escavacao_escoramento'
  titulo text not null,
  categorias text[] not null default '{}',   -- sugere por categoria do certame; '*' = sempre oferecer
  quando text,                          -- dica de quando usar (texto curto)
  itens_anexo jsonb not null,           -- ["texto com {{parametros}}", ...]
  altera_clausulas jsonb not null default '[]',
  parametros jsonb not null default '[]',
  unique (modelo_id, chave)
);

create table if not exists public.modelo_variantes (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizacoes(id) on delete cascade,
  modelo_id uuid not null,
  -- FK composta: filho sempre da MESMA org do modelo (isolamento entre inquilinos)
  foreign key (modelo_id, org_id) references public.contrato_modelos(id, org_id) on delete cascade,
  chave text not null,                  -- '19.4_indenizacao_legal'
  numero text not null,                 -- item afetado: '19.4'
  titulo text not null,
  texto text not null,
  reduz_protecao boolean not null default false,
  explicacao text not null,             -- o que a parte perde (mostrado ao aprovar)
  unique (modelo_id, chave)
);

-- Parâmetros de cláusula (texto alternativo de um item quando um parâmetro é usado).
create table if not exists public.modelo_parametros (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizacoes(id) on delete cascade,
  modelo_id uuid not null,
  -- FK composta: filho sempre da MESMA org do modelo (isolamento entre inquilinos)
  foreign key (modelo_id, org_id) references public.contrato_modelos(id, org_id) on delete cascade,
  numero text not null,                 -- '3.1'
  parametro text not null,              -- 'inicio_anterior'
  rotulo text not null,
  tipo text not null,                   -- 'data' | 'moeda' | 'texto' | ...
  texto text not null,                  -- texto do item quando o parâmetro é usado
  unique (modelo_id, parametro)
);

-- ---------- bucket privado dos modelos (só o servidor lê) ----------
insert into storage.buckets (id, name, public)
values ('modelos', 'modelos', false)
on conflict (id) do nothing;
update storage.buckets
   set file_size_limit = 4194304, -- 4 MB (modelo .docx + logos)
       allowed_mime_types = array[
         'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
         'image/png'
       ]
 where id = 'modelos';
-- Nenhuma policy em storage.objects para `modelos`: o cliente não baixa o modelo cru.

-- ---------- RLS ----------
-- Leitura por colabora_org (membro da org OU convidado aceito em alguma obra dela):
-- colaborador monta contrato e precisa do texto do catálogo no app (PRD §3).
-- Escrita só gestor da org. O .docx cru fica só no servidor (bucket sem policy).
alter table public.contrato_modelos enable row level security;
alter table public.modelo_blocos enable row level security;
alter table public.modelo_variantes enable row level security;
alter table public.modelo_parametros enable row level security;

drop policy if exists "contrato_modelos_select" on public.contrato_modelos;
create policy "contrato_modelos_select" on public.contrato_modelos for select using (public.colabora_org(org_id));
drop policy if exists "contrato_modelos_write" on public.contrato_modelos;
create policy "contrato_modelos_write" on public.contrato_modelos for all
  using (public.is_gestor(org_id)) with check (public.is_gestor(org_id));

drop policy if exists "modelo_blocos_select" on public.modelo_blocos;
create policy "modelo_blocos_select" on public.modelo_blocos for select using (public.colabora_org(org_id));
drop policy if exists "modelo_blocos_write" on public.modelo_blocos;
create policy "modelo_blocos_write" on public.modelo_blocos for all
  using (public.is_gestor(org_id)) with check (public.is_gestor(org_id));

drop policy if exists "modelo_variantes_select" on public.modelo_variantes;
create policy "modelo_variantes_select" on public.modelo_variantes for select using (public.colabora_org(org_id));
drop policy if exists "modelo_variantes_write" on public.modelo_variantes;
create policy "modelo_variantes_write" on public.modelo_variantes for all
  using (public.is_gestor(org_id)) with check (public.is_gestor(org_id));

drop policy if exists "modelo_parametros_select" on public.modelo_parametros;
create policy "modelo_parametros_select" on public.modelo_parametros for select using (public.colabora_org(org_id));
drop policy if exists "modelo_parametros_write" on public.modelo_parametros;
create policy "modelo_parametros_write" on public.modelo_parametros for all
  using (public.is_gestor(org_id)) with check (public.is_gestor(org_id));

-- Modelo ativo da org (para a UI saber se há minuta padrão disponível).
create or replace function public.modelo_contrato_ativo(p_org uuid)
returns table (id uuid, codigo text, versao text, blocos int, variantes int)
language sql stable security invoker set search_path = public as $$
  select m.id, m.codigo, m.versao,
         (select count(*)::int from public.modelo_blocos b where b.modelo_id = m.id and b.org_id = m.org_id),
         (select count(*)::int from public.modelo_variantes v where v.modelo_id = m.id and v.org_id = m.org_id)
    from public.contrato_modelos m
   where m.org_id = p_org and m.ativo
   limit 1;
$$;
revoke all on function public.modelo_contrato_ativo(uuid) from public, anon;
grant execute on function public.modelo_contrato_ativo(uuid) to authenticated;
