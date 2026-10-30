import { useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import {
  CONTRATO_LABEL,
  PARTES,
  PARTE_LABEL,
  formatBRL,
  formatNumeric,
  linkWhatsApp,
} from '@bid/core';
import { Button, Icon } from '@bid/ui';
import {
  useAssinarApp,
  useAssinaturas,
  useAtualizarClausula,
  useContrato,
  useContratos,
  useCriarContrato,
  useGerarPdf,
  useVencedoras,
} from '../data/hooks';
import { gerarTokenAssinatura } from '../data/mutations';
import { urlContratoPdf } from '../data/queries';
import { SignaturePad, type SignaturePadHandle } from '../components/SignaturePad';
import { useToast } from '../app/Toast';

/* ---------- Lista ---------- */

export function ContratosScreen() {
  const navigate = useNavigate();
  const { data, isLoading, isError } = useContratos();
  const contratos = data ?? [];

  return (
    <>
      <div className="page-head">
        <h1>Contratos</h1>
        <p className="lead">A vencedora vira contrato — toque em + para gerar um novo.</p>
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
          <span>Não foi possível carregar os contratos.</span>
        </div>
      ) : contratos.length === 0 ? (
        <div className="card empty">Nenhum contrato ainda. Toque em + para gerar de uma vencedora.</div>
      ) : (
        <div className="card rowlist">
          {contratos.map((c) => {
            const label = CONTRATO_LABEL[c.status];
            return (
              <div
                key={c.id}
                className="row"
                role="button"
                tabIndex={0}
                style={{ cursor: 'pointer' }}
                onClick={() => navigate(`/contratos/${c.id}`)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault();
                    navigate(`/contratos/${c.id}`);
                  }
                }}
              >
                <span className="ic">
                  <Icon name="doc" />
                </span>
                <span className="tt">
                  <span className="t1">{c.categoria}</span>
                  <span className="t2">
                    {c.obraNome}
                    {c.temPdf ? ' · PDF pronto' : ''}
                  </span>
                </span>
                <span className="rt">
                  {c.valor != null && <span className="v">{formatBRL(c.valor)}</span>}
                  <span className={`pill ${label.tom}`}>
                    <span className={`dot ${label.tom}`} />
                    {label.texto}
                  </span>
                </span>
                <span className="chev">
                  <Icon name="chev" />
                </span>
              </div>
            );
          })}
        </div>
      )}
    </>
  );
}

/* ---------- Novo contrato (escolher vencedora) ---------- */

export function NovoContratoScreen() {
  const navigate = useNavigate();
  const { data, isLoading } = useVencedoras();
  const criar = useCriarContrato();
  const toast = useToast();
  const vencedoras = data ?? [];

  async function gerar(propostaId: string) {
    try {
      const id = await criar.mutateAsync(propostaId);
      navigate(`/contratos/${id}`);
    } catch {
      toast('Não foi possível criar o contrato.');
    }
  }

  return (
    <>
      <div className="crumb">
        <button onClick={() => navigate('/contratos')}>Contratos</button>
        <Icon name="chev" />
        <span>Novo</span>
      </div>
      <div className="page-head">
        <h1>Novo contrato</h1>
        <p className="lead">Escolha a proposta vencedora que vira contrato.</p>
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
      ) : vencedoras.length === 0 ? (
        <div className="card empty">Nenhuma proposta vencedora ainda. Adjudique uma tomada de preços primeiro.</div>
      ) : (
        <div className="card rowlist">
          {vencedoras.map((v) => (
            <div key={v.id} className="row">
              <span className="ic" style={{ background: 'var(--ok-soft)', color: 'var(--ok)' }}>
                <Icon name="trophy" />
              </span>
              <span className="tt">
                <span className="t1">{v.fornecedor}</span>
                <span className="t2">
                  {v.categoria} · {v.obraNome}
                </span>
              </span>
              <span className="rt">
                <Button size="sm" disabled={criar.isPending} onClick={() => gerar(v.id)}>
                  Gerar
                </Button>
              </span>
            </div>
          ))}
        </div>
      )}
    </>
  );
}

/* ---------- Detalhe do contrato ---------- */

