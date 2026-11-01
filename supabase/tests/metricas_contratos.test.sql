-- Teste (pgTAP) das métricas de contratos (M14): só gestor da org recebe dados;
-- contagens batem com eventos/tabelas. Dados fictícios. `supabase test db`.
begin;
select plan(5);

select has_function('public', 'metricas_contratos', ARRAY['uuid', 'timestamptz'], 'metricas_contratos existe');

insert into auth.users (id, email) values
  ('00000000-0000-4000-8000-00000000b001', 'gestor7@teste.local'),
  ('00000000-0000-4000-8000-00000000b002', 'outro7@teste.local');
create temporary table fx7 as
  select (select org_id from public.membros where user_id = '00000000-0000-4000-8000-00000000b001') as org,
         '00000000-0000-4000-8000-00000000b101'::uuid as obra,
         '00000000-0000-4000-8000-00000000b102'::uuid as certame,
         '00000000-0000-4000-8000-00000000b103'::uuid as prop,
         '00000000-0000-4000-8000-00000000b104'::uuid as modelo,
         '00000000-0000-4000-8000-00000000b105'::uuid as contrato;
insert into public.obras (id, org_id, nome, criado_por) select obra, org, 'Obra Métricas', '00000000-0000-4000-8000-00000000b001' from fx7;
insert into public.certames (id, org_id, obra_id, categoria, titulo, status) select certame, org, obra, 'Pintura', 'Pintura', 'adjudicada' from fx7;
insert into public.propostas (id, org_id, certame_id, fornecedor, status, valor_atual) select prop, org, certame, 'Tintas Exemplo', 'vencedora', 1000 from fx7;
insert into public.contrato_modelos (id, org_id, codigo, versao, docx_path, catalogo, ativo) select modelo, org, 'empreitada', '1.0', 'x.docx', '{"versao":"1.0","clausulas":[],"anexo_ii":[]}', true from fx7;
insert into public.contratos (id, org_id, certame_id, proposta_id, obra_id, categoria, status, modelo_id, created_at, emitido_em)
  select contrato, org, certame, prop, obra, 'Pintura', 'emitido', modelo, now() - interval '3 hours', now() - interval '1 hour' from fx7;
insert into public.eventos (org_id, entidade, entidade_id, tipo, payload, created_at)
  select org, 'proposta', prop, 'vencedora_definida', '{}'::jsonb, now() - interval '5 hours' from fx7
  union all
  select org, 'contrato', contrato, 'revisao_ia_concluida', '{"alta":1,"media":2,"baixa":0}'::jsonb, now() - interval '2 hours' from fx7;
insert into public.contrato_aprovacoes (org_id, contrato_id, acao, conteudo_hash, autor, situacao)
  select org, contrato, 'devolvido', 'h', '00000000-0000-4000-8000-00000000b001', 'superada' from fx7;

create or replace function pg_temp.como(p_user uuid) returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claims', json_build_object('sub', p_user, 'role', 'authenticated')::text, true);
  perform set_config('role', 'authenticated', true);
end;
$$;

select pg_temp.como('00000000-0000-4000-8000-00000000b001');
select is((public.metricas_contratos((select org from fx7))->>'emitidos')::int, 1, 'gestor vê 1 emitido');
select is((public.metricas_contratos((select org from fx7))->>'tempo_medio_horas')::numeric, 4.0, 'tempo vencedora→emitido = 4 h');
select is((public.metricas_contratos((select org from fx7))->'achados'->>'alta')::int, 1, 'achados altos somados dos eventos');
select pg_temp.como('00000000-0000-4000-8000-00000000b002');
select is(public.metricas_contratos((select org from fx7)), null, 'quem não é gestor da org não recebe métricas');

select * from finish();
rollback;
