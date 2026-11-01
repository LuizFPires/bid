-- Teste (pgTAP) de reverter a vencedora: volta a analise/recebida conforme
-- equalização, limpa a adjudicação, recusa com contrato ativo. Dados fictícios.
begin;
select plan(8);

select has_function('public', 'reverter_vencedora', ARRAY['uuid'], 'reverter_vencedora existe');

insert into auth.users (id, email) values ('00000000-0000-4000-8000-00000000c901', 'dono9@teste.local');
create temporary table fx9 as
  select (select org_id from public.membros where user_id = '00000000-0000-4000-8000-00000000c901') as org,
         '00000000-0000-4000-8000-00000000c911'::uuid as obra,
         '00000000-0000-4000-8000-00000000c912'::uuid as certame,
         '00000000-0000-4000-8000-00000000c913'::uuid as prop,
         '00000000-0000-4000-8000-00000000c914'::uuid as contrato;
insert into public.obras (id, org_id, nome, criado_por) select obra, org, 'Obra Reverter', '00000000-0000-4000-8000-00000000c901' from fx9;
insert into public.certames (id, org_id, obra_id, categoria, titulo, status) select certame, org, obra, 'Pintura', 'Pintura', 'aberta' from fx9;
insert into public.propostas (id, org_id, certame_id, fornecedor, status, valor_atual) select prop, org, certame, 'Tintas Exemplo', 'recebida', 1000 from fx9;

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

select pg_temp.como('00000000-0000-4000-8000-00000000c901');
select throws_like($$ select public.reverter_vencedora((select prop from fx9)) $$, '%não é a vencedora%', 'proposta que não é vencedora não reverte');
select lives_ok($$ select public.definir_vencedora((select prop from fx9)) $$, 'define vencedora');
select is((select status from public.certames where id = (select certame from fx9)), 'adjudicada', 'certame adjudicado');
-- sem equalização: volta a recebida / aberta
select lives_ok($$ select public.reverter_vencedora((select prop from fx9)) $$, 'reverte a vencedora');
select is((select status || '|' || coalesce(vencedora_proposta_id::text, 'null') from public.certames where id = (select certame from fx9)), 'aberta|null', 'certame volta a aberta, sem vencedora');
select is((select status from public.propostas where id = (select prop from fx9)), 'recebida', 'proposta volta a recebida');
-- com contrato em rascunho: recusa
select lives_ok($$ select public.definir_vencedora((select prop from fx9)) $$, 'define de novo');
select pg_temp.sair();
insert into public.contratos (id, org_id, certame_id, proposta_id, obra_id, categoria, status) select contrato, org, certame, prop, obra, 'Pintura', 'rascunho' from fx9;
select pg_temp.como('00000000-0000-4000-8000-00000000c901');
select throws_like($$ select public.reverter_vencedora((select prop from fx9)) $$, '%apague o contrato%', 'com contrato ativo não reverte');
select pg_temp.sair();

select * from finish();
rollback;
