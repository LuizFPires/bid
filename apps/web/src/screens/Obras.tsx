import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQueryClient } from '@tanstack/react-query';
import { Icon } from '@bid/ui';
import { useApagarObra, useObras } from '../data/hooks';
import { restaurarObra } from '../data/mutations';
import { useAuth } from '../auth/AuthProvider';
import { useToast } from '../app/Toast';
import { ConfirmDialog } from '../app/ConfirmDialog';
import { SwipeRow } from '../components/SwipeRow';

export function ObrasScreen() {
  const navigate = useNavigate();
  const { data, isLoading, isError } = useObras();
  const obras = data ?? [];
  const { session } = useAuth();
  const meuId = session?.user?.id;
  // Só o dono apaga (regra #13); arrastar → lixeira → confirmação → Desfazer.
  const apagar = useApagarObra();
  const toast = useToast();
  const qc = useQueryClient();
  const [paraApagar, setParaApagar] = useState<(typeof obras)[number] | null>(null);
  async function confirmarApagar() {
    if (!paraApagar) return;
    const alvo = paraApagar;
    try {
      await apagar.mutateAsync(alvo.id);
      setParaApagar(null);
      toast(`Obra "${alvo.nome}" excluída.`, {
        actionLabel: 'Desfazer',
        onAction: async () => {
          try {
            await restaurarObra(alvo.id);
            qc.invalidateQueries({ queryKey: ['obras'] });
          } catch {
            toast('Não foi possível restaurar a obra.');
          }
        },
      });
    } catch (e) {
      setParaApagar(null);
      toast(e instanceof Error ? e.message : 'Não foi possível apagar a obra.');
    }
  }

  return (
    <>
      <div className="page-head">
        <h1>Obras</h1>
        <p className="lead">O acervo organizado por obra.</p>
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
          <span>Não foi possível carregar as obras.</span>
        </div>
      ) : obras.length === 0 ? (
        <div className="card empty">Nenhuma obra ainda.</div>
      ) : (
        obras.map((o) => (
          <SwipeRow key={o.id} className="ucard-wrap" onApagar={meuId && o.criado_por === meuId ? () => setParaApagar(o) : undefined}>
          <button className="ucard" onClick={() => navigate(`/obras/${o.id}`)}>
            <div className="hd">
              <span className="cat-ic">
                <Icon name="tab-obras" />
              </span>
              <div style={{ minWidth: 0 }}>
                <h3>{o.nome}</h3>
                <div className="sub">{o.cidade ?? '—'}</div>
              </div>
            </div>
            <div className="foot">
              <span>
                {o.totalCertames} {o.totalCertames === 1 ? 'tomada de preços' : 'tomadas de preços'} ·{' '}
                {o.ativos} ativo{o.ativos === 1 ? '' : 's'}
              </span>
              <span className="go">
                Abrir <Icon name="chev" />
              </span>
            </div>
          </button>
          </SwipeRow>
        ))
      )}
      <ConfirmDialog
        aberto={paraApagar !== null}
        titulo={`Apagar a obra "${paraApagar?.nome ?? ''}"?`}
        confirmarLabel="Apagar obra"
        ocupado={apagar.isPending}
        onConfirmar={confirmarApagar}
        onCancelar={() => setParaApagar(null)}
      >
        A obra sai da lista para todas as pessoas com acesso. Você ainda pode desfazer por alguns segundos.
      </ConfirmDialog>
    </>
  );
}