export function ContratoScreen() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { data, isLoading, isError } = useContrato(id);
  const atualizar = useAtualizarClausula(id ?? '');
  const gerarPdf = useGerarPdf(id ?? '');
  const toast = useToast();
  const [editando, setEditando] = useState<string | null>(null);
  const [rascunho, setRascunho] = useState('');
  const [pdfDefasado, setPdfDefasado] = useState(false);

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
          <button onClick={() => navigate('/contratos')}>Contratos</button>
          <Icon name="chev" />
          <span>Contrato</span>
        </div>
        <div className="card empty">Contrato não encontrado.</div>
      </>
    );
  }

  const label = CONTRATO_LABEL[data.status];

  async function salvarClausula(clausulaId: string) {
    try {
      await atualizar.mutateAsync({ clausulaId, texto: rascunho });
      setEditando(null);
      if (data?.pdfPath) setPdfDefasado(true);
    } catch {
      toast('Não foi possível salvar a cláusula.');
    }
  }

  async function gerar() {
    try {
      await gerarPdf.mutateAsync();
      setPdfDefasado(false);
      toast('PDF gerado.');
    } catch (err) {
      toast(err instanceof Error ? err.message : 'Falha ao gerar o PDF.');
    }
  }

  async function baixar() {
    if (!data?.pdfPath) return;
    try {
      const url = await urlContratoPdf(data.pdfPath);
      window.open(url, '_blank', 'noopener,noreferrer');
    } catch {
      toast('Não foi possível abrir o PDF.');
    }
  }

  return (
    <>
      <div className="crumb">
        <button onClick={() => navigate('/contratos')}>Contratos</button>
        <Icon name="chev" />
        <span>{data.categoria}</span>
      </div>
      <div className="page-head">
        <h1>{data.categoria}</h1>
        <p className="lead">{data.obraNome}</p>
      </div>

      <div className="card" style={{ marginBottom: 14 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 10 }}>
          <span className={`pill ${label.tom}`}>
            <span className={`dot ${label.tom}`} />
            {label.texto}
          </span>
          <strong style={{ fontSize: 18, fontWeight: 900 }}>
            {data.valor != null ? formatBRL(data.valor) : '—'}
          </strong>
        </div>
        <div style={{ display: 'flex', gap: 8, marginTop: 12, flexWrap: 'wrap' }}>
          <Button icon="doc" disabled={gerarPdf.isPending} onClick={gerar}>
            {gerarPdf.isPending ? 'Gerando…' : data.pdfPath ? 'Regerar PDF' : 'Gerar PDF'}
          </Button>
          {data.pdfPath && (
            <Button variant="soft" icon="dl" onClick={baixar}>
              Baixar PDF{data.paginas ? ` (~${data.paginas}p)` : ''}
            </Button>
          )}
        </div>
        {pdfDefasado && (
          <div className="banner warn" role="status" style={{ marginTop: 10 }}>
            <Icon name="alert" />
            <span>Você editou cláusulas — gere o PDF de novo para atualizá-lo.</span>
          </div>
        )}
      </div>

      <div className="section-title">
        <h2>Cláusulas</h2>
        <span className="c">{data.clausulas.length}</span>
      </div>
      <div className="card" style={{ display: 'grid', gap: 14 }}>
        {data.clausulas.map((cl) => (
          <div key={cl.id}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 8 }}>
              <strong style={{ fontSize: 13 }}>
                Cláusula {cl.numero}ª — {cl.titulo}
              </strong>
              {editando !== cl.id && (
                <button
                  type="button"
                  onClick={() => {
                    setEditando(cl.id);
                    setRascunho(cl.texto);
                  }}
                  style={{ border: 0, background: 'none', color: 'var(--accent-ink)', fontWeight: 800, cursor: 'pointer', fontSize: 12 }}
                >
                  Editar
                </button>
              )}
            </div>
            {editando === cl.id ? (
              <div className="field" style={{ margin: '6px 0 0' }}>
                <textarea value={rascunho} onChange={(e) => setRascunho(e.target.value)} style={{ minHeight: 96 }} />
                <div className="pair" style={{ marginTop: 8 }}>
                  <Button type="button" variant="ghost" size="sm" onClick={() => setEditando(null)}>
                    Cancelar
                  </Button>
                  <Button type="button" size="sm" icon="check" disabled={atualizar.isPending} onClick={() => salvarClausula(cl.id)}>
                    Salvar
                  </Button>
                </div>
              </div>
            ) : (
              <p style={{ margin: '4px 0 0', fontSize: 13, fontWeight: 500, lineHeight: 1.5, textAlign: 'justify' }}>
                {cl.texto}
              </p>
            )}
          </div>
        ))}
      </div>

      {data.pdfPath && <Assinaturas contratoId={data.id} />}
    </>
  );
}

