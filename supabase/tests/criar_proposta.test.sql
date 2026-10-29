-- Teste (pgTAP) do RPC de criação de proposta e do índice de unicidade. `supabase test db`.
begin;
select plan(5);

-- Função existe.
select has_function(
  'public', 'criar_proposta',
  ARRAY['uuid', 'text', 'text', 'numeric', 'integer', 'text', 'text', 'text', 'text', 'jsonb'],
  'função criar_proposta existe'
);

-- Security INVOKER (não DEFINER): a RLS do usuário continua valendo.
select is(
  (select bool_or(prosecdef) from pg_proc where proname = 'criar_proposta'),
  false, 'criar_proposta é SECURITY INVOKER'
);

-- Fail-closed: authenticated executa; anon não.
select function_privs_are(
  'public', 'criar_proposta',
  ARRAY['uuid', 'text', 'text', 'numeric', 'integer', 'text', 'text', 'text', 'text', 'jsonb'],
  'authenticated', ARRAY['EXECUTE'],
  'authenticated pode executar criar_proposta'
);
select function_privs_are(
  'public', 'criar_proposta',
  ARRAY['uuid', 'text', 'text', 'numeric', 'integer', 'text', 'text', 'text', 'text', 'jsonb'],
  'anon', ARRAY[]::text[],
  'anon não pode executar criar_proposta'
);

-- Índice único parcial impede dois certames ativos para a mesma obra+categoria.
select has_index(
  'public', 'certames', 'uq_certame_ativo_obra_categoria',
  'certames tem índice único parcial de certame ativo por obra+categoria'
);

select * from finish();
rollback;
