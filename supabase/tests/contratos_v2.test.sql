-- Teste (pgTAP) do contrato v2: estados, campos do servidor, soma da planilha,
-- trava de edição por status, aprovado → rascunho ao editar, criar_contrato_v2
-- idempotente, revisão/achados. Dados fictícios. `supabase test db`.
begin;
select plan(18);

select has_column('public', 'contratos', 'dossie', 'contratos.dossie existe');
select has_table('public', 'contrato_itens_clausula', 'itens de cláusula existem');
select has_table('public', 'contrato_planilha', 'planilha existe');
select has_table('public', 'contrato_revisoes', 'revisões existem');
select has_function('public', 'criar_contrato_v2', ARRAY['uuid'], 'criar_contrato_v2 existe');
select has_function('public', 'salvar_contrato', ARRAY['uuid', 'jsonb'], 'salvar_contrato existe');
select is((select count(*) from pg_policies where schemaname = 'public' and tablename = 'contrato_revisoes' and cmd <> 'SELECT'), 0::bigint, 'revisões sem policy de escrita pelo cliente');

-- fixtures
insert into auth.users (id, email) values ('00000000-0000-4000-8000-00000000c001', 'dono3@teste.local');
create temporary table fx3 as
  select (select org_id from public.membros where user_id = '00000000-0000-4000-8000-00000000c001') as org,
         '00000000-0000-4000-8000-00000000c101'::uuid as obra,
         '00000000-0000-4000-8000-00000000c102'::uuid as certame,
         '00000000-0000-4000-8000-00000000c103'::uuid as prop,
         '00000000-0000-4000-8000-00000000c104'::uuid as modelo;
insert into public.obras (id, org_id, nome, criado_por) select obra, org, 'Obra V2', '00000000-0000-4000-8000-00000000c001' from fx3;
insert into public.certames (id, org_id, obra_id, categoria, titulo, status) select certame, org, obra, 'Fundações', 'Fundações', 'adjudicada' from fx3;
insert into public.propostas (id, org_id, certame_id, fornecedor, status, valor_atual, prazo_atual) select prop, org, certame, 'Fundações Exemplo Ltda.', 'vencedora', 312450, 60 from fx3;
update public.certames set vencedora_proposta_id = (select prop from fx3) where id = (select certame from fx3);
insert into public.contrato_modelos (id, org_id, codigo, versao, docx_path, catalogo, ativo)
  select modelo, org, 'empreitada', '1.0', 'x.docx', '{"versao":"1.0","clausulas":[]}', true from fx3;

create or replace function pg_temp.como(p_user uuid) returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claims', json_build_object('sub', p_user, 'role', 'authenticated')::text, true);
  perform set_config('role', 'authenticated', true);
end;
$$;
create or replace function pg_temp.sair() returns void language plpgsql as $$
begin
  perform set_config('role', 'none', true);
  perform set_config('request.jwt.claims', '', true);
end;
$$;

-- criar v2 (idempotente)
select pg_temp.como('00000000-0000-4000-8000-00000000c001');
create temporary table fxc as select public.criar_contrato_v2((select prop from fx3)) as id;
select is(public.criar_contrato_v2((select prop from fx3)), (select id from fxc), 'criar_contrato_v2 é idempotente por proposta');
select is((select modelo_id from public.contratos where id = (select id from fxc)), (select modelo from fx3), 'contrato v2 aponta para o modelo ativo');

-- campos do servidor
select throws_ok($$ update public.contratos set numero = 'CT-2026-001' where id = (select id from fxc) $$, 'P0001', null, 'cliente não define número');
select throws_ok($$ update public.contratos set dossie = '{}'::jsonb where id = (select id from fxc) $$, 'P0001', null, 'cliente não grava dossiê');

-- planilha soma no valor (RC-03): 1.800 × 152,4725 = 274.450,50 + 18.000 + 19.999,50 = 312.450,00
select lives_ok($$ select public.salvar_contrato((select id from fxc), '{"planilha":[
  {"grupo":true,"descricao":"MOBILIZAÇÃO"},
  {"codigo":"1.1","descricao":"Mobilização","unidade":"vb","quantidade":1,"preco_unitario":18000},
  {"codigo":"2.1","descricao":"Estaca hélice contínua","unidade":"m","quantidade":1800,"preco_unitario":152.4725},
  {"codigo":"2.2","descricao":"Arrasamento","unidade":"un","quantidade":120,"preco_unitario":166.6625}]}'::jsonb) $$, 'salvar_contrato grava a planilha');
select is((select valor from public.contratos where id = (select id from fxc)), 312450.00, 'valor do contrato = soma da planilha');
select is((select total from public.contrato_planilha where contrato_id = (select id from fxc) and codigo = '2.1'), 274450.50, 'total da linha arredondado a 2 casas');
select pg_temp.sair();

-- trava por status e volta a rascunho ao editar aprovado
update public.contratos set status = 'em_validacao' where id = (select id from fxc);
select pg_temp.como('00000000-0000-4000-8000-00000000c001');
select throws_ok($$ select public.salvar_contrato((select id from fxc), '{"parametros":{"q_prazo":"60 dias corridos"}}'::jsonb) $$, 'P0001', null, 'em validação não se edita');
select pg_temp.sair();
update public.contratos set status = 'aprovado' where id = (select id from fxc);
select pg_temp.como('00000000-0000-4000-8000-00000000c001');
select lives_ok($$ select public.salvar_contrato((select id from fxc), '{"parametros":{"q_prazo":"60 dias corridos"}}'::jsonb) $$, 'aprovado aceita edição…');
select is((select status from public.contratos where id = (select id from fxc)), 'rascunho', '…mas volta a rascunho (RC-10)');
select pg_temp.sair();

-- revisão/achados: só servidor grava; resolver exige justificativa no aceite
insert into public.contrato_revisoes (id, org_id, contrato_id, conteudo_hash, modelo_ia, status)
  select '00000000-0000-4000-8000-00000000c201', org, (select id from fxc), 'h1', 'claude', 'concluida' from fx3;
insert into public.contrato_achados (id, org_id, revisao_id, tipo, severidade, numero, titulo, explicacao)
  select '00000000-0000-4000-8000-00000000c202', org, '00000000-0000-4000-8000-00000000c201', 'conflito', 'alta', 'quadro.q_prazo', 'Prazo', 'quadro 60 × proposta 90' from fx3;
select pg_temp.como('00000000-0000-4000-8000-00000000c001');
select throws_ok($$ select public.resolver_achado('00000000-0000-4000-8000-00000000c202', 'aceito', 'ok') $$, 'P0001', 'Aceitar um achado exige justificativa (mínimo 10 caracteres).', 'aceite sem justificativa falha');
select lives_ok($$ select public.resolver_achado('00000000-0000-4000-8000-00000000c202', 'aceito', 'prazo renegociado com o fornecedor') $$, 'aceite com justificativa');
select throws_ok($$ insert into public.contrato_revisoes (org_id, contrato_id, conteudo_hash, modelo_ia, status) select org, (select id from fxc), 'h2', 'x', 'concluida' from fx3 $$, '42501', null, 'cliente não insere revisão');
select pg_temp.sair();

select * from finish();
rollback;
