import { useEffect, useRef, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { useQueryClient } from '@tanstack/react-query';
import { CERTAME_LABEL, type CertameStatus } from '@bid/core';
import { Icon, iconeCategoria } from '@bid/ui';
import { useApagarObra, useObra } from '../data/hooks';
import { restaurarObra } from '../data/mutations';
import { useToast } from '../app/Toast';

/** Menu de 3 pontinhos da obra (apagar). */
function ObraMenu({ onApagar, apagando }: { onApagar: () => void; apagando: boolean }) {
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
            className="kebab-item danger"
            role="menuitem"
            disabled={apagando}
            onClick={() => {
              setAberto(false);
              onApagar();
            }}
          >
            <Icon name="trash" />
            {apagando ? 'Apagando…' : 'Apagar obra'}
          </button>
        </div>
      )}
    </div>
  );
}

export function ObraScreen() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { data, isLoading, isError } = useObra(id);
  const apagar = useApagarObra();
  const toast = useToast();
  const qc = useQueryClient();

  async function apagarEsta(obraId: string, nome: string) {
    try {
      await apagar.mutateAsync(obraId);
      navigate('/obras');
      toast(`Obra "${nome}" excluída.`, {
        actionLabel: 'Desfazer',
        onAction: async () => {
          try {
            await restaurarObra(obraId);
            qc.invalidateQueries({ queryKey: ['obras'] });
            qc.invalidateQueries({ queryKey: ['obra'] });
          } catch {
            toast('Não foi possível restaurar a obra.');
          }
        },
      });
    } catch (e) {
      toast(e instanceof Error ? e.message : 'Não foi possível apagar a obra.');
    }
  }

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
          <Link to="/obras">Obras</Link>
          <Icon name="chev" />
          <span>Obra</span>
        </div>
        <div className="card empty">Obra não encontrada.</div>
      </>
    );
  }

  const { obra, certames } = data;

  return (
    <>
      <div className="crumb">
        <button onClick={() => navigate('/obras')}>Obras</button>
        <Icon name="chev" />
        <span>{obra.nome}</span>
      </div>
      <div className="page-head prop-head">
        <div style={{ minWidth: 0 }}>
          <h1>{obra.nome}</h1>
          <p className="lead">
            {obra.cidade ?? '—'} · {certames.length}{' '}
            {certames.length === 1 ? 'tomada de preços' : 'tomadas de preços'}
          </p>
        </div>
        <ObraMenu apagando={apagar.isPending} onApagar={() => apagarEsta(obra.id, obra.nome)} />
      </div>

      {certames.length === 0 ? (
        <div className="card empty">Nenhuma tomada de preços nesta obra ainda.</div>
      ) : (
        <div className="card rowlist">
          {certames.map((c) => {
            const label = CERTAME_LABEL[c.status as CertameStatus] ?? { texto: c.status, tom: 'neutro' as const };
            return (
              <div key={c.id} className="row">
                <span className="ic">
                  <Icon name={c.vencedoraFornecedor ? 'trophy' : iconeCategoria(c.categoria)} />
                </span>
                <span className="tt">
                  <span className="t1">{c.categoria}</span>
                  <span className="t2">
                    {c.totalPropostas} proposta{c.totalPropostas === 1 ? '' : 's'}
                    {c.vencedoraFornecedor && (
                      <>
                        {' · '}
                        <Icon name="trophy" style={{ width: 13, height: 13, color: 'var(--ok)' }} />
                        {c.vencedoraFornecedor}
                      </>
                    )}
                  </span>
                </span>
                <span className="rt">
                  <span className={`pill ${label.tom}`}>
                    <span className={`dot ${label.tom}`} />
                    {label.texto}
                  </span>
                </span>
              </div>
            );
          })}
        </div>
      )}
    </>
  );
}
