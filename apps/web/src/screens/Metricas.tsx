import { useQuery } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { CONTRATO_LABEL, type ContratoStatus } from '@bid/core';
import { Icon } from '@bid/ui';
import { useMinhaOrg } from '../data/hooks';
import { supabase } from '../lib/supabase';

interface Metricas {
  desde: string;
  emitidos: number;
  tempo_medio_horas: number | null;
  tempo_mediano_horas: number | null;
  pct_reduz_protecao: number | null;
  achados: { alta: number; media: number; baixa: number; revisoes: number };
  devolucoes: { total: number; contratos: number };
  por_status: Partial<Record<ContratoStatus, number>>;
}

async function fetchMetricas(orgId: string): Promise<Metricas | null> {
  if (!supabase) throw new Error('Supabase não configurado.');
  const { data, error } = await supabase.rpc('metricas_contratos', { p_org: orgId });
  if (error) throw error;
  return (data as Metricas | null) ?? null;
}

function horas(h: number | null): string {
  if (h == null) return '—';
  if (h < 1) return `${Math.round(h * 60)} min`;
  if (h < 48) return `${h.toLocaleString('pt-BR', { maximumFractionDigits: 1 })} h`;
  return `${(h / 24).toLocaleString('pt-BR', { maximumFractionDigits: 1 })} dias`;
}

/**
 * Métricas de contratos (menu do perfil, só gestor da org): tempo da vencedora
 * à emissão, variantes que reduzem proteção, achados da IA e devoluções — as
 * métricas de sucesso do PRD-contratos, lidas de `eventos` pelo servidor.
 */
export function MetricasScreen() {
  const navigate = useNavigate();
  const org = useMinhaOrg();
  const orgId = org.data?.id;
  const q = useQuery({ queryKey: ['metricas-contratos', orgId], queryFn: () => fetchMetricas(orgId as string), enabled: !!orgId });
  const m = q.data;

  return (
    <>
      <div className="crumb">
        <button onClick={() => navigate(-1)}>Voltar</button>
        <Icon name="chev" />
        <span>Métricas</span>
      </div>
      <div className="page-head">
        <h1>Métricas de contratos</h1>
        <p className="lead">Últimos 180 dias · contratos na minuta padrão desta organização.</p>
      </div>
      {q.isLoading || org.isLoading ? (
        <div className="card"><div className="empty"><span className="thinking" aria-label="Carregando"><i /><i /><i /></span></div></div>
      ) : q.isError ? (
        <div className="banner warn" role="alert"><Icon name="alert" /><span>Não foi possível carregar as métricas.</span></div>
      ) : !m ? (
        <div className="card empty">Só o gestor da organização vê as métricas.</div>
      ) : (
        <>
          <div className="section-title"><h2>Da vencedora à emissão</h2><span className="c">meta: &lt; 30 min</span></div>
          <div className="card flush doss">
            <div className="dl"><span className="k">Contratos emitidos</span><span className="v">{m.emitidos}</span></div>
            <div className="dl"><span className="k">Tempo médio</span><span className="v">{horas(m.tempo_medio_horas)}<small>vencedora definida → emitido</small></span></div>
            <div className="dl"><span className="k">Tempo mediano</span><span className="v">{horas(m.tempo_mediano_horas)}</span></div>
          </div>
          <div className="section-title"><h2>Qualidade da minuta</h2></div>
          <div className="card flush doss">
            <div className="dl"><span className="k">Com variante que reduz proteção</span><span className="v">{m.pct_reduz_protecao == null ? '—' : `${m.pct_reduz_protecao}%`}<small>dos emitidos; todas com justificativa e aprovação item a item</small></span></div>
            <div className="dl"><span className="k">Revisões por IA</span><span className="v">{m.achados.revisoes}<small>{m.achados.alta} altos · {m.achados.media} médios · {m.achados.baixa} baixos</small></span></div>
            <div className="dl"><span className="k">Devoluções na validação</span><span className="v">{m.devolucoes.total}<small>em {m.devolucoes.contratos} {m.devolucoes.contratos === 1 ? 'contrato' : 'contratos'}</small></span></div>
          </div>
          <div className="section-title"><h2>Em andamento</h2></div>
          <div className="card flush doss">
            {Object.entries(m.por_status).length === 0 && <div className="empty" style={{ padding: 14 }}>Nenhum contrato na minuta padrão.</div>}
            {(Object.entries(m.por_status) as [ContratoStatus, number][]).map(([st, n]) => (
              <div key={st} className="dl"><span className="k">{CONTRATO_LABEL[st]?.texto ?? st}</span><span className="v">{n}</span></div>
            ))}
          </div>
          <p className="lead" style={{ fontSize: 12 }}>Marcador vazio em contrato emitido: 0 por construção (a emissão recusa). Revisão por IA: 100% dos emitidos (o envio exige).</p>
        </>
      )}
    </>
  );
}
