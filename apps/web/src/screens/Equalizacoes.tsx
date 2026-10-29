import { useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { compararPropostas, formatBRL, formatBRLCompact, type PropostaComparavel } from '@bid/core';
import { Autocomplete, Button, Icon } from '@bid/ui';
import {
  useCriarEqualizacao,
  useEqualizacao,
  useEqualizacoes,
  useEqualizarIA,
  useObra,
  useObras,
  usePropostasDoCertame,
  usePropostasPorCategoria,
  useSugestoes,
} from '../data/hooks';

/* ---------- Lista ---------- */

export function EqualizacoesScreen() {
  const navigate = useNavigate();
  const { data, isLoading, isError } = useEqualizacoes();
  const eqs = data ?? [];

  const grupos = useMemo(() => {
    const concluida = eqs.filter((e) => e.certameStatus === 'adjudicada');
    const decisao = eqs.filter((e) => e.certameStatus !== 'adjudicada' && e.temAnalise);
    const analise = eqs.filter((e) => e.certameStatus !== 'adjudicada' && !e.temAnalise);
    return [
      { titulo: 'Aguardando decisão', itens: decisao },
      { titulo: 'Em equalização', itens: analise },
      { titulo: 'Concluídas', itens: concluida },
    ].filter((g) => g.itens.length > 0);
  }, [eqs]);

  return (
    <>
      <div className="page-head">
        <h1>Equalizar</h1>
        <p className="lead">Compare concorrentes no mesmo nível, com apoio de IA.</p>
      </div>

      {isLoading ? (
        <div className="card">
          <div className="empty">
            <span className="thinking" aria-label="Carregando">
              <i />
              <i />
              <i />
            </span>
          </div>
        </div>
      ) : isError ? (
        <div className="banner warn" role="alert">
          <Icon name="alert" />
          <span>Não foi possível carregar as equalizações.</span>
        </div>
      ) : eqs.length === 0 ? (
        <div className="card empty">Nenhuma equalização ainda. Toque em + para iniciar.</div>
      ) : (
        grupos.map((g) => (
          <div key={g.titulo}>
            <div className="section-title">
              <h2>{g.titulo}</h2>
              <span className="c">{g.itens.length}</span>
            </div>
            <div className="card rowlist">
              {g.itens.map((e) => (
                <div
                  key={e.id}
                  className="row"
                  role="button"
                  tabIndex={0}
                  style={{ cursor: 'pointer' }}
                  onClick={() => navigate(`/equalizacoes/${e.id}`)}
                  onKeyDown={(ev) => {
                    if (ev.key === 'Enter' || ev.key === ' ') {
                      ev.preventDefault();
                      navigate(`/equalizacoes/${e.id}`);
                    }
                  }}
                >
                  <span className="ic">
                    <Icon name="scale" />
                  </span>
                  <span className="tt">
                    <span className="t1">{e.categoria}</span>
                    <span className="t2">
                      {e.escopo === 'entre_obras' ? 'Entre obras' : 'Em uma obra'} · {e.totalPropostas} propostas
                      {e.temAnalise ? ' · com análise IA' : ''}
                    </span>
                  </span>
                  <span className="rt">
                    <Icon name="chev" />
                  </span>
                </div>
              ))}
            </div>
          </div>
        ))
      )}
    </>
  );
}

/* ---------- Iniciar equalização ---------- */

export function IniciarEqualizacaoScreen() {
  const navigate = useNavigate();
  const criar = useCriarEqualizacao();
  const obras = useObras();
  const categoriasSug = useSugestoes('categoria');

  const [escopo, setEscopo] = useState<'obra' | 'entre_obras'>('obra');
  const [obraId, setObraId] = useState('');
  const [certameId, setCertameId] = useState('');
  const [categoria, setCategoria] = useState('');
  const [sel, setSel] = useState<Set<string>>(new Set());
  const [erro, setErro] = useState<string | null>(null);

  const obraDetalhe = useObra(escopo === 'obra' ? obraId : undefined);
  const propsCertame = usePropostasDoCertame(escopo === 'obra' ? certameId : undefined);
  const propsCategoria = usePropostasPorCategoria(escopo === 'entre_obras' ? categoria : '');

  const propostas = escopo === 'obra' ? (propsCertame.data ?? []) : (propsCategoria.data ?? []);

  function toggle(id: string) {
    setSel((s) => {
      const n = new Set(s);
      if (n.has(id)) n.delete(id);
      else n.add(id);
      return n;
    });
  }

  async function comparar() {
    setErro(null);
    const ids = [...sel];
    if (ids.length < 2) {
      setErro('Selecione ao menos duas propostas.');
      return;
    }
    const cat =
      escopo === 'obra'
        ? (obraDetalhe.data?.certames.find((c) => c.id === certameId)?.categoria ?? '')
        : categoria.trim();
    try {
      const id = await criar.mutateAsync({
        escopo,
        categoria: cat,
        certameId: escopo === 'obra' ? certameId : null,
        propostaIds: ids,
      });
      navigate(`/equalizacoes/${id}`);
    } catch (err) {
      setErro(err instanceof Error ? err.message : 'Não foi possível iniciar a equalização.');
    }
  }

  const certames = obraDetalhe.data?.certames ?? [];

  return (
    <>
      <div className="crumb">
        <button onClick={() => navigate('/equalizacoes')}>Equalizar</button>
        <Icon name="chev" />
        <span>Iniciar</span>
      </div>
      <div className="page-head">
        <h1>Iniciar equalização</h1>
        <p className="lead">Escolha o escopo, a categoria e as propostas que entram.</p>
      </div>

      <div className="seg" role="group" aria-label="Escopo" style={{ marginBottom: 14 }}>
        <button
          type="button"
          className={escopo === 'obra' ? 'on' : ''}
          aria-pressed={escopo === 'obra'}
          onClick={() => {
            setEscopo('obra');
            setSel(new Set());
          }}
        >
          Em uma obra
        </button>
        <button
          type="button"
          className={escopo === 'entre_obras' ? 'on' : ''}
          aria-pressed={escopo === 'entre_obras'}
          onClick={() => {
            setEscopo('entre_obras');
            setSel(new Set());
          }}
        >
          Entre obras
        </button>
      </div>

      {escopo === 'obra' ? (
        <>
          <div className="field">
            <label htmlFor="eq-obra">Obra</label>
            <select
              id="eq-obra"
              value={obraId}
              onChange={(e) => {
                setObraId(e.target.value);
                setCertameId('');
                setSel(new Set());
              }}
            >
              <option value="">Selecione a obra…</option>
              {(obras.data ?? []).map((o) => (
                <option key={o.id} value={o.id}>
                  {o.nome}
                </option>
              ))}
            </select>
          </div>
          {obraId && (
            <div className="field">
              <label htmlFor="eq-certame">Categoria (certame)</label>
              <select
                id="eq-certame"
                value={certameId}
                onChange={(e) => {
                  setCertameId(e.target.value);
                  setSel(new Set());
                }}
              >
                <option value="">Selecione o certame…</option>
                {certames.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.categoria} · {c.totalPropostas} propostas
                  </option>
                ))}
              </select>
            </div>
          )}
        </>
      ) : (
        <Autocomplete
          label="Categoria de serviço"
          placeholder="Ex.: Estrutura pré-moldada"
          value={categoria}
          onChange={(v) => {
            setCategoria(v);
            setSel(new Set());
          }}
          options={(categoriasSug.data ?? []).map((s) => s.texto)}
        />
      )}

      {propostas.length > 0 && (
        <>
          <div className="section-title">
            <h2>Propostas</h2>
            <span className="c">{sel.size} selecionadas</span>
          </div>
          <div className="card rowlist">
            {propostas.map((p) => (
              <SelecaoRow key={p.id} p={p} escopo={escopo} on={sel.has(p.id)} toggle={() => toggle(p.id)} />
            ))}
          </div>
        </>
      )}

      {erro && (
        <div className="banner warn" role="alert" style={{ margin: '14px 0' }}>
          <Icon name="alert" />
          <span>{erro}</span>
        </div>
      )}

      <div style={{ marginTop: 14 }}>
        <Button block icon="scale" disabled={sel.size < 2 || criar.isPending} onClick={comparar}>
          {criar.isPending ? 'Iniciando…' : `Comparar ${sel.size || ''}`}
        </Button>
      </div>
    </>
  );
}

