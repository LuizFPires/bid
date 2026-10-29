import { useRef, useState, type FormEvent } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import {
  formatBRL,
  formatNumber,
  formatNumeric,
  normalizarExtracao,
  variacao,
  PROPOSTA_LABEL,
  type PropostaExtraida,
  type Variacao,
} from '@bid/core';
import { Button, Icon } from '@bid/ui';
import { useCriarVersao, useProposta } from '../data/hooks';
import { extrairProposta, uploadPropostaArquivo } from '../data/mutations';
import { urlArquivoProposta, type VersaoDetalhe } from '../data/queries';

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

export function PropostaScreen() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { data, isLoading, isError } = useProposta(id);
  const [modo, setModo] = useState<'ver' | 'nova'>('ver');

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

  return (
    <>
      <div className="crumb">
        <button onClick={() => navigate('/propostas')}>Propostas</button>
        <Icon name="chev" />
        <span>{data.fornecedor}</span>
      </div>

      <div className="page-head">
        <h1>{data.fornecedor}</h1>
        <p className="lead">
          {data.categoria} · {data.obraNome}
        </p>
      </div>

      <div className="card" style={{ marginBottom: 14 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 10 }}>
          <span className={`pill ${label.tom}`}>
            <span className={`dot ${label.tom}`} />
            {label.texto}
          </span>
          <strong style={{ fontSize: 20, fontWeight: 900 }}>
            {data.valorAtual != null ? formatBRL(data.valorAtual) : '—'}
          </strong>
        </div>
        <div style={{ marginTop: 10, color: 'var(--muted)', fontSize: 13, fontWeight: 700 }}>
          {data.prazoAtual != null ? `${data.prazoAtual} dias` : 'prazo —'}
          {data.condicaoPagamento ? ` · ${data.condicaoPagamento}` : ''}
          {data.garantia ? ` · garantia ${data.garantia}` : ''}
          {` · v${data.versaoAtual}`}
        </div>
      </div>

      {modo === 'ver' ? (
        <>
          <div style={{ marginBottom: 14 }}>
            <Button variant="soft" icon="layers" onClick={() => setModo('nova')}>
              Revisar (nova versão)
            </Button>
          </div>
          <Timeline versoes={data.versoes} />
          {data.versoes.length >= 2 && <Comparar versoes={data.versoes} />}
        </>
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

/* ---------- Linha do tempo das versões ---------- */

function Timeline({ versoes }: { versoes: VersaoDetalhe[] }) {
  return (
    <>
      <div className="section-title">
        <h2>Histórico</h2>
        <span className="c">
          {versoes.length} {versoes.length === 1 ? 'versão' : 'versões'}
        </span>
      </div>
      <div className="card rowlist">
        {versoes.map((v, i) => {
          const anterior = versoes[i + 1]; // lista é desc: o próximo é o mais antigo
          const dv = anterior && v.valor != null && anterior.valor != null ? variacao(anterior.valor, v.valor) : null;
          const dp = anterior && v.prazo != null && anterior.prazo != null ? variacao(anterior.prazo, v.prazo) : null;
          return (
            <div key={v.id} className="row" style={{ alignItems: 'flex-start' }}>
              <span className="ic">
                <span style={{ fontWeight: 900, fontSize: 13 }}>v{v.n}</span>
              </span>
              <span className="tt">
                <span className="t1">
                  {v.valor != null ? formatBRL(v.valor) : '—'}
                  {v.prazo != null ? ` · ${v.prazo} dias` : ''}
                </span>
                <span className="t2">{formatNumeric(v.data)}</span>
                {(dv || dp) && (
                  <span className="t2" style={{ marginTop: 4, display: 'flex', gap: 12, flexWrap: 'wrap' }}>
                    {dv && (
                      <span>
                        valor <Delta v={dv} money />
                      </span>
                    )}
                    {dp && (
                      <span>
                        prazo <Delta v={dp} />
                      </span>
                    )}
                  </span>
                )}
                {v.obs && (
                  <span className="t2" style={{ marginTop: 4, fontWeight: 600 }}>
                    {v.obs}
                  </span>
                )}
              </span>
              <span className="rt">
                {v.arquivo_path && (
                  <button
                    className="ticon"
                    type="button"
                    aria-label={`Baixar arquivo da versão ${v.n}`}
                    onClick={() => baixar(v.arquivo_path as string)}
                  >
                    <Icon name="dl" />
                  </button>
                )}
              </span>
            </div>
          );
        })}
      </div>
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
        <div className="pair" style={{ marginBottom: 12 }}>
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
          <ul style={{ listStyle: 'none', margin: 0, padding: 0, display: 'grid', gap: 10 }}>
            <LinhaDiff rotulo="Valor" de={a.valor != null ? formatBRL(a.valor) : '—'} para={b.valor != null ? formatBRL(b.valor) : '—'} delta={dv ? <Delta v={dv} money /> : null} />
            <LinhaDiff rotulo="Prazo" de={a.prazo != null ? `${a.prazo} dias` : '—'} para={b.prazo != null ? `${b.prazo} dias` : '—'} delta={dp ? <Delta v={dp} /> : null} />
            <LinhaDiff rotulo="Pagamento" de={a.condicao_pagamento ?? '—'} para={b.condicao_pagamento ?? '—'} />
            <LinhaDiff rotulo="Garantia" de={a.garantia ?? '—'} para={b.garantia ?? '—'} />
          </ul>
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
  return (
    <li>
      <div style={{ fontSize: 11, fontWeight: 800, textTransform: 'uppercase', color: 'var(--muted)', marginBottom: 3 }}>
        {rotulo}
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', fontWeight: 700, fontSize: 14 }}>
        <span style={{ color: mudou ? 'var(--faint)' : 'var(--ink)' }}>{de}</span>
        {mudou && (
          <>
            <Icon name="arrow" style={{ width: 14, height: 14, color: 'var(--faint)' }} />
            <span>{para}</span>
          </>
        )}
        {delta && <span style={{ marginLeft: 'auto' }}>{delta}</span>}
      </div>
    </li>
  );
}

/* ---------- Nova versão (upload → extração → conferência) ---------- */

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

  const ehPdf = !!file && (file.type === 'application/pdf' || file.name.toLowerCase().endsWith('.pdf'));

  function preencher(d: PropostaExtraida) {
    setValor(d.valor != null ? formatBRL(d.valor).replace('R$', '').trim() : '');
    setPrazo(d.prazo_dias != null ? String(d.prazo_dias) : '');
    setPagamento(d.condicao_pagamento ?? '');
    setGarantia(d.garantia ?? '');
    setObs(d.observacoes ?? '');
  }

  async function anexar(e: FormEvent) {
    e.preventDefault();
    if (!file) return;
    setErro(null);
    try {
      const enviado = await uploadPropostaArquivo(file);
      setArquivoPath(enviado.path);
      if (enviado.ehPdf) {
        setEtapa('lendo');
        preencher(await extrairProposta(enviado.path));
      }
      setEtapa('conferir');
    } catch (err) {
      setErro(err instanceof Error ? err.message : 'Falha ao preparar a versão.');
      setEtapa('conferir');
    }
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
      itens: [],
    });
    try {
      await criar.mutateAsync({ propostaId, dados: limpos, arquivoPath });
      onPronto();
    } catch (err) {
      setErro(err instanceof Error ? err.message : 'Não foi possível salvar a versão.');
    }
  }

  if (etapa === 'lendo') {
    return (
      <div className="card" style={{ textAlign: 'center', padding: '34px 20px' }}>
        <div style={{ display: 'flex', justifyContent: 'center', marginBottom: 12 }}>
          <span className="thinking" aria-label="Lendo a proposta">
            <i />
            <i />
            <i />
          </span>
        </div>
        <p className="lead" style={{ margin: 0 }}>
          Lendo o arquivo da nova versão…
        </p>
      </div>
    );
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
