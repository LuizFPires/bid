-- Teste (pgTAP) do fluxo de validação do contrato v2 (M12): enviar exige hash
-- atual + revisão concluída + sem achado alto aberto + sem marcador vazio;
-- colaborador não aprova nem devolve (RPC); gestor aprova (hash igual) e devolve
-- com comentário; editar aprovado volta a rascunho e supera a aprovação (RC-10);
-- autoaprovação registrada (Q2). Dados fictícios. `supabase test db`.
begin;
select plan(29);

select has_table('public', 'contrato_aprovacoes', 'aprovações existem');
select has_function('public', 'enviar_validacao', ARRAY['uuid', 'text'], 'enviar_validacao existe');
select has_function('public', 'devolver_contrato', ARRAY['uuid', 'text'], 'devolver_contrato existe');
select has_function('public', 'aprovar_contrato', ARRAY['uuid', 'text'], 'aprovar_contrato existe');
select is((select count(*) from pg_policies where schemaname = 'public' and tablename = 'contrato_aprovacoes' and cmd <> 'SELECT'), 0::bigint, 'aprovações sem policy de escrita pelo cliente');

-- fixtures: dono (f001), gestor (f002), colaborador (f003)
insert into auth.users (id, email) values
  ('00000000-0000-4000-8000-00000000f001', 'dono5@teste.local'),
  ('00000000-0000-4000-8000-00000000f002', 'gestor5@teste.local'),
  ('00000000-0000-4000-8000-00000000f003', 'colab5@teste.local');
create temporary table fx5 as
  select (select org_id from public.membros where user_id = '00000000-0000-4000-8000-00000000f001') as org,
         '00000000-0000-4000-8000-00000000f101'::uuid as obra,
         '00000000-0000-4000-8000-00000000f102'::uuid as certame,
         '00000000-0000-4000-8000-00000000f103'::uuid as prop,
         '00000000-0000-4000-8000-00000000f104'::uuid as modelo,
         '00000000-0000-4000-8000-00000000f111'::uuid as cv_gestor,
         '00000000-0000-4000-8000-00000000f112'::uuid as cv_colab;
insert into public.obras (id, org_id, nome, criado_por) select obra, org, 'Obra Fluxo', '00000000-0000-4000-8000-00000000f001' from fx5;
insert into public.certames (id, org_id, obra_id, categoria, titulo, status) select certame, org, obra, 'Fundações', 'Fundações', 'adjudicada' from fx5;
insert into public.propostas (id, org_id, certame_id, fornecedor, status, valor_atual, prazo_atual) select prop, org, certame, 'Fundações Exemplo Ltda.', 'vencedora', 312450, 60 from fx5;
update public.certames set vencedora_proposta_id = (select prop from fx5) where id = (select certame from fx5);
insert into public.contrato_modelos (id, org_id, codigo, versao, docx_path, catalogo, ativo)
  select modelo, org, 'empreitada', '1.0', 'x.docx', '{"versao":"1.0","clausulas":[{"itens":[{"numero":"3.1","texto":"Padrão 3.1."}]}],"anexo_ii":[]}', true from fx5;
insert into public.obra_convites (id, org_id, obra_id, email, user_id, convidado_por, status, papel, respondido_em)
  select cv_gestor, org, obra, 'gestor5@teste.local', '00000000-0000-4000-8000-00000000f002', '00000000-0000-4000-8000-00000000f001', 'aceito', 'gestor', now() from fx5
  union all
  select cv_colab, org, obra, 'colab5@teste.local', '00000000-0000-4000-8000-00000000f003', '00000000-0000-4000-8000-00000000f001', 'aceito', 'colaborador', now() from fx5;

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

-- colaborador cria o contrato v2 (monta e envia; não aprova)
select pg_temp.como('00000000-0000-4000-8000-00000000f003');
create temporary table fxk as select public.criar_contrato_v2((select prop from fx5)) as id;
select is((select status from public.contratos where id = (select id from fxk)), 'rascunho', 'contrato nasce em rascunho');

-- enviar sem hash do servidor
select throws_ok($$ select public.enviar_validacao((select id from fxk), 'h1') $$, 'P0001', 'O conteúdo mudou: gere a minuta de novo antes de enviar.', 'sem hash do servidor não envia');
select pg_temp.sair();

-- servidor grava hash; sem `faltando` conferido, falha fechado
update public.contratos set conteudo_hash = 'h1', faltando = null where id = (select id from fxk);
select pg_temp.como('00000000-0000-4000-8000-00000000f003');
select throws_like($$ select public.enviar_validacao((select id from fxk), 'h1') $$, '%Gere a minuta antes de enviar%', 'sem pendências conferidas pelo servidor não envia');
select throws_ok($$ update public.contratos set faltando = '[]'::jsonb where id = (select id from fxk) $$, 'P0001', null, 'cliente não grava faltando');
select lives_ok($$ select public.salvar_contrato((select id from fxk), '{"parametros":{"_faltando":[]}}'::jsonb) $$, 'cliente pode gravar parâmetros…');
select pg_temp.sair();
select is((select conteudo_versao from public.contratos where id = (select id from fxk)), 1, '…e editar conteúdo sobe a versão e zera hash');
update public.contratos set conteudo_hash = 'h1', faltando = '["q_seguros"]'::jsonb where id = (select id from fxk);
select pg_temp.como('00000000-0000-4000-8000-00000000f003');
select throws_like($$ select public.enviar_validacao((select id from fxk), 'h1') $$, '%marcador(es) vazio(s)%', 'marcador vazio bloqueia o envio (RC-09)');
select pg_temp.sair();
update public.contratos set faltando = '[]'::jsonb where id = (select id from fxk);

