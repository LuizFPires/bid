-- Teste (pgTAP) dos papéis por obra: matriz dono / gestor / colaborador / estranho
-- (PRD-contratos §3). Simula usuários autenticados via request.jwt.claims +
-- role authenticated (RLS e guards valem de verdade). `supabase test db`.
begin;
select plan(33);

-- ---------- estrutura ----------
select has_column('public', 'obra_convites', 'papel', 'obra_convites.papel existe');
select has_function('public', 'papel_obra', ARRAY['uuid'], 'papel_obra existe');
select has_function('public', 'gerencia_obra', ARRAY['uuid'], 'gerencia_obra existe');
select has_function('public', 'mudar_papel_obra', ARRAY['uuid', 'text'], 'mudar_papel_obra existe');
select has_function('public', 'convidar_para_obra', ARRAY['uuid', 'text', 'text'], 'convidar_para_obra(obra, email, papel) existe');
select hasnt_function('public', 'convidar_para_obra', ARRAY['uuid', 'text'], 'assinatura antiga removida (sem sobrecarga ambígua)');
select function_privs_are('public', 'mudar_papel_obra', ARRAY['uuid', 'text'], 'anon', ARRAY[]::text[], 'anon não executa mudar_papel_obra');

-- ---------- fixtures (dados fictícios) ----------
-- usuários: o trigger on_auth_user_created cria a org e o vínculo de cada um
insert into auth.users (id, email) values
  ('00000000-0000-4000-8000-00000000d001', 'dono@teste.local'),
  ('00000000-0000-4000-8000-00000000d002', 'gestor@teste.local'),
  ('00000000-0000-4000-8000-00000000d003', 'colab@teste.local'),
  ('00000000-0000-4000-8000-00000000d004', 'estranho@teste.local');

create temporary table fx as
  select (select org_id from public.membros where user_id = '00000000-0000-4000-8000-00000000d001') as org,
         '00000000-0000-4000-8000-00000000e011'::uuid as cv_gestor,
         '00000000-0000-4000-8000-00000000e012'::uuid as cv_colab,
         '00000000-0000-4000-8000-00000000e001'::uuid as obra,
         '00000000-0000-4000-8000-00000000e002'::uuid as certame,
         '00000000-0000-4000-8000-00000000e003'::uuid as p1,
         '00000000-0000-4000-8000-00000000e004'::uuid as p2,
         '00000000-0000-4000-8000-00000000e005'::uuid as eq,
         '00000000-0000-4000-8000-00000000e006'::uuid as contrato;

insert into public.obras (id, org_id, nome, criado_por)
  select obra, org, 'Obra Papéis', '00000000-0000-4000-8000-00000000d001' from fx;
insert into public.certames (id, org_id, obra_id, categoria, titulo, status)
  select certame, org, obra, 'Pintura', 'Pintura', 'analise' from fx;
insert into public.propostas (id, org_id, certame_id, fornecedor, status)
  select p1, org, certame, 'Tintas A', 'analise' from fx
  union all
  select p2, org, certame, 'Tintas B', 'analise' from fx;
insert into public.equalizacoes (id, org_id, escopo, categoria, certame_id, proposta_ids, criado_por)
  select eq, org, 'obra', 'Pintura', certame, array[p1, p2], '00000000-0000-4000-8000-00000000d001' from fx;
insert into public.contratos (id, org_id, certame_id, proposta_id, obra_id, categoria, status)
  select contrato, org, certame, p1, obra, 'Pintura', 'rascunho' from fx;
insert into public.obra_convites (id, org_id, obra_id, email, user_id, convidado_por, status, papel, respondido_em)
  select cv_gestor, org, obra, 'gestor@teste.local', '00000000-0000-4000-8000-00000000d002', '00000000-0000-4000-8000-00000000d001', 'aceito', 'gestor', now() from fx
  union all
  select cv_colab, org, obra, 'colab@teste.local', '00000000-0000-4000-8000-00000000d003', '00000000-0000-4000-8000-00000000d001', 'aceito', 'colaborador', now() from fx;

-- helpers: "entrar" como um usuário (JWT simulado + role authenticated) e "sair"
-- (volta ao superusuário E limpa as claims, senão auth.uid() continua setado).
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

-- ---------- papel_obra ----------
select pg_temp.como('00000000-0000-4000-8000-00000000d001');
select is(public.papel_obra((select obra from fx)), 'dono', 'dono vê papel dono');
select pg_temp.sair();
select pg_temp.como('00000000-0000-4000-8000-00000000d002');
select is(public.papel_obra((select obra from fx)), 'gestor', 'gestor vê papel gestor');
select pg_temp.sair();
select pg_temp.como('00000000-0000-4000-8000-00000000d003');
select is(public.papel_obra((select obra from fx)), 'colaborador', 'colaborador vê papel colaborador');
select is(public.gerencia_obra((select obra from fx)), false, 'colaborador não gerencia');
select pg_temp.sair();
select pg_temp.como('00000000-0000-4000-8000-00000000d004');
select is(public.papel_obra((select obra from fx)), null, 'estranho não tem papel');
select is((select count(*) from public.obras where id = (select obra from fx)), 0::bigint, 'estranho não vê a obra (RLS)');
select pg_temp.sair();

