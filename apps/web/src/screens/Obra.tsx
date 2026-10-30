import { useEffect, useRef, useState, type FormEvent } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { useQueryClient } from '@tanstack/react-query';
import { CERTAME_LABEL, type CertameStatus } from '@bid/core';
import { Button, Icon, iconeCategoria } from '@bid/ui';
import {
  useAcessoObra,
  useApagarObra,
  useConvidarParaObra,
  useObra,
  useRemoverAcessoObra,
} from '../data/hooks';
import { restaurarObra } from '../data/mutations';
import type { AcessoObra } from '../data/queries';
import { useAuth } from '../auth/AuthProvider';
import { useToast } from '../app/Toast';
import { ConfirmDialog } from '../app/ConfirmDialog';

/** Menu de 3 pontinhos da obra (apagar) — só o dono vê. */
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

const ACESSO_LABEL: Record<AcessoObra['status'], { texto: string; tom: 'neutro' | 'aberta' | 'analise' }> = {
  dono: { texto: 'dono', tom: 'aberta' },
  aceito: { texto: 'acesso', tom: 'neutro' },
  pendente: { texto: 'convidado', tom: 'analise' },
};

/**
 * Pessoas com acesso à obra. O dono convida por e-mail (a conta pode ainda não
 * existir — o convite espera o cadastro) e remove acessos com confirmação.
 */
function Pessoas({ obraId, ehDono }: { obraId: string; ehDono: boolean }) {
  const acesso = useAcessoObra(obraId);
  const convidar = useConvidarParaObra(obraId);
  const remover = useRemoverAcessoObra(obraId);
  const toast = useToast();
  const [email, setEmail] = useState('');
  const [erro, setErro] = useState<string | null>(null);
  const [removendo, setRemovendo] = useState<AcessoObra | null>(null);

  async function enviar(e: FormEvent) {
    e.preventDefault();
    setErro(null);
    try {
      await convidar.mutateAsync({ obraId, email });
      toast(`Convite enviado para ${email.trim()}.`);
      setEmail('');
    } catch (err) {
      setErro(err instanceof Error ? err.message : 'Não foi possível convidar.');
    }
  }

  async function confirmarRemocao() {
    if (!removendo?.conviteId) return;
    try {
      await remover.mutateAsync(removendo.conviteId);
      toast(`Acesso de ${removendo.email} removido.`);
    } catch (err) {
      toast(err instanceof Error ? err.message : 'Não foi possível remover o acesso.');
    } finally {
      setRemovendo(null);
    }
  }

  const lista = acesso.data ?? [];

  return (
    <section className="acesso" style={{ marginTop: 18 }}>
      <div className="page-head" style={{ marginBottom: 10 }}>
        <h2 style={{ fontSize: 15, margin: 0 }}>Pessoas</h2>
        <p className="lead" style={{ marginTop: 2 }}>
          {ehDono
            ? 'Só quem você convidar vê esta obra e suas propostas.'
            : 'Quem tem acesso a esta obra.'}
        </p>
      </div>

      {ehDono && (
        <form className="acesso-form" onSubmit={enviar}>
          <div className="field">
            <label htmlFor="acesso-email">Convidar por e-mail</label>
            <input
              id="acesso-email"
              type="email"
              inputMode="email"
              autoComplete="off"
              placeholder="pessoa@empresa.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
          </div>
          <Button type="submit" icon="plus" disabled={convidar.isPending || !email.trim()}>
            Convidar
          </Button>
        </form>
      )}
      {erro && (
        <div className="banner warn" role="alert" style={{ marginBottom: 12 }}>
          <Icon name="alert" />
          <span>{erro}</span>
        </div>
      )}

      {lista.length > 0 && (
        <div className="card rowlist">
          {lista.map((a) => {
            const l = ACESSO_LABEL[a.status];
            return (
              <div key={a.conviteId ?? 'dono'} className="row">
                <span className="ic">
                  <Icon name="user" />
                </span>
                <span className="tt">
                  <span className="t1">{a.email}</span>
                </span>
                <span className="rt" style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                  <span className={`pill ${l.tom}`}>
                    <span className={`dot ${l.tom}`} />
                    {l.texto}
                  </span>
                  {ehDono && a.conviteId && (
                    <button
                      type="button"
                      className="remover"
                      aria-label={`Remover acesso de ${a.email}`}
                      disabled={remover.isPending}
                      onClick={() => setRemovendo(a)}
                    >
                      <Icon name="trash" />
                    </button>
                  )}
                </span>
              </div>
            );
          })}
        </div>
      )}

      <ConfirmDialog
        aberto={removendo !== null}
        titulo={`Remover o acesso de ${removendo?.email ?? ''}?`}
        confirmarLabel="Remover acesso"
        ocupado={remover.isPending}
        onConfirmar={confirmarRemocao}
        onCancelar={() => setRemovendo(null)}
      >
        A pessoa deixa de ver esta obra e suas propostas. Você pode convidar de novo depois.
      </ConfirmDialog>
    </section>
  );
}

export function ObraScreen() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { data, isLoading, isError } = useObra(id);
  const { session } = useAuth();
  const apagar = useApagarObra();
  const toast = useToast();
  const qc = useQueryClient();
  const [confirmando, setConfirmando] = useState(false);

  async function apagarEsta(obraId: string, nome: string) {
    try {
      await apagar.mutateAsync(obraId);
      setConfirmando(false);
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
      setConfirmando(false);
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
  const ehDono = !!session?.user?.id && obra.criado_por === session.user.id;

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
        {ehDono && <ObraMenu apagando={apagar.isPending} onApagar={() => setConfirmando(true)} />}
      </div>

      <ConfirmDialog
        aberto={confirmando}
        titulo={`Apagar a obra "${obra.nome}"?`}
        confirmarLabel="Apagar obra"
        ocupado={apagar.isPending}
        onConfirmar={() => apagarEsta(obra.id, obra.nome)}
        onCancelar={() => setConfirmando(false)}
      >
        A obra sai da lista para todas as pessoas com acesso. Você ainda pode desfazer por alguns
        segundos.
      </ConfirmDialog>

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

      <Pessoas obraId={obra.id} ehDono={ehDono} />
    </>
  );
}
