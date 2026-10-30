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
import { useQueryClient } from '@tanstack/react-query';
import { Button, Icon } from '@bid/ui';
import {
  invalidarVencedora,
  useApagarProposta,
  useCriarContrato,
  useCriarVersao,
  useDefinirVencedora,
  useEditarProposta,
  useProposta,
} from '../data/hooks';
import { desfazerVencedora, extrairProposta, restaurarProposta, uploadPropostaArquivo } from '../data/mutations';
import { urlArquivoProposta, type PropostaDetalhe, type VersaoDetalhe } from '../data/queries';
import { useToast } from '../app/Toast';

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
  const [modo, setModo] = useState<'ver' | 'nova' | 'editar'>('ver');
  const definir = useDefinirVencedora();
  const criarContrato = useCriarContrato();
  const apagar = useApagarProposta();
  const toast = useToast();
  const qc = useQueryClient();

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
    const nome = data.fornecedor;
    try {
      await apagar.mutateAsync(propostaId);
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
      toast(e instanceof Error ? e.message : 'Não foi possível apagar a proposta.');
    }
  }

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

      <div className="card resumo-prop">
        <div className="resumo-top">
          <span className={`pill ${label.tom}`}>
            <span className={`dot ${label.tom}`} />
            {label.texto}
          </span>
          <span className="vbadge">versão {data.versaoAtual}</span>
        </div>
        <div className="resumo-valor">
          {data.valorAtual != null ? formatBRL(data.valorAtual) : '—'}
        </div>
        <div className="resumo-grid">
          <div>
            <span className="rk">Prazo</span>
            <span className="rv">{data.prazoAtual != null ? `${data.prazoAtual} dias` : '—'}</span>
          </div>
          <div>
            <span className="rk">Pagamento</span>
            <span className="rv">{data.condicaoPagamento || '—'}</span>
          </div>
          <div>
            <span className="rk">Garantia</span>
            <span className="rv">{data.garantia || '—'}</span>
          </div>
        </div>
      </div>

      {modo === 'ver' ? (
        <>
          <div className="acoes-prop">
            <Button block variant="soft" icon="upload" onClick={() => setModo('nova')}>
              Nova versão
            </Button>
            {data.status !== 'vencedora' && (
              <Button block icon="trophy" disabled={definir.isPending} onClick={marcarVencedora}>
                {definir.isPending ? 'Definindo…' : 'Definir vencedora'}
              </Button>
            )}
            {data.status === 'vencedora' && (
              <Button block icon="tab-contratos" disabled={criarContrato.isPending} onClick={gerarContrato}>
                {criarContrato.isPending ? 'Gerando…' : 'Gerar contrato'}
              </Button>
            )}
          </div>
          <div className="acoes-sec">
            <button type="button" className="linklike" onClick={() => setModo('editar')}>
              <Icon name="pencil" /> Editar dados
            </button>
            <button type="button" className="linklike danger" disabled={apagar.isPending} onClick={apagarEsta}>
              <Icon name="trash" /> {apagar.isPending ? 'Apagando…' : 'Apagar proposta'}
            </button>
          </div>
          <Timeline versoes={data.versoes} />
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

/* ---------- Linha do tempo das versões ---------- */

function Timeline({ versoes }: { versoes: VersaoDetalhe[] }) {
  return (
    <>
      <div className="section-title">
        <h2>Versões</h2>
        <span className="c">
          {versoes.length} {versoes.length > 1 ? 'revisões' : 'versão'}
        </span>
      </div>
      <div className="timeline">
        {versoes.map((v, i) => {
          const atual = i === 0; // lista é desc: a primeira é a mais nova
          const anterior = versoes[i + 1]; // o próximo é o mais antigo
          const dv =
            anterior && v.valor != null && anterior.valor != null ? variacao(anterior.valor, v.valor) : null;
          const ext = v.arquivo_path ? (v.arquivo_path.split('.').pop() || 'arq').toUpperCase().slice(0, 4) : '';
          return (
            <div key={v.id} className={`tl ${atual ? 'cur' : ''}`}>
              <div className="tdot">v{v.n}</div>
              <div className="tbody">
                <div className="th">
                  <b style={{ fontSize: 13.5 }}>Versão {v.n}</b>
                  {atual && <span className="pill aberta">Atual</span>}
                  <span className="d">{formatNumeric(v.data)}</span>
                </div>
                <div className="vls">
                  <div className="v">
                    Valor
                    <b>
                      {v.valor != null ? formatBRL(v.valor) : '—'}
                      {dv && dv.dir !== 'flat' && (
                        <span className={`delta ${dv.dir === 'up' ? 'up' : 'down'}`} style={{ fontSize: 11, marginLeft: 6 }}>
                          {dv.dir === 'up' ? '▲' : '▼'}
                          {formatBRL(Math.abs(dv.abs)).replace('R$', '').trim()}
                        </span>
                      )}
                    </b>
                  </div>
                  <div className="v">
                    Prazo<b>{v.prazo != null ? `${v.prazo} dias` : '—'}</b>
                  </div>
                </div>
                {v.obs && <div className="obs">{v.obs}</div>}
                {v.arquivo_path && (
                  <div className="files">
                    <div className="file">
                      <span className="fi">{ext}</span>
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
              </div>
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
        <Button type="submit" icon="check" disabled={editar.isPending || !fornecedor.trim()}>
          {editar.isPending ? 'Salvando…' : 'Salvar alterações'}
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
