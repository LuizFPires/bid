-- Teste (pgTAP) do acesso por obra: dono, convites e RLS. `supabase test db`.
begin;
select plan(16);

select has_table('public', 'obra_convites', 'tabela obra_convites existe');
select has_index('public', 'obra_convites', 'uq_obra_convite_vivo', 'um convite vivo por obra+e-mail');

-- Helpers e RPCs existem e são SECURITY DEFINER (leem auth.users / evitam recursão).
select has_function('public', 'pode_obra', ARRAY['uuid'], 'pode_obra existe');
select has_function('public', 'dono_obra', ARRAY['uuid'], 'dono_obra existe');
select has_function('public', 'convidar_para_obra', ARRAY['uuid', 'text'], 'convidar_para_obra existe');
select has_function('public', 'meus_convites', ARRAY[]::text[], 'meus_convites existe');
select has_function('public', 'responder_convite', ARRAY['uuid', 'boolean'], 'responder_convite existe');
select has_function('public', 'remover_acesso_obra', ARRAY['uuid'], 'remover_acesso_obra existe');
select is((select bool_and(prosecdef) from pg_proc
           where proname in ('pode_obra', 'dono_obra', 'convidar_para_obra', 'meus_convites',
                             'responder_convite', 'listar_acesso_obra', 'remover_acesso_obra')),
  true, 'helpers/RPCs de acesso são SECURITY DEFINER');

-- Fail-closed: anon não executa.
select function_privs_are('public', 'convidar_para_obra', ARRAY['uuid', 'text'],
  'anon', ARRAY[]::text[], 'anon não convida');
select function_privs_are('public', 'responder_convite', ARRAY['uuid', 'boolean'],
  'authenticated', ARRAY['EXECUTE'], 'authenticated responde convite');

-- RLS: obras/certames/propostas passaram a usar acesso por obra (não is_member).
select is((select count(*)::int from pg_policies
    where schemaname='public' and tablename='obras' and policyname='obras_select'
      and qual like '%pode_obra%'), 1, 'obras_select usa pode_obra');
select is((select count(*)::int from pg_policies
    where schemaname='public' and tablename='propostas' and policyname='propostas_select'
      and qual like '%pode_certame%'), 1, 'propostas_select usa pode_certame');

-- obra_convites: RLS ligada, sem escrita direta (só RPC).
select is((select relrowsecurity from pg_class where relname = 'obra_convites'), true,
  'obra_convites tem RLS');
select is((select count(*)::int from pg_policies
    where schemaname='public' and tablename='obra_convites' and cmd in ('INSERT','UPDATE','DELETE')),
  0, 'obra_convites sem policy de escrita direta');

-- Guard de obra agora exige o dono (texto da função).
select ok((select prosrc like '%apenas quem criou a obra%' from pg_proc where proname = 'guard_obra_soft_delete'),
  'guard_obra_soft_delete exige o criador');

select * from finish();
rollback;
