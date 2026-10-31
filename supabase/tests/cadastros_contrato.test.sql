-- Teste (pgTAP) dos cadastros de contrato: estrutura, RLS por org e papel.
-- Dados fictícios. `supabase test db`.
begin;
select plan(16);

select has_table('public', 'partes', 'partes existe');
select has_table('public', 'parte_signatarios', 'parte_signatarios existe');
select has_table('public', 'fornecedores', 'fornecedores existe');
select has_table('public', 'fornecedor_signatarios', 'fornecedor_signatarios existe');
select has_column('public', 'obras', 'cno', 'obras.cno existe');
select has_column('public', 'obras', 'contratante_id', 'obras.contratante_id existe');
select is((select relrowsecurity from pg_class where oid = 'public.partes'::regclass), true, 'RLS em partes');
select is((select relrowsecurity from pg_class where oid = 'public.fornecedores'::regclass), true, 'RLS em fornecedores');

insert into auth.users (id, email) values
  ('00000000-0000-4000-8000-00000000f001', 'dono2@teste.local'),
  ('00000000-0000-4000-8000-00000000f002', 'colab2@teste.local'),
  ('00000000-0000-4000-8000-00000000f003', 'fora@teste.local');
create temporary table fx2 as
  select (select org_id from public.membros where user_id = '00000000-0000-4000-8000-00000000f001') as org,
         '00000000-0000-4000-8000-00000000f101'::uuid as obra;
insert into public.obras (id, org_id, nome, criado_por) select obra, org, 'Obra Cadastros', '00000000-0000-4000-8000-00000000f001' from fx2;
insert into public.obra_convites (org_id, obra_id, email, user_id, convidado_por, status, papel, respondido_em)
  select org, obra, 'colab2@teste.local', '00000000-0000-4000-8000-00000000f002', '00000000-0000-4000-8000-00000000f001', 'aceito', 'colaborador', now() from fx2;

create or replace function pg_temp.como(p_user uuid) returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claims', json_build_object('sub', p_user, 'role', 'authenticated')::text, true);
  perform set_config('role', 'authenticated', true);
end;
$$;

-- dono cria contratante e construtora, fornecedor e signatário
select pg_temp.como('00000000-0000-4000-8000-00000000f001');
select lives_ok($$ insert into public.partes (id, org_id, tipo, razao_social, cnpj, endereco, cep, marca)
  select '00000000-0000-4000-8000-00000000f201', org, 'construtora', 'Construtora Exemplo S.A.', '33444555000181', 'Rua Beta, 2, Cidade Exemplo/MG', '30000003', 'classica' from fx2 $$, 'dono cria parte');
select throws_ok($$ insert into public.partes (org_id, tipo, razao_social, cnpj, endereco)
  select org, 'contratante', 'X', '123', 'Rua' from fx2 $$, '23514', null, 'CNPJ fora do formato é recusado');
select lives_ok($$ insert into public.fornecedores (id, org_id, razao_social, cnpj, endereco)
  select '00000000-0000-4000-8000-00000000f301', org, 'Fundações Exemplo Ltda.', '11222333000181', 'Av. Teste, 50, Cidade Exemplo/MG' from fx2 $$, 'dono cria fornecedor');
select lives_ok($$ update public.obras set cno = '900000000001', construtora_id = '00000000-0000-4000-8000-00000000f201' where id = (select obra from fx2) $$, 'dono edita dados de contrato da obra');
reset role;

-- colaborador: lê partes, não cria parte; cria fornecedor (nasce da proposta); não edita CNO da obra
select pg_temp.como('00000000-0000-4000-8000-00000000f002');
select is((select count(*) from public.partes), 1::bigint, 'colaborador lê as partes da org');
select throws_ok($$ insert into public.partes (org_id, tipo, razao_social, cnpj, endereco)
  select org, 'contratante', 'SPE Exemplo', '22333444000181', 'Rua Alfa, 1' from fx2 $$, '42501', null, 'colaborador não cria parte (RLS)');
select lives_ok($$ insert into public.fornecedor_signatarios (org_id, fornecedor_id, nome, cpf, cargo)
  select org, '00000000-0000-4000-8000-00000000f301', 'Beltrano Exemplo', '52998224725', 'Sócio-administrador' from fx2 $$, 'colaborador cadastra signatário de fornecedor');
reset role;

-- de fora da org: não vê nada
select pg_temp.como('00000000-0000-4000-8000-00000000f003');
select is((select count(*) from public.fornecedores), 0::bigint, 'quem não colabora com a org não vê fornecedores');
reset role;

select * from finish();
rollback;
