-- Teste (pgTAP) da emissão e assinatura v2 (M13): emitir só pelo servidor e só
-- aprovado com hash vigente; numeração CT-AAAA-NNN sequencial por org/ano;
-- links por signatário (gestor), colaborador não; cancelar com motivo;
-- emitido não se apaga. Dados fictícios. `supabase test db`.
begin;
select plan(30);

select has_function('public', 'emitir_contrato', ARRAY['uuid', 'text', 'text', 'text', 'text', 'integer', 'uuid'], 'emitir_contrato existe');
select has_function('public', 'gerar_links_assinatura', ARRAY['uuid', 'uuid'], 'gerar_links_assinatura existe');
select has_function('public', 'cancelar_contrato', ARRAY['uuid', 'text'], 'cancelar_contrato existe');
select has_column('public', 'assinaturas', 'signatario_id', 'assinaturas.signatario_id existe');

insert into auth.users (id, email) values
  ('00000000-0000-4000-8000-00000000a001', 'dono6@teste.local'),
  ('00000000-0000-4000-8000-00000000a002', 'gestor6@teste.local'),
  ('00000000-0000-4000-8000-00000000a003', 'colab6@teste.local');
create temporary table fx6 as
  select (select org_id from public.membros where user_id = '00000000-0000-4000-8000-00000000a001') as org,
         '00000000-0000-4000-8000-00000000a101'::uuid as obra,
         '00000000-0000-4000-8000-00000000a102'::uuid as certame,
         '00000000-0000-4000-8000-00000000a103'::uuid as prop,
         '00000000-0000-4000-8000-00000000a113'::uuid as prop2,
         '00000000-0000-4000-8000-00000000a104'::uuid as modelo;
insert into public.obras (id, org_id, nome, criado_por) select obra, org, 'Obra Emissão', '00000000-0000-4000-8000-00000000a001' from fx6;
insert into public.certames (id, org_id, obra_id, categoria, titulo, status) select certame, org, obra, 'Fundações', 'Fundações', 'adjudicada' from fx6;
insert into public.propostas (id, org_id, certame_id, fornecedor, status, valor_atual, prazo_atual) select prop, org, certame, 'Fundações Exemplo Ltda.', 'vencedora', 312450, 60 from fx6;
update public.certames set vencedora_proposta_id = (select prop from fx6) where id = (select certame from fx6);
insert into public.contrato_modelos (id, org_id, codigo, versao, docx_path, catalogo, ativo)
  select modelo, org, 'empreitada', '1.0', 'x.docx', '{"versao":"1.0","clausulas":[],"anexo_ii":[]}', true from fx6;
insert into public.obra_convites (id, org_id, obra_id, email, user_id, convidado_por, status, papel, respondido_em)
  select '00000000-0000-4000-8000-00000000a111', org, obra, 'gestor6@teste.local', '00000000-0000-4000-8000-00000000a002', '00000000-0000-4000-8000-00000000a001', 'aceito', 'gestor', now() from fx6
  union all
  select '00000000-0000-4000-8000-00000000a112', org, obra, 'colab6@teste.local', '00000000-0000-4000-8000-00000000a003', '00000000-0000-4000-8000-00000000a001', 'aceito', 'colaborador', now() from fx6;

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

select pg_temp.como('00000000-0000-4000-8000-00000000a001');
create temporary table fxk as select public.criar_contrato_v2((select prop from fx6)) as id;
select lives_ok($$ select public.salvar_contrato((select id from fxk), '{"signatarios":[
  {"parte":"contratante","nome":"Sicrano Alves","cargo":"Administrador"},
  {"parte":"contratada","nome":"Beltrano Exemplo","cargo":"Sócio"},
  {"parte":"construtora","nome":"Diretor Um","cargo":"Diretor"},
  {"parte":"construtora","nome":"Diretor Dois","cargo":"Diretor"}]}'::jsonb) $$, 'signatários das três partes');
select pg_temp.sair();

