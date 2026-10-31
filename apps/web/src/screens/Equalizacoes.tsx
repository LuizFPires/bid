import { useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import {
  CERTAME_LABEL,
  compararPropostas,
  formatBRL,
  formatNumber,
  formatBRLCompact,
  nomeProposta,
  pendenciasDaAnalise,
  pedidosDeRevisao,
  textoPendencias,
  type PedidoRevisao,
  type AnaliseEqualizacao,
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
  useAnaliseEmAndamento,
  useAnalisesEmAndamento,
  useApagarEqualizacao,
  useObra,
  useObras,
  usePropostasDoCertame,
  usePropostasPorCategoria,
  useSugestoes,
  useMinhaOrg,
} from '../data/hooks';
import {
  desfazerVencedora,
  entregarArquivo,
  gerarRelatorioEqualizacaoPdf,
  podeCompartilharArquivo,
  restaurarEqualizacao,
} from '../data/mutations';
import { useToast } from '../app/Toast';
import { Kebab } from '../app/Kebab';
import { SwipeRow } from '../components/SwipeRow';
import { BarraAcao } from '../app/BarraAcao';
import { EsperaEqualizacao } from '../components/EsperaEqualizacao';
import { Matriz, type MatrizColuna, type MatrizLinha } from '../components/Matriz';
import { BarraProgresso, type Progresso } from '../components/BarraProgresso';
import { DrawerRevisao, PedirRevisao } from '../components/PedirRevisao';
import { ConfirmDialog } from '../app/ConfirmDialog';

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

  const gerandoIds = useAnalisesEmAndamento(eqs.map((e) => e.id));
  const apagarEq = useApagarEqualizacao();
  const toastL = useToast();
  const qcL = useQueryClient();
  const [paraApagar, setParaApagar] = useState<(typeof eqs)[number] | null>(null);
  async function confirmarApagarEq() {
    if (!paraApagar) return;
    const alvo = paraApagar;
    try {
      await apagarEq.mutateAsync(alvo.id);
      setParaApagar(null);
      toastL(`Equalização "${alvo.categoria}" excluída.`, {
        actionLabel: 'Desfazer',
        onAction: async () => {
          try {
            await restaurarEqualizacao(alvo.id);
            qcL.invalidateQueries({ queryKey: ['equalizacoes'] });
          } catch {
            toastL('Não foi possível restaurar a equalização.');
          }
        },
      });
    } catch (e) {
      setParaApagar(null);
      toastL(e instanceof Error ? e.message : 'Não foi possível apagar a equalização.');
    }
  }
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
                  <SwipeRow key={e.id} onApagar={() => setParaApagar(e)}>
                  <div
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
                        {gerandoIds.has(e.id) ? ' · IA gerando o relatório…' : e.temAnalise ? ' · com relatório IA' : ''}
                      </span>
                    </span>
                    <span className="rt">
                      <span className={`dot ${tom}`} />
                    </span>
                    <span className="chev">
                      <Icon name="chev" />
                    </span>
                  </div>
                  </SwipeRow>
                );
              })}
            </div>
          </div>
        ))
      )}
      <ConfirmDialog
        aberto={paraApagar !== null}
        titulo={`Apagar a equalização "${paraApagar?.categoria ?? ''}"?`}
        confirmarLabel="Apagar equalização"
        ocupado={apagarEq.isPending}
        onConfirmar={confirmarApagarEq}
        onCancelar={() => setParaApagar(null)}
      >
        As propostas continuam no acervo; só a comparação e o relatório da IA saem. Você ainda pode desfazer por
        alguns segundos.
      </ConfirmDialog>
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
  const [referencia, setReferencia] = useState('');
  const [erro, setErro] = useState<string | null>(null);

  const obraDetalhe = useObra(escopo === 'obra' ? obraId : undefined);
  const propsCertame = usePropostasDoCertame(escopo === 'obra' ? certameId : undefined);
  const propsCategoria = usePropostasPorCategoria(escopo === 'entre_obras' ? categoria : '');

  const propostas = escopo === 'obra' ? (propsCertame.data ?? []) : (propsCategoria.data ?? []);

  // Ao carregar a lista, todas entram marcadas: comparar tudo é o caso comum;
  // o usuário desmarca o que não quiser (o botão só acende com 2+).
  const chaveLista = propostas.map((p) => p.id).join('|');
  useEffect(() => {
    if (propostas.length > 0) setSel(new Set(propostas.map((p) => p.id)));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [chaveLista]);

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
        referencia,
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
            <span className="c">{sel.size} de {propostas.length} · toque para marcar</span>
          </div>
          <div className="card rowlist">
            {propostas.map((p) => (
              <SelecaoRow key={p.id} p={p} escopo={escopo} on={sel.has(p.id)} toggle={() => toggle(p.id)} />
            ))}
          </div>
        </>
      )}

      {propostas.length > 0 && (
        <div className="field" style={{ marginTop: 18 }}>
          <label htmlFor="eq-ref">Régua do projeto (opcional)</label>
          <textarea
            id="eq-ref"
            value={referencia}
            onChange={(e) => setReferencia(e.target.value)}
            maxLength={4000}
            placeholder="Quantidades e escopo que toda proposta deveria cobrir. Ex.: 898,94 m² de ACM (vermelho 742,85 · azul 90,94 · branco 65,15) + letreiros + plataforma elevatória."
            style={{ minHeight: 88, display: 'block' }}
          />
          <p className="field-help">
            A IA coloca todas as propostas nessa mesma base antes de comparar. Sem isso, usa a maior base clara entre elas.
          </p>
        </div>
      )}

      {erro && (
        <div className="banner warn" role="alert" style={{ margin: '14px 0' }}>
          <Icon name="alert" />
          <span>{erro}</span>
        </div>
      )}

      <BarraAcao>
        <Button block icon="scale" disabled={sel.size < 2 || criar.isPending} onClick={comparar}>
          {criar.isPending
            ? 'Iniciando…'
            : sel.size >= 2
              ? `Comparar ${sel.size} propostas`
              : propostas.length > 0
                ? 'Marque ao menos 2 propostas'
                : 'Escolha a obra e a categoria'}
        </Button>
      </BarraAcao>
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
      <span className={`chk ${on ? 'on' : ''}`} aria-hidden="true">
        {on && <Icon name="check" />}
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
  const rodarIA = useEqualizarIA();
  const [sondar, setSondar] = useState(false);
  const { data, isLoading, isError } = useEqualizacao(id, { sondar });
  // Estado da análise sobrevive à navegação (cache de mutações + flag local).
  const andamento = useAnaliseEmAndamento(id, !!data?.resultadoIa);
  const gerando = andamento.emAndamento;
  useEffect(() => setSondar(andamento.porFlag), [andamento.porFlag]);
  const apagar = useApagarEqualizacao();
  const [confirmando, setConfirmando] = useState(false);
  const [baixando, setBaixando] = useState(false);
  const [progresso, setProgresso] = useState<Progresso | null>(null);

  async function baixarPdf() {
    if (!id) return;
    setBaixando(true);
    setProgresso({ rotulo: 'Gerando o relatório em PDF…', fracao: null });
    try {
      const arquivo = await gerarRelatorioEqualizacaoPdf(id, (p) =>
        setProgresso(p.fase === 'gerando' ? { rotulo: 'Gerando o relatório em PDF…', fracao: null } : { rotulo: 'Baixando o PDF…', fracao: p.fracao }),
      );
      setProgresso({ rotulo: 'PDF pronto.', fracao: 1 });
      if (podeCompartilharArquivo(arquivo)) {
        // iPhone/Android: compartilhar só funciona num toque do usuário — o
        // toast dá esse toque ("Compartilhar") depois que o PDF está pronto.
        toast('Relatório em PDF pronto.', {
          actionLabel: 'Compartilhar',
          duration: 20000,
          onAction: () => void entregarArquivo(arquivo),
        });
      } else {
        await entregarArquivo(arquivo);
      }
    } catch (e) {
      toast(e instanceof Error ? e.message : 'Não foi possível gerar o PDF.');
    } finally {
      setBaixando(false);
      // Deixa o "pronto" visível um instante antes de recolher a barra.
      setTimeout(() => setProgresso(null), 900);
    }
  }
  const definir = useDefinirVencedora();
  const toast = useToast();
  const qc = useQueryClient();
  const [erroIA, setErroIA] = useState<string | null>(null);
  const [pedidoAberto, setPedidoAberto] = useState<PedidoRevisao | null>(null);
  const org = useMinhaOrg();

  const comp = useMemo(() => (data ? compararPropostas(data.propostas) : null), [data]);
  // O que pedir a cada fornecedor (faltas e alertas da matriz), para o WhatsApp.
  const pedidos = useMemo(
    () =>
      data?.resultadoIa
        ? pedidosDeRevisao(
            data.resultadoIa as Pick<AnaliseEqualizacao, 'matriz'>,
            data.propostas.map((p) => ({ id: p.id, nome: nomeProposta(p.fornecedor, p.opcao), valor: p.valor })),
          )
        : [],
    [data],
  );

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
      const { avisos } = await rodarIA.mutateAsync(id);
      if (avisos[0]) toast(avisos[0], { duration: 8000 });
    } catch (err) {
      setErroIA(err instanceof Error ? err.message : 'Falha na análise por IA.');
    }
  }

  async function apagarEsta() {
    if (!id || !data) return;
    const eqId = id;
    const titulo = data.categoria;
    try {
      await apagar.mutateAsync(eqId);
      setConfirmando(false);
      navigate('/equalizacoes');
      toast(`Equalização "${titulo}" excluída.`, {
        actionLabel: 'Desfazer',
        onAction: async () => {
          try {
            await restaurarEqualizacao(eqId);
            qc.invalidateQueries({ queryKey: ['equalizacoes'] });
            qc.invalidateQueries({ queryKey: ['equalizacao'] });
          } catch {
            toast('Não foi possível restaurar a equalização.');
          }
        },
      });
    } catch (e) {
      setConfirmando(false);
      toast(e instanceof Error ? e.message : 'Não foi possível apagar a equalização.');
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
  const nome = (pid: string) => data!.propostas.find((p) => p.id === pid)?.fornecedor ?? '—';
  const temRelatorio = !!ia && ((ia.cards?.length ?? 0) > 0 || (ia.matriz?.criterios?.length ?? 0) > 0);
  // Ranking pelo total equalizado (menor primeiro); cai para o valor apresentado.
  const ranking = [...data.propostas]
    .map((p) => ({
      id: p.id,
      total: ia?.cards?.find((c) => c.proposta_id === p.id)?.equalizado ?? p.valor ?? Number.POSITIVE_INFINITY,
    }))
    .sort((a, b) => a.total - b.total)
    .map((x) => x.id);
  const posicao = (pid: string) => ranking.indexOf(pid) + 1;
  const menorTotal = Math.min(
    ...(ia?.equalizacao?.totais ?? []).map((t) => t.total ?? Number.POSITIVE_INFINITY),
  );

  // Colunas da matriz = propostas (nome + opção/obra), e a linha "Vencedora"
  // (a decisão continua do usuário — regra #6).
  const colunas: MatrizColuna[] = data.propostas.map((p) => ({
    id: p.id,
    titulo: (
      <span style={ia?.recomendacao?.proposta_id === p.id ? { color: 'var(--ok)' } : undefined}>{p.fornecedor}</span>
    ),
    sub: [p.opcao, data.escopo === 'entre_obras' ? p.obraNome : null].filter(Boolean).join(' · ') || undefined,
  }));
  const linhaVencedora: MatrizLinha = {
    rotulo: 'Vencedora',
    centro: true,
    celulas: data.propostas.map((p) => {
      const ehVencedora = data.vencedoraPropostaId === p.id;
      const recomendada = ia?.recomendacao?.proposta_id === p.id;
      return ehVencedora ? (
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
      );
    }),
  };
  const linhaApresentado: MatrizLinha = {
    rotulo: 'Apresentado',
    total: true,
    celulas: data.propostas.map((p) => {
      const m = comp.marcadores[p.id];
      return (
        <span className={m?.menorValor ? 'best' : m?.maiorValor ? 'high' : undefined}>
          {p.valor != null ? formatBRL(p.valor) : '—'}
        </span>
      );
    }),
  };
  const linhasBasicas: MatrizLinha[] = [
    {
      rotulo: 'Prazo',
      celulas: data.propostas.map((p) => (
        <span className={comp.marcadores[p.id]?.menorPrazo ? 'best' : undefined}>
          {p.prazo != null ? `${p.prazo} dias` : '—'}
        </span>
      )),
    },
    { rotulo: 'Pagamento', celulas: data.propostas.map((p) => p.condicaoPagamento ?? '—') },
    { rotulo: 'Garantia', celulas: data.propostas.map((p) => p.garantia ?? '—') },
  ];

  return (
    <>
      <div className="crumb">
        <button onClick={() => navigate('/equalizacoes')}>Equalizar</button>
        <Icon name="chev" />
        <span>{data.categoria}</span>
      </div>
      <div className="page-head prop-head">
        <div style={{ minWidth: 0 }}>
          <h1>{data.categoria}</h1>
          <p className="lead">
            {data.escopo === 'entre_obras' ? 'Entre obras' : (data.obraNome ?? 'Em uma obra')} ·{' '}
            {data.propostas.length} propostas
            {comp.economiaPotencial != null ? ` · economia até ${formatBRLCompact(comp.economiaPotencial)}` : ''}
          </p>
          {data.referencia && (
            <p className="lead rep-regua">
              <b>Régua do projeto:</b> {data.referencia}
            </p>
          )}
        </div>
        <Kebab
          itens={[
            ...(ia
              ? [
                  {
                    label: baixando ? 'Gerando PDF…' : 'Baixar relatório em PDF',
                    icon: 'dl' as const,
                    onClick: () => void baixarPdf(),
                    disabled: baixando || gerando,
                  },
                  { label: 'Refazer relatório', icon: 'spark' as const, onClick: analisar, disabled: gerando },
                ]
              : []),
            {
              label: apagar.isPending ? 'Apagando…' : 'Apagar equalização',
              icon: 'trash' as const,
              danger: true,
              disabled: apagar.isPending,
              onClick: () => setConfirmando(true),
            },
          ]}
        />
      </div>

      <BarraProgresso progresso={progresso} />
      <DrawerRevisao
        pedido={pedidoAberto}
        categoria={data.categoria}
        obra={data.obraNome}
        remetente={org.data?.nome ?? null}
        onFechar={() => setPedidoAberto(null)}
      />
      <ConfirmDialog
        aberto={confirmando}
        titulo={`Apagar a equalização "${data.categoria}"?`}
        confirmarLabel="Apagar equalização"
        ocupado={apagar.isPending}
        onConfirmar={apagarEsta}
        onCancelar={() => setConfirmando(false)}
      >
        As propostas continuam no acervo; só a comparação e o relatório da IA saem. Você ainda pode desfazer por
        alguns segundos.
      </ConfirmDialog>

      {gerando && <EsperaEqualizacao nomes={data.propostas.map((p) => nomeProposta(p.fornecedor, p.opcao))} />}

      {/* Sem análise: comparativo básico (campos reais) + chamada para a IA. */}
      {!ia && !gerando && (
        <>
          <div style={{ marginBottom: 16 }}>
            <Matriz colunas={colunas} primeira="Item" linhas={[...linhasBasicas, { ...linhaApresentado, rotulo: 'Total' }, linhaVencedora]} />
          </div>
          <div className="ai">
            <div className="ai-empty">
              <span className="sp">
                <Icon name="spark" />
              </span>
              <p>
                A IA lê os PDFs das propostas por inteiro, coloca todas na mesma régua e entrega o relatório:
                lado a lado, composição equalizada, divergências, forças e riscos e próximos passos.
              </p>
            </div>
          </div>
          <BarraAcao>
            <Button block icon="spark" disabled={gerando} onClick={analisar}>
              Gerar relatório com IA
            </Button>
          </BarraAcao>
        </>
      )}

      {ia && !gerando && (
        <article className="rep">
          <div className="rep-kicker">
            <Icon name="spark" /> Relatório de equalização · Claude
          </div>
          {ia.titulo && <h2 className="rep-title">{ia.titulo}</h2>}
          {ia.veredito && <p className="rep-lead">{ia.veredito}</p>}

          {temRelatorio && (
            <div className="rep-cards">
              {ranking.map((pid) => {
                const p = data.propostas.find((x) => x.id === pid)!;
                const c = ia.cards?.find((x) => x.proposta_id === pid);
                const eq = c?.equalizado ?? null;
                const ap = c?.apresentado ?? p.valor;
                const pos = posicao(pid);
                return (
                  <div key={pid} className={`rep-card ${pos === 1 ? 'lider' : ''}`}>
                    <div className="rc-h">
                      <span className="rc-n">
                        {p.fornecedor}
                        {p.opcao ? ` · ${p.opcao}` : ''}
                      </span>
                      <span className="rc-pos">{pos}º</span>
                    </div>
                    <div className="rc-k">{eq != null ? 'Equalizado' : 'Apresentado'}</div>
                    <div className="rc-v">{eq != null ? formatBRL(eq) : ap != null ? formatBRL(ap) : '—'}</div>
                    <div className="rc-rows">
                      {eq != null && (
                        <div>
                          <span>Apresentado</span>
                          <b>{ap != null ? formatBRL(ap) : '—'}</b>
                        </div>
                      )}
                      {c?.base && (
                        <div>
                          <span>Base cotada</span>
                          <b>{c.base}</b>
                        </div>
                      )}
                      {p.prazo != null && (
                        <div>
                          <span>Prazo</span>
                          <b>{p.prazo} dias</b>
                        </div>
                      )}
                      {c?.nota && (
                        <div>
                          <span>Observação</span>
                          <b className="nota">{c.nota}</b>
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          {ia.conclusao && (
            <div className="rep-concl">
              <div className="k">Conclusão</div>
              <p>{ia.conclusao}</p>
            </div>
          )}

          <SecTitulo n="01" t="Lado a lado" s="O que cada proposta realmente inclui — e onde é omissa. Arraste para o lado." />
          <Matriz
            colunas={colunas}
            linhas={[
              ...(ia.matriz?.criterios ?? []).map((crit, i): MatrizLinha => ({
                rotulo: crit,
                celulas: data.propostas.map((p) => {
                  const cel = ia.matriz?.porProposta?.find((x) => x.proposta_id === p.id)?.celulas?.[i];
                  return cel ? <Celula texto={cel.texto} status={cel.status} /> : <span className="muted">—</span>;
                }),
              })),
              ...(ia.escopo?.itens ?? []).map((item, i): MatrizLinha => ({
                rotulo: item,
                centro: true,
                celulas: data.propostas.map((p) => (
                  <MarcaEscopo status={ia.escopo?.porProposta?.find((x) => x.proposta_id === p.id)?.status?.[i] ?? 'na'} />
                )),
              })),
              ...((ia.matriz?.criterios?.length ?? 0) === 0 ? linhasBasicas : []),
              linhaApresentado,
              linhaVencedora,
            ]}
          />

          {(ia.equalizacao?.linhas?.length ?? 0) > 0 && (
            <>
              <SecTitulo
                n="02"
                t="Na mesma régua"
                s={ia.equalizacao?.base ?? 'Mesmo escopo e mesma quantidade para todas.'}
              />
              <Matriz
                colunas={colunas}
                primeira="Composição"
                linhas={[
                  ...(ia.equalizacao?.linhas ?? []).map((l): MatrizLinha => ({
                    rotulo: l.item,
                    celulas: data.propostas.map((p) => {
                      const v = l.valores.find((x) => x.proposta_id === p.id);
                      return v?.valor != null ? (
                        <>
                          <span className="val">{formatBRL(v.valor)}</span>
                          {v.referencia && (
                            <>
                              <br />
                              <span className="ref">ref.</span>
                            </>
                          )}
                          {v.nota && <small className="nota-s">{v.nota}</small>}
                        </>
                      ) : (
                        <span className={`nota-eq ${v?.nota ? 'warn' : ''}`}>{v?.nota ?? '—'}</span>
                      );
                    }),
                  })),
                  {
                    rotulo: 'Total equalizado',
                    total: true,
                    celulas: data.propostas.map((p) => {
                      const t = ia.equalizacao?.totais?.find((x) => x.proposta_id === p.id)?.total ?? null;
                      return <span className={t != null && t === menorTotal ? 'best' : undefined}>{t != null ? formatBRL(t) : '—'}</span>;
                    }),
                  },
                  ...(Number.isFinite(menorTotal)
                    ? [
                        {
                          rotulo: 'Diferença para a menor',
                          celulas: data.propostas.map((p) => {
                            const t = ia.equalizacao?.totais?.find((x) => x.proposta_id === p.id)?.total ?? null;
                            if (t == null) return '—';
                            const d = t - menorTotal;
                            return (
                              <span className={d > 0 ? 'high' : 'best'}>
                                {d > 0 ? `+${formatBRL(d)} (+${formatNumber((d / menorTotal) * 100, 1)}%)` : '—'}
                              </span>
                            );
                          }),
                        } as MatrizLinha,
                      ]
                    : []),
                ]}
              />
            </>
          )}

          {(ia.divergencias?.length ?? 0) > 0 && (
            <>
              <SecTitulo n="03" t="Divergências que mudam a decisão" />
              <ol className="num-list">
                {ia.divergencias!.map((d, i) => (
                  <li key={i}>
                    <span className="num">{i + 1}</span>
                    <div>
                      <b>{d.titulo}.</b> {d.texto}
                    </div>
                  </li>
                ))}
              </ol>
            </>
          )}

          {(ia.forcas_riscos?.length ?? 0) > 0 && (
            <>
              <SecTitulo n="04" t="Forças e riscos de cada proposta" />
              {ranking
                .map((pid) => ia.forcas_riscos!.find((f) => f.proposta_id === pid))
                .filter((f): f is NonNullable<typeof f> => !!f)
                .map((f) => (
                  <div key={f.proposta_id} className="card fr-card">
                    <div className="fr-h">
                      <b>{nome(f.proposta_id)}</b>
                      {f.resumo && <span className="fr-r">{f.resumo}</span>}
                    </div>
                    <div className="fr-cols">
                      <div>
                        <div className="fr-k ok">A favor</div>
                        <ul>
                          {f.a_favor.map((x, i) => (
                            <li key={i}>{x}</li>
                          ))}
                        </ul>
                      </div>
                      <div>
                        <div className="fr-k risco">Riscos</div>
                        <ul>
                          {f.riscos.map((x, i) => (
                            <li key={i}>{x}</li>
                          ))}
                        </ul>
                      </div>
                    </div>
                  </div>
                ))}
            </>
          )}

          {(ia.forcas_riscos?.length ?? 0) === 0 && (ia.achados?.length ?? 0) > 0 && (
            <>
              <SecTitulo n="04" t="Achados" />
              <div className="card">
                {ia.achados!.map((a, i) => (
                  <div key={i} className="blk">
                    <span className="k">{a.fornecedor}</span>
                    <div className="v">{(a.pontos ?? []).join(' · ')}</div>
                  </div>
                ))}
              </div>
            </>
          )}

          {(ia.proximos_passos?.length ?? 0) > 0 && (
            <>
              <SecTitulo n="05" t="Próximos passos" />
              <ol className="num-list">
                {ia.proximos_passos!.map((d, i) => (
                  <li key={i}>
                    <span className="num">{i + 1}</span>
                    <div>
                      <b>{d.titulo}.</b> {d.texto}
                    </div>
                  </li>
                ))}
              </ol>
            </>
          )}

          {pedidos.length > 0 && (
            <>
              <SecTitulo n="06" t="Pedir revisão" s="Toque no fornecedor: a mensagem sai pronta para o WhatsApp, com o que falta ou precisa ser confirmado." />
              <PedirRevisao pedidos={pedidos} onEscolher={setPedidoAberto} />
            </>
          )}

          {(() => {
            const rec = data.propostas.find((p) => p.id === ia.recomendacao?.proposta_id);
            const pend = pendenciasDaAnalise(
              ia as Pick<AnaliseEqualizacao, 'matriz'>,
              data.propostas.map((p) => ({ id: p.id, nome: nomeProposta(p.fornecedor, p.opcao), valor: p.valor })),
            );
            const textoPend = textoPendencias(pend);
            return (
              <div className="rep-rec">
                <div className="k">
                  <Icon name="trophy" /> Recomendação da IA
                </div>
                <p>
                  {rec ? (
                    <>
                      <b>
                        {rec.fornecedor}
                        {rec.opcao ? ` · ${rec.opcao}` : ''}.
                      </b>{' '}
                      {ia.recomendacao?.justificativa ?? ''}
                    </>
                  ) : (
                    <>
                      <b>A IA não indicou uma vencedora.</b>{' '}
                      {ia.recomendacao?.justificativa ??
                        textoPend ??
                        ia.conclusao ??
                        'Complete os dados das propostas (valor, escopo ou condições) e refaça o relatório.'}
                    </>
                  )}
                </p>
                {!rec && pend.length > 0 && (
                  <ul className="rep-pend">
                    {pend.map((p) => (
                      <li key={p.proposta_id}>
                        <button
                          type="button"
                          className="linklike"
                          onClick={() => setPedidoAberto(pedidos.find((x) => x.proposta_id === p.proposta_id) ?? { proposta_id: p.proposta_id, nome: p.nome, pontos: p.faltas.map((f) => ({ criterio: f, situacao: 'falta' as const, texto: null })) })}
                        >
                          <b>{p.nome}</b> <Icon name="chev" />
                        </button>
                        <span>
                          {p.faltas.length > 1 ? 'faltam' : 'falta'} {p.faltas.map((f) => f.toLocaleLowerCase('pt-BR')).join(', ')}
                        </span>
                      </li>
                    ))}
                  </ul>
                )}
                <small>
                  A recomendação é apoio — a escolha da vencedora é sua, na tabela acima.
                  {rec ? '' : ' "Refazer relatório" só muda o resultado se os dados das propostas mudarem.'}
                </small>
              </div>
            );
          })()}
        </article>
      )}

      {(erroIA || (!gerando && andamento.ultimoErro)) && (
        <div className="banner warn" role="alert" style={{ marginTop: 14 }}>
          <Icon name="alert" />
          <span>
            {erroIA ?? `A última geração falhou: ${andamento.ultimoErro?.message ?? 'erro desconhecido'}. Tente de novo.`}
          </span>
        </div>
      )}
    </>
  );

}

/* ---------- Peças do relatório ---------- */

function SecTitulo({ n, t, s }: { n: string; t: string; s?: string }) {
  return (
    <div className="rep-sec">
      <span className="n">{n}</span>
      <div>
        <h3>{t}</h3>
        {s && <p>{s}</p>}
      </div>
    </div>
  );
}

/** Célula da matriz: selo colorido (ok / atenção / não informa) + texto curto. */
function Celula({ texto, status }: { texto: string | null; status: 'ok' | 'alerta' | 'falta' | 'neutro' }) {
  if (status === 'neutro') return <span className="cel-t">{texto ?? '—'}</span>;
  const rotulo = status === 'ok' ? 'ok' : status === 'alerta' ? 'atenção' : 'não informa';
  return (
    <span className="cel">
      <span className={`bdg ${status}`}>{rotulo}</span>
      {texto && <span className="cel-t">{texto}</span>}
    </span>
  );
}