/* ---------- Assinaturas (status + assinar no app + enviar link) ---------- */

function Assinaturas({ contratoId }: { contratoId: string }) {
  const { data } = useAssinaturas(contratoId);
  const assinar = useAssinarApp(contratoId);
  const toast = useToast();
  const padRef = useRef<SignaturePadHandle>(null);
  const [assinandoApp, setAssinandoApp] = useState(false);
  const [nome, setNome] = useState('');

  const linhas = data ?? [];
  function estado(parte: 'contratante' | 'contratada') {
    return linhas.find((l) => l.parte === parte);
  }

  async function confirmarApp() {
    const png = padRef.current?.toPngBase64();
    if (!png) {
      toast('Assine no quadro antes de confirmar.');
      return;
    }
    try {
      await assinar.mutateAsync({ contratoId, parte: 'contratante', signatarioNome: nome, pngBase64: png });
      setAssinandoApp(false);
      setNome('');
      toast('Assinatura registrada.');
    } catch (e) {
      toast(e instanceof Error ? e.message : 'Falha ao assinar.');
    }
  }

  async function enviarLink() {
    const signatario = window.prompt('Nome de quem vai assinar (contratada/fornecedor):') ?? '';
    try {
      const token = await gerarTokenAssinatura({ contratoId, parte: 'contratada', signatario });
      const url = `${window.location.origin}/sign/${token}`;
      window.open(linkWhatsApp(url, 'Assine o contrato:'), '_blank', 'noopener,noreferrer');
    } catch (e) {
      toast(e instanceof Error ? e.message : 'Não foi possível gerar o link.');
    }
  }

  return (
    <>
      <div className="section-title">
        <h2>Assinaturas</h2>
      </div>
      <div className="card" style={{ display: 'grid', gap: 12 }}>
        {PARTES.map((parte) => {
          const a = estado(parte);
          const assinado = Boolean(a?.assinadoEm);
          return (
            <div key={parte} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 10 }}>
              <span>
                <strong style={{ fontSize: 13 }}>{PARTE_LABEL[parte]}</strong>
                <span style={{ display: 'block', fontSize: 12, color: 'var(--muted)', fontWeight: 600 }}>
                  {assinado
                    ? `Assinou em ${formatNumeric((a?.assinadoEm ?? '').slice(0, 10))}${a?.via === 'link' ? ' (link)' : ''}`
                    : 'Pendente'}
                </span>
              </span>
              {assinado ? (
                <span className="pill adjudicada">
                  <Icon name="check" style={{ width: 13, height: 13 }} />
                  Assinado
                </span>
              ) : parte === 'contratante' ? (
                <Button size="sm" icon="link" onClick={() => setAssinandoApp((v) => !v)}>
                  Assinar no app
                </Button>
              ) : (
                <Button size="sm" variant="soft" icon="link" onClick={enviarLink}>
                  Enviar link
                </Button>
              )}
            </div>
          );
        })}

        {assinandoApp && (
          <div style={{ borderTop: '1px solid var(--line)', paddingTop: 12 }}>
            <div className="field">
              <label>Seu nome (contratante)</label>
              <input value={nome} onChange={(e) => setNome(e.target.value)} placeholder="Quem assina pela contratante" />
            </div>
            <div className="field">
              <label>Assinatura</label>
              <SignaturePad ref={padRef} />
            </div>
            <div className="pair">
              <Button type="button" variant="ghost" onClick={() => setAssinandoApp(false)}>
                Cancelar
              </Button>
              <Button type="button" icon="check" disabled={assinar.isPending || !nome.trim()} onClick={confirmarApp}>
                {assinar.isPending ? 'Assinando…' : 'Assinar'}
              </Button>
            </div>
          </div>
        )}
      </div>
    </>
  );
}