-- emitir: só servidor; só aprovado com aprovação vigente do hash atual
select pg_temp.como('00000000-0000-4000-8000-00000000a001');
select throws_like($$ select public.emitir_contrato((select id from fxk), 'x', 'h', 'y', 'h', 1, null) $$, '%só do servidor%', 'cliente não emite');
select pg_temp.sair();
select throws_like($$ select public.emitir_contrato((select id from fxk), (select org from fx6) || '/a.docx', 'dh', (select org from fx6) || '/a.pdf', 'ph', 18, '00000000-0000-4000-8000-00000000a002') $$, '%só contrato aprovado%', 'não aprovado não emite');
update public.contratos set status = 'aprovado', conteudo_hash = 'h1' where id = (select id from fxk);
select throws_like($$ select public.emitir_contrato((select id from fxk), (select org from fx6) || '/a.docx', 'dh', (select org from fx6) || '/a.pdf', 'ph', 18, '00000000-0000-4000-8000-00000000a002') $$, '%aprovação vigente%', 'sem aprovação vigente do hash não emite');
insert into public.contrato_aprovacoes (org_id, contrato_id, acao, conteudo_hash, autor) select org, (select id from fxk), 'aprovado', 'h1', '00000000-0000-4000-8000-00000000a002' from fx6;
select throws_like($$ select public.emitir_contrato((select id from fxk), 'outra-org/a.docx', 'dh', (select org from fx6) || '/a.pdf', 'ph', 18, '00000000-0000-4000-8000-00000000a002') $$, '%fora da organização%', 'caminho fora da org é recusado');
select is(public.emitir_contrato((select id from fxk), (select org from fx6) || '/a.docx', 'dh', (select org from fx6) || '/a.pdf', 'ph', 18, '00000000-0000-4000-8000-00000000a002'),
          'CT-' || extract(year from now())::int || '-001', 'primeira emissão do ano = 001');
select is((select status from public.contratos where id = (select id from fxk)), 'emitido', 'status emitido');
select is((select pdf_hash from public.contratos where id = (select id from fxk)), 'ph', 'pdf_hash gravado');

-- segunda emissão (outro contrato da mesma org/ano) = 002
insert into public.propostas (id, org_id, certame_id, fornecedor, status, valor_atual) select prop2, org, certame, 'Outro Ltda.', 'vencedora', 1000 from fx6;
update public.certames set vencedora_proposta_id = (select prop2 from fx6) where id = (select certame from fx6);
select pg_temp.como('00000000-0000-4000-8000-00000000a001');
create temporary table fxk2 as select public.criar_contrato_v2((select prop2 from fx6)) as id;
select pg_temp.sair();
update public.contratos set status = 'aprovado', conteudo_hash = 'h2' where id = (select id from fxk2);
insert into public.contrato_aprovacoes (org_id, contrato_id, acao, conteudo_hash, autor) select org, (select id from fxk2), 'aprovado', 'h2', '00000000-0000-4000-8000-00000000a002' from fx6;
select is(public.emitir_contrato((select id from fxk2), (select org from fx6) || '/b.docx', 'dh', (select org from fx6) || '/b.pdf', 'ph2', 10, '00000000-0000-4000-8000-00000000a002'),
          'CT-' || extract(year from now())::int || '-002', 'segunda emissão = 002 (sequencial por org/ano)');
select throws_ok($$ select public.emitir_contrato((select id from fxk2), (select org from fx6) || '/b.docx', 'dh', (select org from fx6) || '/b.pdf', 'ph2', 10, '00000000-0000-4000-8000-00000000a002') $$, 'P0001', null, 'não emite duas vezes');

