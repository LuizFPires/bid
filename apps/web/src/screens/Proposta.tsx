import { useEffect, useRef, useState, type FormEvent } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import {
  formatBRL,
  formatNumber,
  formatNumeric,
  nomeProposta,
  normalizarExtracao,
  variacao,
  PROPOSTA_LABEL,
  type PropostaExtraida,
  type Variacao,
} from '@bid/core';
import { useQueryClient } from '@tanstack/react-query';
import { Autocomplete, Button, Icon } from '@bid/ui';
import {
  invalidarVencedora,
  useApagarProposta,
  useCriarContrato,
  useCriarVersao,
  useDefinirVencedora,
  useEditarProposta,
  useProposta,
  useSugestoes,
} from '../data/hooks';
import {
  desfazerVencedora,
  extrairProposta,
  moverPropostaCategoria,
  restaurarProposta,
  uploadPropostaArquivo,
} from '../data/mutations';
import { urlArquivoProposta, type PropostaDetalhe, type VersaoDetalhe } from '../data/queries';
import { LeituraIA } from '../components/LeituraIA';
import { useToast } from '../app/Toast';
import { ConfirmDialog } from '../app/ConfirmDialog';
import { Drawer } from '../app/Drawer';

/** Mostra a variação de um valor entre versões, com seta e sinal (não só cor). */
function Delta({ v, money }: { v: Variacao; money?: boolean }) {
  if (v.dir === 'flat') return <span style={{ color: 'var(--faint)', fontWeight: 700 }}>sem mudança</span>;
  const sobe = v.dir === 'up';
  const cor = sobe ? 'var(--danger)' : 'var(--ok)';
  const sinal = sobe ? '+' : '−';
  const abs = Math.abs(v.abs);
  return (
    <span style={{ color: cor, fontWeight: 800, display: 'inline-flex', alignItems: 'center', gap: 4 }}>
      <Icon name="arrow" style={{ width: 13, height: 13, transform: sobe ? 'rotate(-90deg)' : 'rotate(90deg)' }} />
      {sinal}
      {money ? formatBRL(abs).replace('R$', '').trim() : formatNumber(abs, 0)}
      {' · '}
      {sinal}
      {formatNumber(Math.abs(v.pct), 1)}%
    </span>
  );
}

async function baixar(path: string) {
  const url = await urlArquivoProposta(path);
  window.open(url, '_blank', 'noopener,noreferrer');
}

/** Menu de 3 pontinhos (editar / apagar) ao lado do nome do fornecedor. */
function PropMenu({
  onEditar,
  onApagar,
  apagando,
}: {
  onEditar: () => void;
  onApagar: () => void;
  apagando: boolean;
}) {
  const [aberto, setAberto] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!aberto) return;
    function onDoc(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setAberto(false);
    }
    function onEsc(e: KeyboardEvent) {
      if (e.key === 'Escape') setAberto(false);
    }
    document.addEventListener('mousedown', onDoc);
    document.addEventListener('keydown', onEsc);
    return () => {
      document.removeEventListener('mousedown', onDoc);
      document.removeEventListener('keydown', onEsc);
    };
  }, [aberto]);

  return (
    <div ref={ref} className="kebab-wrap">
      <button
        type="button"
        className="kebab"
        aria-label="Mais ações"
        aria-haspopup="menu"
        aria-expanded={aberto}
        onClick={() => setAberto((v) => !v)}
      >
        <Icon name="dots" />
      </button>
      {aberto && (
        <div className="kebab-menu" role="menu">
          <button
            type="button"
            className="kebab-item"
            role="menuitem"
            onClick={() => {
              setAberto(false);
              onEditar();
            }}
          >
            <Icon name="pencil" />
            Editar dados
          </button>
          <button
            type="button"
            className="kebab-item danger"
            role="menuitem"
            disabled={apagando}
            onClick={() => {
              setAberto(false);
              onApagar();
            }}
          >
            <Icon name="trash" />
            {apagando ? 'Apagando…' : 'Apagar proposta'}
          </button>
        </div>
      )}
    </div>
  );
}

