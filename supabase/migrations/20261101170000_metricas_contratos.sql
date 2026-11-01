-- M14 · Métricas de contratos (PRD-contratos §2 "métricas de sucesso"), lidas
-- de `eventos` e das tabelas do contrato v2, por organização. Só gestor da org
-- (seção no perfil). SECURITY INVOKER: a RLS continua valendo nas leituras.
create or replace function public.metricas_contratos(p_org uuid, p_desde timestamptz default now() - interval '180 days')
returns jsonb
language sql
stable
security invoker
set search_path = public
as $$
  with emitidos as (
    select k.id, k.created_at, k.emitido_em,
           -- vencedora definida (evento na proposta) → emissão; sem evento, conta da criação do contrato
           coalesce((select min(e.created_at) from public.eventos e
                      where e.org_id = k.org_id and e.tipo = 'vencedora_definida' and e.entidade_id = k.proposta_id), k.created_at) as inicio
      from public.contratos k
     where k.org_id = p_org and k.deleted_at is null and k.modelo_id is not null
       and k.emitido_em is not null and k.emitido_em >= p_desde
  ),
  reduz as (
    select count(distinct i.contrato_id) as n
      from public.contrato_itens_clausula i
      join emitidos em on em.id = i.contrato_id
     where i.reduz_protecao and not i.suprimido
  ),
  achados as (
    select coalesce(sum((e.payload->>'alta')::int), 0) as alta,
           coalesce(sum((e.payload->>'media')::int), 0) as media,
           coalesce(sum((e.payload->>'baixa')::int), 0) as baixa,
           count(*) as revisoes
      from public.eventos e
     where e.org_id = p_org and e.tipo = 'revisao_ia_concluida' and e.created_at >= p_desde
  ),
  devolucoes as (
    select count(*) as total, count(distinct a.contrato_id) as contratos
      from public.contrato_aprovacoes a
     where a.org_id = p_org and a.acao = 'devolvido' and a.created_at >= p_desde
  ),
  andamento as (
    select k.status, count(*) as n
      from public.contratos k
     where k.org_id = p_org and k.deleted_at is null and k.modelo_id is not null
     group by k.status
  )
  select case when public.is_gestor(p_org) then jsonb_build_object(
    'desde', p_desde,
    'emitidos', (select count(*) from emitidos),
    'tempo_medio_horas', (select round(avg(extract(epoch from (emitido_em - inicio)) / 3600)::numeric, 1) from emitidos),
    'tempo_mediano_horas', (select round((percentile_cont(0.5) within group (order by extract(epoch from (emitido_em - inicio)) / 3600))::numeric, 1) from emitidos),
    'pct_reduz_protecao', (select case when count(*) = 0 then null else round(100.0 * (select n from reduz) / count(*), 0) end from emitidos),
    'achados', (select jsonb_build_object('alta', alta, 'media', media, 'baixa', baixa, 'revisoes', revisoes) from achados),
    'devolucoes', (select jsonb_build_object('total', total, 'contratos', contratos) from devolucoes),
    'por_status', (select coalesce(jsonb_object_agg(status, n), '{}'::jsonb) from andamento)
  ) else null end;
$$;
revoke all on function public.metricas_contratos(uuid, timestamptz) from public, anon;
grant execute on function public.metricas_contratos(uuid, timestamptz) to authenticated;
