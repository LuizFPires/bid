import { useNavigate } from 'react-router-dom';
import { Icon } from '@bid/ui';
import { useObras } from '../data/hooks';

export function ObrasScreen() {
  const navigate = useNavigate();
  const { data, isLoading, isError } = useObras();
  const obras = data ?? [];

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
          <button key={o.id} className="ucard" onClick={() => navigate(`/obras/${o.id}`)}>
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
                {o.totalCertames} certame{o.totalCertames === 1 ? '' : 's'} · {o.ativos} ativo
                {o.ativos === 1 ? '' : 's'}
              </span>
              <span className="go">
                Abrir <Icon name="chev" />
              </span>
            </div>
          </button>
        ))
      )}
    </>
  );
}
