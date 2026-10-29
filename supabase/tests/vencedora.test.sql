-- Teste (pgTAP) dos RPCs de vencedora: estrutura + comportamento. `supabase test db`.
begin;
select plan(17);

-- ---------- Estrutura ----------
select has_function('public', 'definir_vencedora', ARRAY['uuid'], 'definir_vencedora existe');
select has_function('public', 'desfazer_vencedora', ARRAY['uuid', 'uuid', 'text', 'text'], 'desfazer_vencedora existe');
select is((select bool_or(prosecdef) from pg_proc where proname = 'definir_vencedora'), false, 'definir_vencedora é SECURITY INVOKER');
select is((select bool_or(prosecdef) from pg_proc where proname = 'desfazer_vencedora'), false, 'desfazer_vencedora é SECURITY INVOKER');
select function_privs_are('public', 'definir_vencedora', ARRAY['uuid'], 'anon', ARRAY[]::text[], 'anon não executa definir_vencedora');
select function_privs_are('public', 'desfazer_vencedora', ARRAY['uuid', 'uuid', 'text', 'text'], 'authenticated', ARRAY['EXECUTE'], 'authenticated executa desfazer_vencedora');

-- ---------- Comportamento (seed mínimo) ----------
insert into public.organizacoes (id, nome) values ('00000000-0000-4000-8000-0000000000a0', 'Org Teste');
insert into public.obras (id, org_id, nome) values ('00000000-0000-4000-8000-0000000000a1', '00000000-0000-4000-8000-0000000000a0', 'Obra');
insert into public.certames (id, org_id, obra_id, categoria, titulo, status)
  values ('00000000-0000-4000-8000-0000000000a2', '00000000-0000-4000-8000-0000000000a0', '00000000-0000-4000-8000-0000000000a1', 'Cat', 'T', 'analise');
insert into public.propostas (id, org_id, certame_id, fornecedor, status) values
  ('00000000-0000-4000-8000-0000000000b1', '00000000-0000-4000-8000-0000000000a0', '00000000-0000-4000-8000-0000000000a2', 'F1', 'analise'),
  ('00000000-0000-4000-8000-0000000000b2', '00000000-0000-4000-8000-0000000000a0', '00000000-0000-4000-8000-0000000000a2', 'F2', 'analise');

-- definir vencedora = p1
select definir_vencedora('00000000-0000-4000-8000-0000000000b1');
select is((select status from public.certames where id = '00000000-0000-4000-8000-0000000000a2'), 'adjudicada', 'certame adjudicado');
select is((select vencedora_proposta_id from public.certames where id = '00000000-0000-4000-8000-0000000000a2'), '00000000-0000-4000-8000-0000000000b1'::uuid, 'vencedora = p1');
select is((select status from public.propostas where id = '00000000-0000-4000-8000-0000000000b1'), 'vencedora', 'p1 vencedora');
select is((select count(*) from public.eventos where entidade_id = '00000000-0000-4000-8000-0000000000b1' and tipo = 'vencedora_definida'), 1::bigint, 'evento vencedora_definida');

-- trocar vencedora para p2: rebaixa p1, vencedora única
select definir_vencedora('00000000-0000-4000-8000-0000000000b2');
select is((select status from public.propostas where id = '00000000-0000-4000-8000-0000000000b1'), 'analise', 'p1 rebaixada');
select is((select status from public.propostas where id = '00000000-0000-4000-8000-0000000000b2'), 'vencedora', 'p2 vencedora');
select is((select count(*) from public.propostas where certame_id = '00000000-0000-4000-8000-0000000000a2' and status = 'vencedora'), 1::bigint, 'vencedora única no certame');
select is((select vencedora_proposta_id from public.certames where id = '00000000-0000-4000-8000-0000000000a2'), '00000000-0000-4000-8000-0000000000b2'::uuid, 'certame aponta p2');

-- desfazer p2
select desfazer_vencedora('00000000-0000-4000-8000-0000000000b2', '00000000-0000-4000-8000-0000000000a2', 'analise', 'analise');
select is((select status from public.certames where id = '00000000-0000-4000-8000-0000000000a2'), 'analise', 'certame reaberto');
select is((select vencedora_proposta_id from public.certames where id = '00000000-0000-4000-8000-0000000000a2'), null, 'vencedora limpa');
select is((select status from public.propostas where id = '00000000-0000-4000-8000-0000000000b2'), 'analise', 'p2 revertida');

select * from finish();
rollback;
