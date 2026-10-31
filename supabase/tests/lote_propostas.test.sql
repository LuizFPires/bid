-- Teste (pgTAP) da RPC de lote: estrutura + atomicidade. `supabase test db`.
begin;
select plan(8);

select has_function('public', 'criar_propostas_lote', ARRAY['uuid', 'text', 'jsonb'], 'criar_propostas_lote existe');
select is((select bool_or(prosecdef) from pg_proc where proname = 'criar_propostas_lote'), false, 'criar_propostas_lote é SECURITY INVOKER');
select function_privs_are('public', 'criar_propostas_lote', ARRAY['uuid', 'text', 'jsonb'], 'anon', ARRAY[]::text[], 'anon não executa');
select function_privs_are('public', 'criar_propostas_lote', ARRAY['uuid', 'text', 'jsonb'], 'authenticated', ARRAY['EXECUTE'], 'authenticated executa');

insert into public.organizacoes (id, nome) values ('00000000-0000-4000-8000-0000000000c0', 'Org Lote');
insert into public.obras (id, org_id, nome) values ('00000000-0000-4000-8000-0000000000c1', '00000000-0000-4000-8000-0000000000c0', 'Obra Lote');

-- 2 propostas novas de uma vez, no mesmo certame
select is(
  array_length(public.criar_propostas_lote(
    '00000000-0000-4000-8000-0000000000c1', 'Estrutura Metálica',
    '[{"fornecedor":"Construferro","valor":241657.22,"prazo":60,"dados":{}},
      {"fornecedor":"Ágape","valor":233010.12,"prazo":73,"opcao":null,"dados":{}}]'::jsonb), 1),
  2, 'devolve 2 ids');
select is((select count(*) from public.propostas p join public.certames c on c.id = p.certame_id where c.obra_id = '00000000-0000-4000-8000-0000000000c1' and c.categoria = 'Estrutura Metálica'), 2::bigint, '2 propostas no mesmo certame');
select is((select count(*) from public.eventos where entidade = 'obra' and entidade_id = '00000000-0000-4000-8000-0000000000c1' and tipo = 'lote_propostas'), 1::bigint, 'evento do lote');

-- atomicidade: o 2º item é inválido (sem fornecedor) → nada do lote entra
select throws_ok(
  $$ select public.criar_propostas_lote('00000000-0000-4000-8000-0000000000c1', 'Pintura',
       '[{"fornecedor":"Tintas X","valor":1000,"dados":{}},{"fornecedor":"","valor":2000,"dados":{}}]'::jsonb) $$,
  'P0001', 'fornecedor é obrigatório', 'lote com item inválido falha inteiro');

select * from finish();
rollback;
