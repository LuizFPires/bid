import { useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import {
  CERTAME_LABEL,
  compararPropostas,
  formatBRL,
  formatBRLCompact,
  nomeProposta,
  type CertameStatus,
  type PropostaComparavel,
} from '@bid/core';
import { Autocomplete, Button, Icon, iconeCategoria } from '@bid/ui';
import { useQueryClient } from '@tanstack/react-query';
import {
  invalidarVencedora,
  useCriarEqualizacao,
  useDefinirVencedora,
  useEqualizacao,
  useEqualizacoes,
  useEqualizarIA,
  useObra,
  useObras,
  usePropostasDoCertame,
  usePropostasPorCategoria,
  useSugestoes,
} from '../data/hooks';
import { desfazerVencedora } from '../data/mutations';
import { useToast } from '../app/Toast';

/** Marca de um item de escopo na matriz: ✓ incluído, ✗ ausente, ~ parcial. */
function MarcaEscopo({ status }: { status: 'incluido' | 'ausente' | 'parcial' | 'na' }) {
  if (status === 'incluido')
    return (
      <span className="mark y">
        <Icon name="check" />
      </span>
    );
  if (status === 'ausente')
    return (
      <span className="mark n">
        <Icon name="x" />
      </span>
    );
  if (status === 'parcial')
    return (
      <span className="mark p">
        <Icon name="tilde" />
      </span>
    );
  return <span style={{ color: 'var(--faint)', fontWeight: 800 }}>—</span>;
}

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
      { titulo: 'Aguardam decisão', itens: decisao },
      { titulo: 'Recebendo propostas', itens: analise },
      { titulo: 'Concluídas', itens: concluida },
    ].filter((g) => g.itens.length > 0);
  }, [eqs]);

  return (
    <>
      <div className="page-head">
        <h1>Equalizações</h1>
        <p className="lead">Compare as propostas e defina a vencedora.</p>
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
              {g.itens.map((e) => {
                const adjudicada = e.certameStatus === 'adjudicada';
                const tom = CERTAME_LABEL[(e.certameStatus ?? 'aberta') as CertameStatus].tom;
                return (
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
                    <span
                      className="ic"
                      style={adjudicada ? { background: 'var(--ok-soft)', color: 'var(--ok)' } : undefined}
                    >
                      <Icon name={adjudicada ? 'trophy' : iconeCategoria(e.categoria)} />
                    </span>
                    <span className="tt">
                      <span className="t1">{e.categoria}</span>
                      <span className="t2">
                        {e.escopo === 'entre_obras' ? 'Entre obras' : 'Em uma obra'} · {e.totalPropostas} propostas
                        {e.temAnalise ? ' · com análise IA' : ''}
                      </span>
                    </span>
                    <span className="rt">
                      <span className={`dot ${tom}`} />
                    </span>
                    <span className="chev">
                      <Icon name="chev" />
                    </span>
                  </div>
                );
              })}
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
              <label htmlFor="eq-certame">Categoria (tomada de preços)</label>
              <select
                id="eq-certame"
                value={certameId}
                onChange={(e) => {
                  setCertameId(e.target.value);
                  setSel(new Set());
                }}
              >
                <option value="">Selecione a tomada de preços…</option>
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
        <span className="t1">{nomeProposta(p.fornecedor, p.opcao)}</span>
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
  const definir = useDefinirVencedora();
  const toast = useToast();
  const qc = useQueryClient();
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

  async function marcarVencedora(propostaId: string) {
    try {
      const anterior = await definir.mutateAsync(propostaId);
      toast('Definida como vencedora — tomada de preços adjudicada.', {
        actionLabel: 'Desfazer',
        onAction: async () => {
          try {
            await desfazerVencedora({ propostaId, anterior });
            invalidarVencedora(qc);
          } catch {
            toast('Não foi possível desfazer.');
          }
        },
      });
    } catch {
      toast('Não foi possível definir a vencedora.');
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

      {/* Comparativo em tabela (rolagem horizontal no celular). A matriz de
          itens de escopo do protótipo era dado fictício — aqui comparamos os
          campos reais: prazo, pagamento, garantia e total. */}
      <div className="tablewrap" style={{ marginBottom: 16 }}>
        <table className="eq">
          <thead>
            <tr>
              <th>Item</th>
              {data.propostas.map((p) => {
                const recomendada = ia?.recomendacao?.proposta_id === p.id;
                return (
                  <th key={p.id} className="forn">
                    <div className="fornhd">
                      <span className="nm" style={recomendada ? { color: 'var(--ok)' } : undefined}>
                        {p.fornecedor}
                      </span>
                      {p.opcao && <span className="vz">{p.opcao}</span>}
                      {data.escopo === 'entre_obras' && p.obraNome && (
                        <span className="vz">{p.obraNome}</span>
                      )}
                    </div>
                  </th>
                );
              })}
            </tr>
          </thead>
          <tbody>
            {(ia?.escopo?.itens ?? []).map((item, i) => (
              <tr key={`esc-${i}`}>
                <td className="itm">{item}</td>
                {data.propostas.map((p) => {
                  const st =
                    ia?.escopo?.porProposta?.find((x) => x.proposta_id === p.id)?.status?.[i] ?? 'na';
                  return (
                    <td key={p.id} style={{ textAlign: 'center' }}>
                      <MarcaEscopo status={st} />
                    </td>
                  );
                })}
              </tr>
            ))}
            <tr>
              <td className="itm">Prazo</td>
              {data.propostas.map((p) => {
                const m = comp.marcadores[p.id];
                return (
                  <td key={p.id} className={`val ${m?.menorPrazo ? 'best' : ''}`}>
                    {p.prazo != null ? `${p.prazo}d` : '—'}
                  </td>
                );
              })}
            </tr>
            <tr>
              <td className="itm">Pagamento</td>
              {data.propostas.map((p) => (
                <td key={p.id}>{p.condicaoPagamento ?? '—'}</td>
              ))}
            </tr>
            <tr>
              <td className="itm">Garantia</td>
              {data.propostas.map((p) => (
                <td key={p.id}>{p.garantia ?? '—'}</td>
              ))}
            </tr>
            <tr className="total">
              <td>Total</td>
              {data.propostas.map((p) => {
                const m = comp.marcadores[p.id];
                return (
                  <td key={p.id} className={`val ${m?.menorValor ? 'best' : m?.maiorValor ? 'high' : ''}`}>
                    {p.valor != null ? formatBRL(p.valor) : '—'}
                  </td>
                );
              })}
            </tr>
            <tr>
              <td className="itm">Vencedora</td>
              {data.propostas.map((p) => {
                const ehVencedora = data.vencedoraPropostaId === p.id;
                const recomendada = ia?.recomendacao?.proposta_id === p.id;
                return (
                  <td key={p.id} style={{ textAlign: 'center' }}>
                    {ehVencedora ? (
                      <span className="pill adjudicada">
                        <Icon name="trophy" style={{ width: 13, height: 13 }} />
                        Vencedora
                      </span>
                    ) : (
                      <button
                        type="button"
                        className={`btn sm ${recomendada ? 'primary' : 'soft'}`}
                        disabled={definir.isPending}
                        onClick={() => marcarVencedora(p.id)}
                      >
                        <Icon name="trophy" />
                        Definir
                      </button>
                    )}
                  </td>
                );
              })}
            </tr>
          </tbody>
        </table>
      </div>

      {/* Análise por IA (apoio) */}
      {ia ? (
        <div className="ai" style={{ marginTop: 4 }}>
          <div className="ai-h">
            <span className="sp">
              <Icon name="spark" />
            </span>
            <div>
              <h3>{data.propostas.length} propostas equalizadas</h3>
              <small>Claude</small>
            </div>
          </div>
          <div className="ai-b">
            {ia.veredito && (
              <div className="verdict">
                <div className="tag">Resumo</div>
                <div style={{ marginTop: 4 }}>{ia.veredito}</div>
              </div>
            )}
            {(() => {
              // Só mostra a recomendação quando aponta uma proposta COMPARADA
              // (o id é validado no core); o fornecedor vem da proposta resolvida.
              const rec = data.propostas.find((p) => p.id === ia.recomendacao?.proposta_id);
              if (!rec) return null;
              return (
                <div className="verdict">
                  <div className="tag">Recomendação</div>
                  <div style={{ marginTop: 4 }}>
                    <b>{rec.fornecedor}.</b> {ia.recomendacao?.justificativa ?? ''}
                  </div>
                </div>
              );
            })()}
            {(ia.achados ?? []).map((a, i) => (
              <div key={i} className="finding">
                <span className="d w" />
                <div>
                  <b>{a.fornecedor}:</b> {(a.pontos ?? []).join(' · ')}
                </div>
              </div>
            ))}
            <p className="lead" style={{ margin: 0, fontSize: 12 }}>
              A recomendação é apoio — a escolha da vencedora é sua.
            </p>
            <div>
              <Button variant="ghost" size="sm" icon="spark" disabled={rodarIA.isPending} onClick={analisar}>
                {rodarIA.isPending ? 'Analisando…' : 'Refazer análise'}
              </Button>
            </div>
          </div>
        </div>
      ) : (
        <div className="ai" style={{ marginTop: 4 }}>
          <div className="ai-empty">
            <span className="sp">
              <Icon name="spark" />
            </span>
            <p>A IA lê planilhas e PDFs e aponta escopo faltando, risco e melhor custo-benefício.</p>
            <Button icon="spark" disabled={rodarIA.isPending} onClick={analisar}>
              {rodarIA.isPending ? 'Analisando…' : 'Analisar com IA'}
            </Button>
          </div>
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