export function PropostaScreen() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { data, isLoading, isError } = useProposta(id);
  const [modo, setModo] = useState<'ver' | 'nova' | 'editar'>('ver');
  const definir = useDefinirVencedora();
  const criarContrato = useCriarContrato();
  const apagar = useApagarProposta();
  const toast = useToast();
  const qc = useQueryClient();
  // Exclusão só depois de confirmar no modal (e ainda com Desfazer no toast).
  const [confirmando, setConfirmando] = useState(false);
  // Versão aberta no drawer de detalhes (n), ou null.
  const [versaoAberta, setVersaoAberta] = useState<number | null>(null);

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
  if (isError || !data) {
    return (
      <>
        <div className="crumb">
          <button onClick={() => navigate('/propostas')}>Propostas</button>
          <Icon name="chev" />
          <span>Proposta</span>
        </div>
        <div className="card empty">Proposta não encontrada.</div>
      </>
    );
  }

  const label = PROPOSTA_LABEL[data.status];

  async function marcarVencedora() {
    if (!data) return;
    try {
      const anterior = await definir.mutateAsync(data.id);
      const propostaId = data.id;
      setVersaoAberta(null);
      toast('Definida como vencedora — tomada de preços adjudicada.', {
        actionLabel: 'Desfazer',
        // Raw + invalidação pelo queryClient global: sobrevive à navegação.
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

  async function gerarContrato() {
    if (!data) return;
    try {
      const contratoId = await criarContrato.mutateAsync(data.id);
      navigate(`/contratos/${contratoId}`);
    } catch {
      toast('Não foi possível gerar o contrato.');
    }
  }

  async function apagarEsta() {
    if (!data) return;
    const propostaId = data.id;
    const nome = nomeProposta(data.fornecedor, data.opcao);
    try {
      await apagar.mutateAsync(propostaId);
      setConfirmando(false);
      navigate('/propostas');
      // Desfazer sobrevive à navegação (chamada crua + invalidação global).
      toast(`Proposta de ${nome} excluída.`, {
        actionLabel: 'Desfazer',
        onAction: async () => {
          try {
            await restaurarProposta(propostaId);
            invalidarVencedora(qc);
          } catch {
            toast('Não foi possível restaurar a proposta.');
          }
        },
      });
    } catch (e) {
      setConfirmando(false);
      toast(e instanceof Error ? e.message : 'Não foi possível apagar a proposta.');
    }
  }

  return (
    <>
      <div className="crumb">
        <button onClick={() => navigate('/propostas')}>Propostas</button>
        <Icon name="chev" />
        <span>{nomeProposta(data.fornecedor, data.opcao)}</span>
      </div>

      <div className="page-head prop-head">
        <div style={{ minWidth: 0 }}>
          <h1>{data.fornecedor}</h1>
          <p className="lead">
            {data.opcao ? `${data.opcao} · ` : ''}
            {data.categoria} · {data.obraNome}
          </p>
        </div>
        {modo === 'ver' && (
          <PropMenu
            apagando={apagar.isPending}
            onEditar={() => setModo('editar')}
            onApagar={() => setConfirmando(true)}
          />
        )}
      </div>

      <ConfirmDialog
        aberto={confirmando}
        titulo={`Apagar a proposta de ${nomeProposta(data.fornecedor, data.opcao)}?`}
        confirmarLabel="Apagar proposta"
        ocupado={apagar.isPending}
        onConfirmar={apagarEsta}
        onCancelar={() => setConfirmando(false)}
      >
        Ela sai do acervo e da equalização. Você ainda pode desfazer por alguns segundos.
      </ConfirmDialog>

      {/* Linha de status: o essencial fica à vista sem cartão de resumo. */}
      <div className="prop-status">
        <span className={`pill ${label.tom}`}>
          <span className={`dot ${label.tom}`} />
          {label.texto}
        </span>
        <span className="vcur">versão {data.versaoAtual} · atual</span>
        <span className="val">{data.valorAtual != null ? formatBRL(data.valorAtual) : '—'}</span>
      </div>

      {modo === 'ver' ? (
        <>
          <Versoes
            proposta={data}
            aberta={versaoAberta}
            onAbrir={setVersaoAberta}
            onNovaVersao={() => setModo('nova')}
            onVencedora={marcarVencedora}
            definindo={definir.isPending}
            onContrato={gerarContrato}
            gerando={criarContrato.isPending}
          />
          {data.versoes.length >= 2 && <Comparar versoes={data.versoes} />}
        </>
      ) : modo === 'editar' ? (
        <EditarProposta
          proposta={data}
          onPronto={() => setModo('ver')}
          onCancelar={() => setModo('ver')}
        />
      ) : (
        <NovaVersao
          propostaId={data.id}
          onPronto={() => setModo('ver')}
          onCancelar={() => setModo('ver')}
        />
      )}
    </>
  );
}

/* ---------- Versões: lista clicável + drawer de detalhes ---------- */

/** Variação de valor de uma versão em relação à anterior (lista é desc). */
function variacaoAnterior(versoes: VersaoDetalhe[], i: number): Variacao | null {
  const v = versoes[i];
  const ant = versoes[i + 1];
  return v && ant && v.valor != null && ant.valor != null ? variacao(ant.valor, v.valor) : null;
}

function Versoes({
  proposta,
  aberta,
  onAbrir,
  onNovaVersao,
  onVencedora,
  definindo,
  onContrato,
  gerando,
}: {
  proposta: PropostaDetalhe;
  aberta: number | null;
  onAbrir: (n: number | null) => void;
  onNovaVersao: () => void;
  onVencedora: () => void;
  definindo: boolean;
  onContrato: () => void;
  gerando: boolean;
}) {
  const { versoes } = proposta;
  const idx = aberta === null ? -1 : versoes.findIndex((v) => v.n === aberta);
  const v = idx >= 0 ? versoes[idx] : undefined;
  const dv = idx >= 0 ? variacaoAnterior(versoes, idx) : null;
  const ehAtual = idx === 0;

  return (
    <>
      <div className="section-title">
        <h2>Versões</h2>
        <button type="button" className="mini" onClick={onNovaVersao}>
          <Icon name="plus" />
          Nova versão
        </button>
      </div>
      <div className="card rowlist">
        {versoes.map((ver, i) => {
          const d = variacaoAnterior(versoes, i);
          return (
            <button
              key={ver.id}
              type="button"
              className="row"
              onClick={() => onAbrir(ver.n)}
              aria-label={`Ver detalhes da versão ${ver.n}`}
            >
              <span className="vn">v{ver.n}</span>
              <span className="tt">
                <span className="t1">
                  Versão {ver.n}
                  {i === 0 && <span className="tag">Atual</span>}
                </span>
                <span className="t2">
                  {formatNumeric(ver.data)}
                  {ver.prazo != null ? ` · ${ver.prazo} dias` : ''}
                </span>
              </span>
              <span className="rt">
                <span className="v">{ver.valor != null ? formatBRL(ver.valor) : '—'}</span>
                {d && d.dir !== 'flat' && (
                  <span className={`d delta ${d.dir === 'up' ? 'up' : 'down'}`}>
                    {d.dir === 'up' ? '↑ +' : '↓ −'}
                    {formatNumber(Math.abs(d.pct), 1)}%
                  </span>
                )}
              </span>
              <span className="chev">
                <Icon name="chev" />
              </span>
            </button>
          );
        })}
      </div>

      <Drawer
        aberto={v !== undefined}
        onFechar={() => onAbrir(null)}
        titulo={
          <>
            Versão {v?.n}
            {ehAtual && <span className="tag" style={{ marginLeft: 8, fontSize: 10.5, fontWeight: 800, padding: '2px 7px', borderRadius: 999, background: 'var(--accent-soft)', color: 'var(--accent-deep)', verticalAlign: 2 }}>Atual</span>}
          </>
        }
        subtitulo={
          v && (
            <>
              {formatNumeric(v.data)}
              {dv && dv.dir !== 'flat' && (
                <>
                  {' · '}
                  <span className={`delta ${dv.dir === 'up' ? 'up' : 'down'}`}>
                    {dv.dir === 'up' ? '↑ +' : '↓ −'}
                    {formatNumber(Math.abs(dv.pct), 1)}% sobre a v{versoes[idx + 1]?.n}
                  </span>
                </>
              )}
            </>
          )
        }
        rodape={
          ehAtual ? (
            proposta.status !== 'vencedora' ? (
              <>
                <Button block icon="trophy" disabled={definindo} onClick={onVencedora}>
                  {definindo ? 'Definindo…' : 'Definir como vencedora'}
                </Button>
                <span className="hint">Adjudica a tomada de preços e libera o contrato. Dá para desfazer.</span>
              </>
            ) : (
              <Button block icon="tab-contratos" disabled={gerando} onClick={onContrato}>
                {gerando ? 'Gerando…' : 'Gerar contrato'}
              </Button>
            )
          ) : (
            <span className="hint">Versão anterior — a que vale é a atual. Para revisar, use “Nova versão”.</span>
          )
        }
      >
        {v && (
          <>
            <p className="big">{v.valor != null ? formatBRL(v.valor) : '—'}</p>
            <div className="blk">
              <span className="k">Prazo</span>
              <div className="v">{v.prazo != null ? `${v.prazo} dias` : '—'}</div>
            </div>
            <div className="blk">
              <span className="k">Condição de pagamento</span>
              <div className="v">{v.condicao_pagamento || '—'}</div>
            </div>
            <div className="blk">
              <span className="k">Garantia</span>
              <div className="v">{v.garantia || '—'}</div>
            </div>
            {v.obs && (
              <div className="blk">
                <span className="k">Observações</span>
                <div className="v">{v.obs}</div>
              </div>
            )}
            {v.arquivo_path && (
              <div className="files">
                <div className="file">
                  <span className="fi">
                    {(v.arquivo_path.split('.').pop() || 'arq').toUpperCase().slice(0, 4)}
                  </span>
                  <span className="fn">
                    Arquivo da versão {v.n}
                    <small>{formatNumeric(v.data)}</small>
                  </span>
                  <Button
                    variant="ghost"
                    size="sm"
                    icon="dl"
                    aria-label={`Baixar arquivo da versão ${v.n}`}
                    onClick={() => baixar(v.arquivo_path as string)}
                  />
                </div>
              </div>
            )}
          </>
        )}
      </Drawer>
    </>
  );
}

/* ---------- Comparar duas versões (diff client-side) ---------- */

function Comparar({ versoes }: { versoes: VersaoDetalhe[] }) {
  const [aN, setAN] = useState(versoes[versoes.length - 1]!.n); // mais antiga
  const [bN, setBN] = useState(versoes[0]!.n); // mais nova
  const a = versoes.find((v) => v.n === aN);
  const b = versoes.find((v) => v.n === bN);

  const dv = a && b && a.valor != null && b.valor != null ? variacao(a.valor, b.valor) : null;
  const dp = a && b && a.prazo != null && b.prazo != null ? variacao(a.prazo, b.prazo) : null;

  return (
    <>
      <div className="section-title">
        <h2>Comparar versões</h2>
      </div>
      <div className="card">
        <div className="pair" style={{ marginBottom: 18 }}>
          <div className="field" style={{ margin: 0 }}>
            <label>De (base)</label>
            <select value={aN} onChange={(e) => setAN(Number(e.target.value))}>
              {versoes.map((v) => (
                <option key={v.id} value={v.n}>
                  v{v.n} · {formatNumeric(v.data)}
                </option>
              ))}
            </select>
          </div>
          <div className="field" style={{ margin: 0 }}>
            <label>Para</label>
            <select value={bN} onChange={(e) => setBN(Number(e.target.value))}>
              {versoes.map((v) => (
                <option key={v.id} value={v.n}>
                  v{v.n} · {formatNumeric(v.data)}
                </option>
              ))}
            </select>
          </div>
        </div>

        {a && b && aN !== bN ? (
          <div>
            <LinhaDiff rotulo="Valor" de={a.valor != null ? formatBRL(a.valor) : '—'} para={b.valor != null ? formatBRL(b.valor) : '—'} delta={dv ? <Delta v={dv} money /> : null} />
            <LinhaDiff rotulo="Prazo" de={a.prazo != null ? `${a.prazo} dias` : '—'} para={b.prazo != null ? `${b.prazo} dias` : '—'} delta={dp ? <Delta v={dp} /> : null} />
            <LinhaDiff rotulo="Pagamento" de={a.condicao_pagamento ?? '—'} para={b.condicao_pagamento ?? '—'} />
            <LinhaDiff rotulo="Garantia" de={a.garantia ?? '—'} para={b.garantia ?? '—'} />
          </div>
        ) : (
          <p className="lead" style={{ margin: 0 }}>
            Escolha duas versões diferentes para comparar.
          </p>
        )}
      </div>
    </>
  );
}

function LinhaDiff({
  rotulo,
  de,
  para,
  delta,
}: {
  rotulo: string;
  de: string;
  para: string;
  delta?: React.ReactNode;
}) {
  const mudou = de !== para;
  // Textos curtos: "antigo → novo" na mesma linha; longos: antigo riscado e o novo abaixo.
  const curto = de.length + para.length <= 44;
  return (
    <div className="blk">
      <span className="k">{rotulo}</span>
      {!mudou ? (
        <div className="v">{de}</div>
      ) : curto ? (
        <div className="v" style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
          <span className="old">{de}</span>
          <Icon name="arrow" style={{ width: 14, height: 14, color: 'var(--faint)' }} />
          <span>{para}</span>
        </div>
      ) : (
        <>
          <div className="v old">{de}</div>
          <div className="v">{para}</div>
        </>
      )}
      {delta && <div className="dlt">{delta}</div>}
    </div>
  );
}

/* ---------- Nova versão (upload → extração → conferência) ---------- */

/* ---------- Editar proposta (correção dos dados — não gera versão) ---------- */

function EditarProposta({
  proposta,
  onPronto,
  onCancelar,
}: {
  proposta: PropostaDetalhe;
  onPronto: () => void;
  onCancelar: () => void;
}) {
  const editar = useEditarProposta(proposta.id);
  const toast = useToast();
  const qc = useQueryClient();
  const categoriasSug = useSugestoes('categoria');
  const [categoria, setCategoria] = useState(proposta.categoria);
  const [movendo, setMovendo] = useState(false);
  const [fornecedor, setFornecedor] = useState(proposta.fornecedor);
  const [valor, setValor] = useState(
    proposta.valorAtual != null ? formatBRL(proposta.valorAtual).replace('R$', '').trim() : '',
  );
  const [prazo, setPrazo] = useState(proposta.prazoAtual != null ? String(proposta.prazoAtual) : '');
  const [pagamento, setPagamento] = useState(proposta.condicaoPagamento ?? '');
  const [garantia, setGarantia] = useState(proposta.garantia ?? '');
  const [obs, setObs] = useState(proposta.versoes[0]?.obs ?? '');
  const [erro, setErro] = useState<string | null>(null);

  async function salvar(e: FormEvent) {
    e.preventDefault();
    setErro(null);
    const nome = fornecedor.trim();
    if (!nome) {
      setErro('Informe o fornecedor.');
      return;
    }
    // Reaproveita a normalização do core (valor/prazo/texto) — regra #1.
    const limpos = normalizarExtracao({
      valor,
      prazo_dias: prazo,
      condicao_pagamento: pagamento,
      garantia,
      observacoes: obs,
      itens: [],
    });
    try {
      await editar.mutateAsync({
        propostaId: proposta.id,
        fornecedor: nome,
        valor: limpos.valor,
        prazo: limpos.prazo_dias,
        condicaoPagamento: limpos.condicao_pagamento,
        garantia: limpos.garantia,
        obs: limpos.observacoes,
      });
      // Categoria mudou? Move para a tomada de preços dessa categoria na obra.
      const novaCat = categoria.trim();
      if (novaCat && novaCat !== proposta.categoria) {
        setMovendo(true);
        try {
          await moverPropostaCategoria({ propostaId: proposta.id, categoria: novaCat });
          qc.invalidateQueries({ queryKey: ['proposta', proposta.id] });
          qc.invalidateQueries({ queryKey: ['acervo'] });
          qc.invalidateQueries({ queryKey: ['obra'] });
          qc.invalidateQueries({ queryKey: ['obras'] });
          qc.invalidateQueries({ queryKey: ['equalizacoes'] });
          qc.invalidateQueries({ queryKey: ['sugestoes'] });
        } finally {
          setMovendo(false);
        }
      }
      toast('Proposta atualizada.');
      onPronto();
    } catch (err) {
      setErro(err instanceof Error ? err.message : 'Não foi possível salvar.');
    }
  }

  return (
    <form onSubmit={salvar}>
      <div className="section-title">
        <h2>Editar proposta</h2>
      </div>
      <p className="lead" style={{ marginTop: 0 }}>
        Corrija os dados da versão atual. Para registrar uma revisão com novo arquivo, use “Nova versão”.
      </p>
      <div className="field">
        <label htmlFor="ed-forn">Fornecedor</label>
        <input id="ed-forn" value={fornecedor} onChange={(e) => setFornecedor(e.target.value)} placeholder="Nome do fornecedor" />
      </div>
      <Autocomplete
        label="Categoria de serviço"
        placeholder="Ex.: Climatização"
        value={categoria}
        onChange={setCategoria}
        options={(categoriasSug.data ?? []).map((s) => s.texto)}
      />
      {categoria.trim() && categoria.trim() !== proposta.categoria && (
        <p className="field-help" style={{ margin: '-6px 0 14px' }}>
          A proposta vai para a tomada de preços “{categoria.trim()}” desta obra (criada se ainda não existir).
          Só propostas da mesma categoria entram juntas na equalização.
        </p>
      )}
      <div className="pair">
        <div className="field">
          <label>Valor (R$)</label>
          <input inputMode="decimal" value={valor} onChange={(e) => setValor(e.target.value)} placeholder="1.284.500,00" />
        </div>
        <div className="field">
          <label>Prazo (dias)</label>
          <input inputMode="numeric" value={prazo} onChange={(e) => setPrazo(e.target.value)} placeholder="95" />
        </div>
      </div>
      <div className="field">
        <label>Condição de pagamento</label>
        <input value={pagamento} onChange={(e) => setPagamento(e.target.value)} placeholder="30/40/30%" />
      </div>
      <div className="field">
        <label>Garantia</label>
        <input value={garantia} onChange={(e) => setGarantia(e.target.value)} placeholder="5 anos" />
      </div>
      <div className="field">
        <label>Observação</label>
        <textarea value={obs} onChange={(e) => setObs(e.target.value)} placeholder="Observação da versão atual…" />
      </div>

      {erro && (
        <div className="banner warn" role="alert" style={{ marginBottom: 14 }}>
          <Icon name="alert" />
          <span>{erro}</span>
        </div>
      )}

      <div className="pair">
        <Button type="button" variant="ghost" onClick={onCancelar}>
          Cancelar
        </Button>
        <Button type="submit" icon="check" disabled={editar.isPending || movendo || !fornecedor.trim()}>
          {editar.isPending || movendo ? 'Salvando…' : 'Salvar alterações'}
        </Button>
      </div>
    </form>
  );
}

function NovaVersao({
  propostaId,
  onPronto,
  onCancelar,
}: {
  propostaId: string;
  onPronto: () => void;
  onCancelar: () => void;
}) {
  const criar = useCriarVersao();
  const fileRef = useRef<HTMLInputElement>(null);
  const [etapa, setEtapa] = useState<'anexar' | 'lendo' | 'conferir'>('anexar');
  const [file, setFile] = useState<File | null>(null);
  const [arquivoPath, setArquivoPath] = useState<string | null>(null);
  const [erro, setErro] = useState<string | null>(null);

  const [valor, setValor] = useState('');
  const [prazo, setPrazo] = useState('');
  const [pagamento, setPagamento] = useState('');
  const [garantia, setGarantia] = useState('');
  const [obs, setObs] = useState('');
  // Itens extraídos (não editáveis aqui, mas preservados em dados_extraidos).
  const [itens, setItens] = useState<PropostaExtraida['itens']>([]);

  const ehPdf = !!file && (file.type === 'application/pdf' || file.name.toLowerCase().endsWith('.pdf'));

  function preencher(d: PropostaExtraida) {
    setValor(d.valor != null ? formatBRL(d.valor).replace('R$', '').trim() : '');
    setPrazo(d.prazo_dias != null ? String(d.prazo_dias) : '');
    setPagamento(d.condicao_pagamento ?? '');
    setGarantia(d.garantia ?? '');
    setObs(d.observacoes ?? '');
    setItens(d.itens);
  }

  async function anexar(e: FormEvent) {
    e.preventDefault();
    if (!file) return;
    setErro(null);

    // 1) Upload: se falhar, permanece em 'anexar' (não grava versão sem arquivo).
    let enviado: { path: string; ehPdf: boolean };
    try {
      enviado = await uploadPropostaArquivo(file);
      setArquivoPath(enviado.path);
    } catch (err) {
      setErro(err instanceof Error ? err.message : 'Não foi possível enviar o arquivo.');
      return;
    }

    // 2) Extração (só PDF): falha segue para conferência manual (arquivo já subiu).
    if (!enviado.ehPdf) {
      setEtapa('conferir');
      return;
    }
    setEtapa('lendo');
    try {
      preencher(await extrairProposta(enviado.path));
    } catch (err) {
      setErro(err instanceof Error ? err.message : 'A IA não conseguiu ler; confira manualmente.');
    }
    setEtapa('conferir');
  }

  async function salvar(e: FormEvent) {
    e.preventDefault();
    setErro(null);
    const limpos = normalizarExtracao({
      valor,
      prazo_dias: prazo,
      condicao_pagamento: pagamento,
      garantia,
      observacoes: obs,
      itens,
    });
    try {
      await criar.mutateAsync({ propostaId, dados: limpos, arquivoPath });
      onPronto();
    } catch (err) {
      setErro(err instanceof Error ? err.message : 'Não foi possível salvar a versão.');
    }
  }

  if (etapa === 'lendo') {
    return <LeituraIA primeiraEtapa="Lendo a nova versão…" />;
  }

  if (etapa === 'conferir') {
    return (
      <form onSubmit={salvar}>
        <div className="section-title">
          <h2>Conferir a nova versão</h2>
        </div>
        <div className="pair">
          <div className="field">
            <label>Valor (R$)</label>
            <input inputMode="decimal" value={valor} onChange={(e) => setValor(e.target.value)} placeholder="1.284.500,00" />
          </div>
          <div className="field">
            <label>Prazo (dias)</label>
            <input inputMode="numeric" value={prazo} onChange={(e) => setPrazo(e.target.value)} placeholder="95" />
          </div>
        </div>
        <div className="field">
          <label>Condição de pagamento</label>
          <input value={pagamento} onChange={(e) => setPagamento(e.target.value)} placeholder="30/40/30%" />
        </div>
        <div className="field">
          <label>Garantia</label>
          <input value={garantia} onChange={(e) => setGarantia(e.target.value)} placeholder="5 anos" />
        </div>
        <div className="field">
          <label>Observação da revisão</label>
          <textarea value={obs} onChange={(e) => setObs(e.target.value)} placeholder="O que mudou nesta versão…" />
        </div>

        {erro && (
          <div className="banner warn" role="alert" style={{ marginBottom: 14 }}>
            <Icon name="alert" />
            <span>{erro}</span>
          </div>
        )}

        <div className="pair">
          <Button type="button" variant="ghost" onClick={onCancelar}>
            Cancelar
          </Button>
          <Button type="submit" icon="check" disabled={criar.isPending}>
            {criar.isPending ? 'Salvando…' : 'Salvar versão'}
          </Button>
        </div>
      </form>
    );
  }

  return (
    <form onSubmit={anexar}>
      <div className="section-title">
        <h2>Nova versão</h2>
      </div>
      <div className="field">
        <label>Arquivo da revisão</label>
        <button type="button" className="dropzone" onClick={() => fileRef.current?.click()}>
          <Icon name={file ? 'doc' : 'upload'} />
          {file ? file.name : 'Toque para anexar (PDF, planilha ou imagem)'}
          <small>{file ? (ehPdf ? 'PDF — a IA vai ler os dados' : 'Neste formato você preenche à mão') : 'Máx. 8 MB'}</small>
        </button>
        <input
          ref={fileRef}
          type="file"
          accept=".pdf,.xlsx,.xls,.csv,image/png,image/jpeg"
          style={{ display: 'none' }}
          onChange={(e) => setFile(e.target.files?.[0] ?? null)}
        />
      </div>

      {erro && (
        <div className="banner warn" role="alert" style={{ marginBottom: 14 }}>
          <Icon name="alert" />
          <span>{erro}</span>
        </div>
      )}

      <div className="pair">
        <Button type="button" variant="ghost" onClick={onCancelar}>
          Cancelar
        </Button>
        <Button type="submit" icon={ehPdf ? 'spark' : 'arrow'} disabled={!file}>
          {ehPdf ? 'Ler com IA' : 'Anexar e conferir'}
        </Button>
      </div>
    </form>
  );
}
