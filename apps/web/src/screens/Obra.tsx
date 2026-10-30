import { Link, useNavigate, useParams } from 'react-router-dom';
import { CERTAME_LABEL, type CertameStatus } from '@bid/core';
import { Icon, iconeCategoria } from '@bid/ui';
import { useObra } from '../data/hooks';

export function ObraScreen() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { data, isLoading, isError } = useObra(id);

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
      <div className="page-head">
        <h1>{obra.nome}</h1>
        <p className="lead">
          {obra.cidade ?? '—'} · {certames.length}{' '}
          {certames.length === 1 ? 'tomada de preços' : 'tomadas de preços'}
        </p>
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