-- links por signatário: colaborador não; gestor gera 4 e o contrato fica enviado
select pg_temp.como('00000000-0000-4000-8000-00000000a003');
select throws_ok($$ select * from public.gerar_links_assinatura((select id from fxk)) $$, 'P0001', 'Só o dono ou um gestor da obra pode enviar para assinatura.', 'colaborador não gera links');
select throws_ok($$ select public.cancelar_contrato((select id from fxk), 'motivo qualquer') $$, 'P0001', 'Só o dono ou um gestor da obra pode cancelar o contrato.', 'colaborador não cancela');
select pg_temp.sair();
select pg_temp.como('00000000-0000-4000-8000-00000000a002');
select is((select count(*) from public.gerar_links_assinatura((select id from fxk))), 4::bigint, 'um link por signatário pendente');
select is((select status from public.contratos where id = (select id from fxk)), 'enviado', 'primeiro link leva a enviado');
select is((select count(*) from public.assinaturas where contrato_id = (select id from fxk) and token_hash is not null), 4::bigint, 'tokens guardados só como hash');
select pg_temp.sair();

-- trilha por RPC (servidor): cadeia de hashes a partir do pdf_hash; signatário só assina uma vez; todos obrigatórios → assinado
create temporary table fxs as select id, parte from public.contrato_signatarios where contrato_id = (select id from fxk) order by ordem;
select throws_like($$ select public.registrar_assinatura_v2((select id from fxk), (select id from fxs where parte = 'contratante'), 'hash-errado', 'd1', (select org from fx6) || '/' || (select id from fxk) || '/assinado-1.pdf', 'img', 'app', null, null, null) $$, '%alterado%', 'hash anterior diferente do pdf_hash da emissão é recusado');
select is(public.registrar_assinatura_v2((select id from fxk), (select id from fxs where parte = 'contratante'), 'ph', 'd1', (select org from fx6) || '/' || (select id from fxk) || '/assinado-1.pdf', 'img', 'app', '00000000-0000-4000-8000-00000000a002', '127.0.0.1', 'ua'), false, 'primeira assinatura: ainda faltam obrigatórios');
select is((select pdf_path from public.contratos where id = (select id from fxk)), (select org from fx6) || '/' || (select id from fxk) || '/assinado-1.pdf', 'ponteiro do PDF avança');
select throws_like($$ select public.registrar_assinatura_v2((select id from fxk), (select id from fxs where parte = 'contratante'), 'd1', 'd2', (select org from fx6) || '/' || (select id from fxk) || '/assinado-2.pdf', 'img', 'app', null, null, null) $$, '%já assinou%', 'signatário não assina duas vezes');
select throws_like($$ select public.registrar_assinatura_v2((select id from fxk), (select id from fxs where parte = 'contratada'), 'ph', 'd2', (select org from fx6) || '/' || (select id from fxk) || '/assinado-2.pdf', 'img', 'link', null, null, null) $$, '%alterado%', 'cadeia: hash da emissão já não vale depois da 1ª assinatura');
select is(public.registrar_assinatura_v2((select id from fxk), (select id from fxs where parte = 'contratada'), 'd1', 'd2', (select org from fx6) || '/' || (select id from fxk) || '/assinado-2.pdf', 'img', 'link', null, null, null), false, 'segunda assinatura entra na cadeia');
select pg_temp.como('00000000-0000-4000-8000-00000000a002');
select throws_ok($$ select public.apagar_contrato((select id from fxk)) $$, 'P0001', null, 'enviado não se apaga pela RPC');
select throws_ok($$ update public.contratos set deleted_at = now() where id = (select id from fxk) $$, 'P0001', null, 'enviado não se apaga por update direto');
select throws_ok($$ select public.cancelar_contrato((select id from fxk), 'x') $$, 'P0001', 'Cancelar exige um motivo.', 'cancelar sem motivo falha');
select lives_ok($$ select public.cancelar_contrato((select id from fxk), 'Fornecedor desistiu da obra.') $$, 'gestor cancela com motivo');
select is((select status || '|' || cancelado_motivo from public.contratos where id = (select id from fxk)), 'cancelado|Fornecedor desistiu da obra.', 'cancelado com motivo; tokens invalidados');
select pg_temp.sair();

select * from finish();
rollback;
