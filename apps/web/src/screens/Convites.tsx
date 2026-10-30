import { useNavigate } from 'react-router-dom';
import { Button, Icon } from '@bid/ui';
import { useMeusConvites, useResponderConvite } from '../data/hooks';
import { useToast } from '../app/Toast';

/**
 * Convites de obra recebidos: a pessoa só passa a ver uma obra depois de aceitar.
 * Chega pelo menu de perfil (que mostra a notificação com a quantidade).
 */
export function ConvitesScreen() {
  const navigate = useNavigate();
  const { data, isLoading } = useMeusConvites();
  const responder = useResponderConvite();
  const toast = useToast();

  async function responderClick(conviteId: string, aceitar: boolean, obraNome: string) {
    try {
      await responder.mutateAsync({ conviteId, aceitar });
      toast(aceitar ? `Você entrou na obra "${obraNome}".` : `Convite para "${obraNome}" recusado.`);
    } catch (e) {
      toast(e instanceof Error ? e.message : 'Não foi possível responder ao convite.');
    }
  }

  const lista = data ?? [];

  return (
    <>
      <div className="crumb">
        <button onClick={() => navigate('/propostas')}>Início</button>
        <Icon name="chev" />
        <span>Convites</span>
      </div>
      <div className="page-head">
        <h1>Convites</h1>
        <p className="lead">Obras para as quais você foi convidado. Aceite para passar a vê-las no app.</p>
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
      ) : lista.length === 0 ? (
        <div className="card empty">Nenhum convite pendente.</div>
      ) : (
        lista.map((c) => (
          <div key={c.id} className="card" style={{ marginBottom: 12 }}>
            <div className="row" style={{ padding: 0, border: 0 }}>
              <span className="ic">
                <Icon name="doc" />
              </span>
              <span className="tt">
                <span className="t1">{c.obraNome}</span>
                <span className="t2">
                  {c.obraCidade ? `${c.obraCidade} · ` : ''}
                  convite de {c.convidadoPor ?? 'um colega'}
                </span>
              </span>
            </div>
            <div className="convite-acoes">
              <Button
                type="button"
                variant="ghost"
                disabled={responder.isPending}
                onClick={() => responderClick(c.id, false, c.obraNome)}
              >
                Recusar
              </Button>
              <Button
                type="button"
                icon="check"
                disabled={responder.isPending}
                onClick={() => responderClick(c.id, true, c.obraNome)}
              >
                Aceitar
              </Button>
            </div>
          </div>
        ))
      )}
    </>
  );
}
