import { useMemo, useState } from 'react';
import {
  filtrarAcervo,
  resumoAcervo,
  categoriasDoAcervo,
  formatBRL,
  formatBRLCompact,
  nomeProposta,
  type PropostaAcervo,
} from '@bid/core';
import { useNavigate } from 'react-router-dom';
import { Icon, iconeCategoria } from '@bid/ui';
import { useAcervo, useApagarProposta, invalidarVencedora } from '../data/hooks';
import { restaurarProposta } from '../data/mutations';
import { useQueryClient } from '@tanstack/react-query';
import { useToast } from '../app/Toast';
import { ConfirmDialog } from '../app/ConfirmDialog';
import { SwipeRow } from '../components/SwipeRow';

export function PropostasScreen() {
  // Arrastar para o lado → lixeira → confirmação → Desfazer (regra #11).
  const apagar = useApagarProposta();
  const toast = useToast();
  const qc = useQueryClient();
  const [paraApagar, setParaApagar] = useState<PropostaAcervo | null>(null);
  async function confirmarApagar() {
    if (!paraApagar) return;
    const alvo = paraApagar;
    try {
      await apagar.mutateAsync(alvo.id);
      setParaApagar(null);
      toast(`Proposta de ${nomeProposta(alvo.fornecedor, alvo.opcao)} excluída.`, {
        actionLabel: 'Desfazer',
        onAction: async () => {
          try {
            await restaurarProposta(alvo.id);
            invalidarVencedora(qc);
          } catch {
            toast('Não foi possível restaurar a proposta.');
          }
        },
      });
    } catch (e) {
      setParaApagar(null);
      toast(e instanceof Error ? e.message : 'Não foi possível apagar a proposta.');
    }
  }
  const { data, isLoading, isError } = useAcervo();
  const props = useMemo(() => data ?? [], [data]);

  const [categoria, setCategoria] = useState<string | null>(null);
  const [obraId, setObraId] = useState<string | null>(null);
  const [busca, setBusca] = useState('');

  const categorias = useMemo(() => categoriasDoAcervo(props), [props]);
  const obras = useMemo(() => {
    const m = new Map<string, string>();
    for (const p of props) if (p.obraId) m.set(p.obraId, p.obraNome);
    return [...m.entries()];
  }, [props]);

  const lista = useMemo(
    () => filtrarAcervo(props, { categoria, obraId, busca }),
    [props, categoria, obraId, busca],
  );
  const resumo = resumoAcervo(lista);

  return (
    <>
      <div className="page-head">
        <h1>Propostas</h1>
        <p className="lead">O acervo de propostas de obra.</p>
      </div>

      <div className="searchbar">
        <Icon name="search" />
        <input
          placeholder="Buscar fornecedor, categoria, obra"
          value={busca}
          onChange={(e) => setBusca(e.target.value)}
          aria-label="Buscar no acervo"
        />
      </div>

      {categorias.length > 0 && (
        <div className="chips" role="group" aria-label="Filtrar por categoria">
          <button className={`ch ${categoria === null ? 'on' : ''}`} onClick={() => setCategoria(null)}>
            Todas
          </button>
          {categorias.map((c) => (
            <button key={c} className={`ch ${categoria === c ? 'on' : ''}`} onClick={() => setCategoria(c)}>
              {c}
            </button>
          ))}
        </div>
      )}

      {obras.length > 1 && (
        <div className="scopebar" role="group" aria-label="Escopo">
          <button className={`sc ${obraId === null ? 'on' : ''}`} onClick={() => setObraId(null)}>
            Todo o sistema
          </button>
          {obras.map(([id, nome]) => (
            <button key={id} className={`sc ${obraId === id ? 'on' : ''}`} onClick={() => setObraId(id)}>
              {nome}
            </button>
          ))}
        </div>
      )}

      {isLoading ? (
        <div className="card" style={{ marginTop: 16 }}>
          <div className="empty">
            <span className="thinking" aria-label="Carregando">
              <i />
              <i />
              <i />
            </span>
          </div>
        </div>
      ) : isError ? (
        <div className="banner warn" role="alert" style={{ marginTop: 16 }}>
          <Icon name="alert" />
          <span>Não foi possível carregar o acervo. Tente novamente.</span>
        </div>
      ) : lista.length === 0 ? (
        <>
          <div className="section-title">
            <h2>Acervo</h2>
          </div>
          <div className="card empty">
            {props.length === 0
              ? 'Nenhuma proposta ainda. Toque em + para arquivar a primeira.'
              : 'Nada encontrado para este filtro.'}
          </div>
        </>
      ) : (
        <>
          <div className="section-title">
            <h2>{categoria ?? 'Acervo'}</h2>
            <span className="c">
              {resumo.total} proposta{resumo.total > 1 ? 's' : ''}
              {categoria && resumo.menorValor != null ? ` · a partir de ${formatBRLCompact(resumo.menorValor)}` : ''}
            </span>
          </div>
          <div className="card rowlist">
            {lista.map((p) => (
              <SwipeRow key={p.id} onApagar={() => setParaApagar(p)}>
                <AcervoRow p={p} />
              </SwipeRow>
            ))}
          </div>
        </>
      )}
      <ConfirmDialog
        aberto={paraApagar !== null}
        titulo={`Apagar a proposta de ${paraApagar ? nomeProposta(paraApagar.fornecedor, paraApagar.opcao) : ''}?`}
        confirmarLabel="Apagar proposta"
        ocupado={apagar.isPending}
        onConfirmar={confirmarApagar}
        onCancelar={() => setParaApagar(null)}
      >
        Ela sai do acervo e da equalização. Você ainda pode desfazer por alguns segundos.
      </ConfirmDialog>
    </>
  );
}

function AcervoRow({ p }: { p: PropostaAcervo }) {
  const navigate = useNavigate();
  const vencedora = p.status === 'vencedora';
  const abrir = () => navigate(`/propostas/${p.id}`);
  return (
    <div
      className="row"
      role="button"
      tabIndex={0}
      style={{ cursor: 'pointer' }}
      onClick={abrir}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          abrir();
        }
      }}
    >
      <span
        className="ic"
        style={vencedora ? { background: 'var(--ok-soft)', color: 'var(--ok)' } : undefined}
      >
        <Icon name={vencedora ? 'trophy' : iconeCategoria(p.categoria)} />
      </span>
      <span className="tt">
        <span className="t1">{nomeProposta(p.fornecedor, p.opcao)}</span>
        <span className="t2">
          {p.categoria} · {p.obraNome}
          {p.versaoAtual > 1 ? ` · v${p.versaoAtual}` : ''}
        </span>
      </span>
      <span className="rt">
        <span className="v">{p.valor != null ? formatBRL(p.valor) : '—'}</span>
      </span>
      <span className="chev">
        <Icon name="chev" />
      </span>
    </div>
  );
}