-- sem revisão concluída para o hash
select pg_temp.como('00000000-0000-4000-8000-00000000f003');
select throws_like($$ select public.enviar_validacao((select id from fxk), 'h1') $$, '%revisão por IA%', 'sem revisão da versão não envia (RC-07)');
select pg_temp.sair();

-- revisão concluída com achado alto aberto
insert into public.contrato_revisoes (id, org_id, contrato_id, conteudo_hash, modelo_ia, status)
  select '00000000-0000-4000-8000-00000000f201', org, (select id from fxk), 'h1', 'claude', 'concluida' from fx5;
insert into public.contrato_achados (id, org_id, revisao_id, tipo, severidade, numero, titulo, explicacao)
  select '00000000-0000-4000-8000-00000000f202', org, '00000000-0000-4000-8000-00000000f201', 'conflito', 'alta', 'quadro.q_prazo', 'Prazo', 'quadro × proposta' from fx5;
select pg_temp.como('00000000-0000-4000-8000-00000000f003');
select throws_like($$ select public.enviar_validacao((select id from fxk), 'h1') $$, '%severidade alta sem resolução%', 'achado alto aberto bloqueia (RC-08)');
select lives_ok($$ select public.resolver_achado('00000000-0000-4000-8000-00000000f202', 'aceito', 'prazo renegociado com o fornecedor') $$, 'colaborador aceita o achado com justificativa');
select lives_ok($$ select public.enviar_validacao((select id from fxk), 'h1') $$, 'colaborador envia para validação');
select is((select status from public.contratos where id = (select id from fxk)), 'em_validacao', 'status em_validacao');
select is((select count(*) from public.contrato_aprovacoes where contrato_id = (select id from fxk) and acao = 'enviado' and situacao = 'vigente'), 1::bigint, 'registro de envio vigente');

-- colaborador não aprova nem devolve
select throws_ok($$ select public.aprovar_contrato((select id from fxk), 'h1') $$, 'P0001', 'Só o dono ou um gestor da obra pode aprovar o contrato.', 'colaborador não aprova');
select throws_ok($$ select public.devolver_contrato((select id from fxk), 'faltou seguro') $$, 'P0001', 'Só o dono ou um gestor da obra pode devolver o contrato.', 'colaborador não devolve');
select throws_ok($$ select public.salvar_contrato((select id from fxk), '{"parametros":{"q_prazo":"90 dias"}}'::jsonb) $$, 'P0001', null, 'em validação não se edita');
select pg_temp.sair();

-- gestor: hash errado não aprova; devolver exige comentário; devolve
select pg_temp.como('00000000-0000-4000-8000-00000000f002');
select throws_like($$ select public.aprovar_contrato((select id from fxk), 'h-outro') $$, '%conteúdo mudou%', 'hash divergente não aprova');
select throws_ok($$ select public.devolver_contrato((select id from fxk), ' ') $$, 'P0001', 'Devolver exige um comentário.', 'devolver sem comentário falha');
select lives_ok($$ select public.devolver_contrato((select id from fxk), 'Incluir o seguro RC no item 15.') $$, 'gestor devolve com comentário');
select is((select status from public.contratos where id = (select id from fxk)), 'devolvido', 'status devolvido');
select is((select comentario from public.aprovacao_vigente((select id from fxk))), 'Incluir o seguro RC no item 15.', 'aprovação vigente é a devolução com o comentário');
select pg_temp.sair();

-- reenvio pelo gestor e autoaprovação (Q2: permitida, registrada)
select pg_temp.como('00000000-0000-4000-8000-00000000f002');
select lives_ok($$ select public.enviar_validacao((select id from fxk), 'h1') $$, 'gestor reenvia (devolvido → em_validacao)');
select lives_ok($$ select public.aprovar_contrato((select id from fxk), 'h1') $$, 'gestor aprova com o hash atual');
select is((select status from public.contratos where id = (select id from fxk)), 'aprovado', 'status aprovado');
select is((select autoaprovacao from public.aprovacao_vigente((select id from fxk))), true, 'quem enviou e aprovou: autoaprovação registrada');

-- editar depois de aprovado: volta a rascunho e a aprovação fica superada (RC-10)
select lives_ok($$ select public.salvar_contrato((select id from fxk), '{"parametros":{"q_retencao":"5% de cada medição."}}'::jsonb) $$, 'aprovado aceita edição');
select is((select status from public.contratos where id = (select id from fxk)), 'rascunho', 'volta a rascunho');
select is((select count(*) from public.contrato_aprovacoes where contrato_id = (select id from fxk) and acao = 'aprovado' and situacao = 'vigente'), 0::bigint, 'aprovação superada');
select pg_temp.sair();

select * from finish();
rollback;