-- ---------- colaborador: vê, mas não apaga nem gerencia ----------
select pg_temp.como('00000000-0000-4000-8000-00000000d003');
select is((select count(*) from public.propostas where certame_id = (select certame from fx)), 2::bigint, 'colaborador vê as propostas');
select throws_ok($$ select public.apagar_proposta((select p2 from fx)) $$, 'P0001', 'Só o dono ou um gestor da obra pode excluir a proposta.', 'colaborador não apaga proposta');
select throws_ok($$ select public.apagar_equalizacao((select eq from fx)) $$, 'P0001', 'Só o dono ou um gestor da obra pode excluir a equalização.', 'colaborador não apaga equalização');
select throws_ok($$ select public.apagar_contrato((select contrato from fx)) $$, 'P0001', 'Só o dono ou um gestor da obra pode excluir o contrato.', 'colaborador não apaga contrato');
select throws_ok($$ select public.convidar_para_obra((select obra from fx), 'novo@teste.local', 'colaborador') $$, 'P0001', 'Só o dono ou um gestor da obra pode convidar.', 'colaborador não convida');
select throws_ok($$ select public.mudar_papel_obra((select cv_gestor from fx), 'colaborador') $$, 'P0001', 'Só o dono ou um gestor da obra pode mudar papéis.', 'colaborador não muda papel');
select throws_ok($$ select public.remover_acesso_obra((select cv_gestor from fx)) $$, 'P0001', 'Só o dono ou um gestor da obra pode remover acessos.', 'colaborador não remove acesso');
select throws_ok($$ select public.apagar_obra((select obra from fx)) $$, 'P0001', 'Só quem criou a obra pode apagá-la.', 'colaborador não apaga a obra');
select pg_temp.sair();

-- ---------- gestor: gerencia tudo, menos a obra ----------
select pg_temp.como('00000000-0000-4000-8000-00000000d002');
select lives_ok($$ select public.convidar_para_obra((select obra from fx), 'outro.gestor@teste.local', 'gestor') $$, 'gestor convida (inclusive outro gestor)');
select is((select papel from public.listar_acesso_obra((select obra from fx)) where email = 'outro.gestor@teste.local'), 'gestor', 'convite guarda o papel');
select lives_ok($$ select public.mudar_papel_obra((select cv_colab from fx), 'gestor') $$, 'gestor promove colaborador');
select throws_ok($$ select public.mudar_papel_obra((select cv_gestor from fx), 'colaborador') $$, 'P0001', 'Você não pode mudar o próprio papel.', 'ninguém muda o próprio papel');
select lives_ok($$ select public.apagar_proposta((select p2 from fx)) $$, 'gestor apaga proposta');
select lives_ok($$ select public.apagar_equalizacao((select eq from fx)) $$, 'gestor apaga equalização');
select throws_ok($$ select public.apagar_obra((select obra from fx)) $$, 'P0001', 'Só quem criou a obra pode apagá-la.', 'gestor não apaga a obra (Q1)');
select lives_ok($$ select public.remover_acesso_obra((select convite_id from public.listar_acesso_obra((select obra from fx)) where email = 'outro.gestor@teste.local')) $$, 'gestor remove acesso');
select pg_temp.sair();

-- ---------- contrato assinado não se apaga, nem pelo dono, nem por update direto ----------
update public.contratos set status = 'assinado' where id = (select contrato from fx);
select pg_temp.como('00000000-0000-4000-8000-00000000d001');
select throws_ok($$ update public.contratos set deleted_at = now() where id = (select contrato from fx) $$, 'P0001', 'Contrato assinado não pode ser excluído.', 'assinado não se apaga por update direto');
select throws_ok($$ select public.apagar_contrato((select contrato from fx)) $$, 'P0001', 'Contrato assinado não pode ser excluído.', 'assinado não se apaga pela RPC');
select pg_temp.sair();

-- ---------- listar_acesso_obra traz o papel ----------
select pg_temp.como('00000000-0000-4000-8000-00000000d001');
select is((select papel from public.listar_acesso_obra((select obra from fx)) where email = 'colab@teste.local'), 'gestor', 'listar_acesso_obra devolve o papel atual');
select is((select papel from public.meus_papeis_obras() where obra_id = (select obra from fx)), 'dono', 'meus_papeis_obras devolve dono');
select pg_temp.sair();

select * from finish();
rollback;
