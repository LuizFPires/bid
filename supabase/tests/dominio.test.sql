-- Teste de política (pgTAP) do domínio. `supabase test db`.
begin;
select plan(14);

-- Tabelas.
select has_table('public', 'obras', 'obras existe');
select has_table('public', 'certames', 'certames existe');
select has_table('public', 'propostas', 'propostas existe');
select has_table('public', 'proposta_versoes', 'proposta_versoes existe');
select has_table('public', 'sugestoes', 'sugestoes existe');
select has_table('public', 'eventos', 'eventos existe');

-- Todas as tabelas de domínio têm org_id.
select ok(
  (select bool_and(c)
   from (
     select exists(select 1 from information_schema.columns
       where table_schema='public' and table_name=t and column_name='org_id') as c
     from unnest(array['obras','certames','propostas','proposta_versoes','sugestoes','eventos']) as t
   ) s),
  'toda tabela de domínio tem org_id'
);

-- RLS habilitado em todas.
select ok(
  (select bool_and(relrowsecurity)
   from pg_class
   where oid = any (array[
     'public.obras'::regclass, 'public.certames'::regclass, 'public.propostas'::regclass,
     'public.proposta_versoes'::regclass, 'public.sugestoes'::regclass, 'public.eventos'::regclass])),
  'RLS habilitado em todas as tabelas de domínio'
);

-- Select escopado por pertencimento.
select ok(
  (select qual from pg_policies where schemaname='public' and tablename='propostas' and policyname='propostas_select')
  like '%is_member%',
  'propostas_select usa is_member'
);

-- Exclusão é lógica: não existe policy de DELETE para usuários.
select is(
  (select count(*) from pg_policies
    where schemaname='public'
      and tablename in ('obras','certames','propostas','proposta_versoes','sugestoes','eventos')
      and cmd='DELETE'),
  0::bigint, 'nenhuma policy de DELETE (exclusão é lógica)'
);

-- eventos é append-only: sem policy de UPDATE.
select is(
  (select count(*) from pg_policies
    where schemaname='public' and tablename='eventos' and cmd='UPDATE'),
  0::bigint, 'eventos não tem UPDATE (append-only)'
);

-- Isolamento entre orgs: unique (id, org_id) nos pais (alvo das FKs compostas).
select ok(
  (select count(*) from pg_constraint
    where conrelid = 'public.certames'::regclass and contype = 'u'
      and conkey = (
        select array_agg(attnum order by attnum) from pg_attribute
        where attrelid = 'public.certames'::regclass and attname in ('id', 'org_id'))
  ) >= 1,
  'certames tem unique (id, org_id) para FK composta'
);

-- Triggers de integridade/segurança presentes.
select isnt((select count(*) from pg_trigger where tgname = 'trg_propostas_guard_del'),
  0::bigint, 'guard_soft_delete em propostas');
select isnt((select count(*) from pg_trigger where tgname = 'trg_eventos_autor'),
  0::bigint, 'force_evento_autor em eventos');

select * from finish();
rollback;
