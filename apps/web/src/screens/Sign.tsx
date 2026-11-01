import { useEffect, useRef, useState } from 'react';
import { useParams } from 'react-router-dom';
import { formatBRL, PARTE_LABEL, PARTE_V2_LABEL, type ParteAssinatura, type ParteV2 } from '@bid/core';
import { BrandLogo, Button, Icon } from '@bid/ui';
import { SignaturePad, type SignaturePadHandle } from '../components/SignaturePad';

interface Resumo {
  categoria: string;
  obra: string;
  valor: number | null;
  parte: ParteAssinatura | ParteV2;
  signatario: string | null;
  /** v2 (M13): contrato emitido, assinatura por signatário. */
  v2?: boolean;
  numero?: string | null;
  partes?: { contratante: string | null; contratada: string | null; construtora: string | null };
  pdfUrl?: string | null;
}

/** Página pública de assinatura por link (`/sign/:token`), sem login. */
export function SignScreen() {
  const { token } = useParams<{ token: string }>();
  const padRef = useRef<SignaturePadHandle>(null);
  const [fase, setFase] = useState<'carregando' | 'pronto' | 'assinando' | 'assinado' | 'erro'>('carregando');
  const [resumo, setResumo] = useState<Resumo | null>(null);
  const [nome, setNome] = useState('');
  const [erro, setErro] = useState<string | null>(null);

  useEffect(() => {
    let vivo = true;
    (async () => {
      try {
        const resp = await fetch(`/api/sign/${token}`);
        const corpo = await resp.json();
        if (!vivo) return;
        if (!resp.ok) {
          setErro(corpo?.erro ?? 'Link inválido.');
          setFase('erro');
          return;
        }
        setResumo(corpo as Resumo);
        setNome((corpo as Resumo).signatario ?? '');
        setFase('pronto');
      } catch {
        if (vivo) {
          setErro('Não foi possível carregar o documento.');
          setFase('erro');
        }
      }
    })();
    return () => {
      vivo = false;
    };
  }, [token]);

  async function assinar() {
    const png = padRef.current?.toPngBase64();
    if (!png) {
      setErro('Assine no quadro antes de confirmar.');
      return;
    }
    setErro(null);
    setFase('assinando');
    try {
      const resp = await fetch(`/api/sign/${token}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ pngBase64: png, signatarioNome: nome }),
      });
      const corpo = await resp.json().catch(() => null);
      if (!resp.ok) {
        setErro(corpo?.erro ?? 'Falha ao assinar.');
        setFase('pronto');
        return;
      }
      setFase('assinado');
    } catch {
      setErro('Falha ao assinar.');
      setFase('pronto');
    }
  }

  return (
    <div className="stage">
      <div className="device">
        <header className="topbar">
          <BrandLogo />
        </header>
        <main className="content">
          {fase === 'carregando' && (
            <div className="card">
              <div className="empty">
                <span className="thinking" aria-label="Carregando">
                  <i />
                  <i />
                  <i />
                </span>
              </div>
            </div>
          )}

          {fase === 'erro' && (
            <div className="banner warn" role="alert">
              <Icon name="alert" />
              <span>{erro}</span>
            </div>
          )}

          {fase === 'assinado' && (
            <div className="card" style={{ textAlign: 'center', padding: '40px 20px' }}>
              <div style={{ display: 'flex', justifyContent: 'center', marginBottom: 14 }}>
                <span className="ic" style={{ width: 66, height: 66, borderRadius: 20, background: 'var(--ok-soft)', color: 'var(--ok)' }}>
                  <Icon name="check" style={{ width: 32, height: 32 }} />
                </span>
              </div>
              <h1 style={{ fontSize: 20 }}>Assinatura concluída</h1>
              <p className="lead">O documento foi assinado e já aparece assinado no bid.</p>
            </div>
          )}

          {(fase === 'pronto' || fase === 'assinando') && resumo && (
            <>
              <div className="banner warn" role="status" style={{ marginBottom: 14 }}>
                <Icon name="alert" />
                <span>
                  Documento enviado pelo <strong>bid</strong> para sua assinatura.
                </span>
              </div>
              <div className="page-head">
                <h1>Assinar documento</h1>
                <p className="lead">
                  {resumo.numero ? `${resumo.numero} · ` : ''}{resumo.categoria} · {resumo.obra}
                  {resumo.valor != null ? ` · ${formatBRL(resumo.valor)}` : ''}
                </p>
              </div>
              {resumo.v2 && resumo.partes && (
                <div className="card flush doss" style={{ marginBottom: 14 }}>
                  <div className="dl"><span className="k">Contratante</span><span className="v">{resumo.partes.contratante ?? '—'}</span></div>
                  <div className="dl"><span className="k">Contratada</span><span className="v">{resumo.partes.contratada ?? '—'}</span></div>
                  <div className="dl"><span className="k">Construtora</span><span className="v">{resumo.partes.construtora ?? '—'}</span></div>
                </div>
              )}
              {resumo.v2 && resumo.pdfUrl && (
                <a className="link" href={resumo.pdfUrl} target="_blank" rel="noopener noreferrer" style={{ display: 'inline-flex', marginBottom: 14 }}>
                  <Icon name="doc" /> Ler o contrato (PDF)
                </a>
              )}
              <div className="card" style={{ marginBottom: 14 }}>
                <div style={{ fontSize: 12, fontWeight: 800, textTransform: 'uppercase', color: 'var(--muted)' }}>
                  Você assina como
                </div>
                <div style={{ fontWeight: 900, fontSize: 15 }}>{resumo.v2 ? `${resumo.signatario ?? ''} · ${PARTE_V2_LABEL[resumo.parte as ParteV2]}` : PARTE_LABEL[resumo.parte as ParteAssinatura]}</div>
              </div>

              {!resumo.v2 && (
              <div className="field">
                <label>Seu nome</label>
                <input value={nome} onChange={(e) => setNome(e.target.value)} placeholder="Nome de quem assina" />
              </div>
              )}

              <div className="field">
                <label>Assinatura</label>
                <SignaturePad ref={padRef} />
              </div>

              {erro && (
                <div className="banner warn" role="alert" style={{ marginBottom: 14 }}>
                  <Icon name="alert" />
                  <span>{erro}</span>
                </div>
              )}

              <Button block icon="check" disabled={fase === 'assinando' || (!resumo.v2 && !nome.trim())} onClick={assinar}>
                {fase === 'assinando' ? 'Assinando…' : 'Assinar documento'}
              </Button>
            </>
          )}
        </main>
      </div>
    </div>
  );
}
