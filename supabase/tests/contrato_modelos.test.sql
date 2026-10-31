-- Teste (pgTAP) do modelo da minuta: estrutura, bucket privado, RLS, versão ativa única.
begin;
select plan(11);

select has_table('public', 'contrato_modelos', 'contrato_modelos existe');
select has_table('public', 'modelo_blocos', 'modelo_blocos existe');
select has_table('public', 'modelo_variantes', 'modelo_variantes existe');
select has_table('public', 'modelo_parametros', 'modelo_parametros existe');
select is((select relrowsecurity from pg_class where oid = 'public.contrato_modelos'::regclass), true, 'RLS em contrato_modelos');
select is((select public from storage.buckets where id = 'modelos'), false, 'bucket modelos é privado');
select is((select count(*) from pg_policies where schemaname = 'storage' and tablename = 'objects' and qual like '%''modelos''%'), 0::bigint, 'nenhuma policy de storage expõe o bucket modelos ao cliente');

insert into public.organizacoes (id, nome) values ('00000000-0000-4000-8000-00000000a900', 'Org Modelo');
insert into public.contrato_modelos (id, org_id, codigo, versao, docx_path, catalogo, ativo)
  values ('00000000-0000-4000-8000-00000000a901', '00000000-0000-4000-8000-00000000a900', 'empreitada', '1.0', 'x/empreitada-1.0.docx', '{"versao":"1.0","clausulas":[]}', true);
select throws_ok(
  $$ insert into public.contrato_modelos (org_id, codigo, versao, docx_path, catalogo, ativo)
     values ('00000000-0000-4000-8000-00000000a900', 'empreitada', '1.1', 'x/empreitada-1.1.docx', '{}', true) $$,
  '23505', null, 'só uma versão ativa por org e código');
select lives_ok(
  $$ insert into public.contrato_modelos (org_id, codigo, versao, docx_path, catalogo, ativo)
     values ('00000000-0000-4000-8000-00000000a900', 'empreitada', '1.1', 'x/empreitada-1.1.docx', '{}', false) $$,
  'versão inativa convive com a ativa');
select is((select versao from public.modelo_contrato_ativo('00000000-0000-4000-8000-00000000a900')), '1.0', 'modelo_contrato_ativo devolve a versão ativa');
select is((select count(*) from public.modelo_contrato_ativo('00000000-0000-4000-8000-00000000a800')), 0::bigint, 'org sem modelo não tem ativo');

select * from finish();
rollback;