function SelecaoRow({
  p,
  escopo,
  on,
  toggle,
}: {
  p: PropostaComparavel & { obraNome: string };
  escopo: 'obra' | 'entre_obras';
  on: boolean;
  toggle: () => void;
}) {
  return (
    <div
      className="row"
      role="checkbox"
      aria-checked={on}
      tabIndex={0}
      style={{ cursor: 'pointer' }}
      onClick={toggle}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          toggle();
        }
      }}
    >
      <span
        className="ic"
        style={on ? { background: 'var(--accent-soft)', color: 'var(--accent-ink)' } : undefined}
      >
        <Icon name={on ? 'check' : 'doc'} />
      </span>
      <span className="tt">
        <span className="t1">{p.fornecedor}</span>
        <span className="t2">
          {escopo === 'entre_obras' ? `${p.obraNome} · ` : ''}
          {p.prazo != null ? `${p.prazo} dias` : 'prazo —'}
        </span>
      </span>
      <span className="rt">
        <span className="v">{p.valor != null ? formatBRL(p.valor) : '—'}</span>
      </span>
    </div>
  );
}

/* ---------- Detalhe: comparativo + IA ---------- */

export function EqualizacaoScreen() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { data, isLoading, isError } = useEqualizacao(id);
  const rodarIA = useEqualizarIA();
  const [erroIA, setErroIA] = useState<string | null>(null);

  const comp = useMemo(() => (data ? compararPropostas(data.propostas) : null), [data]);

  if (isLoading) {
    return (
      <div className="card" style={{ marginTop: 16 }}>
        <div className="empty">
          <span className="thinking" aria-label="Carregando">
            <i />
            <i />
            <i />
          </span>
        </div>
      </div>
    );
  }
  if (isError || !data || !comp) {
    return (
      <>
        <div className="crumb">
          <button onClick={() => navigate('/equalizacoes')}>Equalizar</button>
          <Icon name="chev" />
          <span>Equalização</span>
        </div>
        <div className="card empty">Equalização não encontrada.</div>
      </>
    );
  }

  async function analisar() {
    if (!id) return;
    setErroIA(null);
    try {
      await rodarIA.mutateAsync(id);
    } catch (err) {
      setErroIA(err instanceof Error ? err.message : 'Falha na análise por IA.');
    }
  }

  const ia = data.resultadoIa;

  return (
    <>
      <div className="crumb">
        <button onClick={() => navigate('/equalizacoes')}>Equalizar</button>
        <Icon name="chev" />
        <span>{data.categoria}</span>
      </div>
      <div className="page-head">
        <h1>{data.categoria}</h1>
        <p className="lead">
          {data.escopo === 'entre_obras' ? 'Entre obras' : (data.obraNome ?? 'Em uma obra')} ·{' '}
          {data.propostas.length} propostas
          {comp.economiaPotencial != null ? ` · economia até ${formatBRLCompact(comp.economiaPotencial)}` : ''}
        </p>
      </div>

      {/* Comparativo lado a lado (rolagem horizontal no celular) */}
      <div style={{ overflowX: 'auto', margin: '0 -2px 16px', paddingBottom: 4 }}>
        <div style={{ display: 'flex', gap: 10, minWidth: 'min-content' }}>
          {data.propostas.map((p) => {
            const m = comp.marcadores[p.id];
            const recomendada = ia?.recomendacao?.proposta_id === p.id;
            return (
              <div
                key={p.id}
                className="card"
                style={{
                  minWidth: 190,
                  flex: '0 0 auto',
                  outline: recomendada ? '2px solid var(--ok)' : undefined,
                }}
              >
                <div style={{ fontWeight: 900, fontSize: 15, marginBottom: 2 }}>{p.fornecedor}</div>
                {recomendada && (
                  <span className="pill adjudicada" style={{ marginBottom: 8 }}>
                    <Icon name="trophy" style={{ width: 13, height: 13 }} />
                    Recomendada
                  </span>
                )}
                <Linha rotulo="Valor" valor={p.valor != null ? formatBRL(p.valor) : '—'} badge={m?.menorValor ? 'menor' : m?.maiorValor ? 'maior' : null} />
                <Linha rotulo="Prazo" valor={p.prazo != null ? `${p.prazo} dias` : '—'} badge={m?.menorPrazo ? 'menor' : m?.maiorPrazo ? 'maior' : null} />
                <Linha rotulo="Pagamento" valor={p.condicaoPagamento ?? '—'} />
                <Linha rotulo="Garantia" valor={p.garantia ?? '—'} />
              </div>
            );
          })}
        </div>
      </div>

      {/* Análise por IA (apoio) */}
      <div className="section-title">
        <h2>Análise com IA</h2>
      </div>
      {ia ? (
        <div className="card">
          {ia.veredito && <p style={{ margin: '0 0 10px', fontWeight: 700 }}>{ia.veredito}</p>}
          {(() => {
            // Só mostra a recomendação quando aponta uma proposta COMPARADA
            // (o id é validado no core); o fornecedor vem da proposta resolvida.
            const rec = data.propostas.find((p) => p.id === ia.recomendacao?.proposta_id);
            if (!rec) return null;
            return (
              <div className="banner ok" style={{ marginBottom: 10 }}>
                <Icon name="trophy" />
                <span>
                  <strong>Recomenda: {rec.fornecedor}.</strong> {ia.recomendacao?.justificativa ?? ''}
                </span>
              </div>
            );
          })()}
          {(ia.achados ?? []).map((a, i) => (
            <div key={i} style={{ marginBottom: 8 }}>
              <div style={{ fontWeight: 800, fontSize: 13 }}>{a.fornecedor}</div>
              <ul style={{ margin: '4px 0 0', paddingLeft: 18, fontSize: 13, fontWeight: 600 }}>
                {(a.pontos ?? []).map((pt, j) => (
                  <li key={j}>{pt}</li>
                ))}
              </ul>
            </div>
          ))}
          <p className="lead" style={{ margin: '8px 0 0', fontSize: 12 }}>
            A recomendação é apoio — a escolha da vencedora é sua.
          </p>
          <div style={{ marginTop: 10 }}>
            <Button variant="ghost" size="sm" icon="spark" disabled={rodarIA.isPending} onClick={analisar}>
              {rodarIA.isPending ? 'Analisando…' : 'Refazer análise'}
            </Button>
          </div>
        </div>
      ) : (
        <div className="card">
          <p className="lead" style={{ marginTop: 0 }}>
            A IA lê os dados das propostas, normaliza escopos e recomenda a melhor por custo-benefício.
          </p>
          <Button icon="spark" block disabled={rodarIA.isPending} onClick={analisar}>
            {rodarIA.isPending ? 'Analisando…' : 'Rodar análise com IA'}
          </Button>
        </div>
      )}

      {erroIA && (
        <div className="banner warn" role="alert" style={{ marginTop: 14 }}>
          <Icon name="alert" />
          <span>{erroIA}</span>
        </div>
      )}
    </>
  );
}

function Linha({ rotulo, valor, badge }: { rotulo: string; valor: string; badge?: 'menor' | 'maior' | null }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 8, padding: '4px 0', borderTop: '1px solid var(--line)' }}>
      <span style={{ fontSize: 11, fontWeight: 800, textTransform: 'uppercase', color: 'var(--muted)' }}>{rotulo}</span>
      <span style={{ fontWeight: 800, fontSize: 13, textAlign: 'right' }}>
        {valor}
        {badge === 'menor' && <span style={{ color: 'var(--ok)', fontWeight: 900 }}> ↓ menor</span>}
        {badge === 'maior' && <span style={{ color: 'var(--danger)', fontWeight: 900 }}> ↑ maior</span>}
      </span>
    </div>
  );
}
