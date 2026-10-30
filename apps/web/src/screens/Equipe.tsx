import { useState, type FormEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { Button, Icon } from '@bid/ui';
import {
  useAdicionarMembro,
  useMembros,
  useMinhaOrg,
  useMudarPapelMembro,
  useRemoverMembro,
} from '../data/hooks';
import { useAuth } from '../auth/AuthProvider';
import { useToast } from '../app/Toast';
import type { MembroPapel } from '../data/queries';

const PAPEL_LABEL: Record<MembroPapel, { texto: string; tom: string }> = {
  gestor: { texto: 'Gestor', tom: 'adjudicada' },
  equipe: { texto: 'Equipe', tom: 'aberta' },
};

export function EquipeScreen() {
  const navigate = useNavigate();
  const { session } = useAuth();
  const org = useMinhaOrg();
  const orgId = org.data?.id;
  const membros = useMembros(orgId);
  const adicionar = useAdicionarMembro(orgId);
  const mudarPapel = useMudarPapelMembro(orgId);
  const remover = useRemoverMembro(orgId);
  const toast = useToast();

  const [email, setEmail] = useState('');
  const [papel, setPapel] = useState<MembroPapel>('equipe');
  const [erro, setErro] = useState<string | null>(null);

  const meuId = session?.user?.id;
  const lista = membros.data ?? [];
  const souGestor = lista.find((m) => m.userId === meuId)?.papel === 'gestor';

  async function adicionarMembroSubmit(e: FormEvent) {
    e.preventDefault();
    if (!orgId) return;
    setErro(null);
    try {
      await adicionar.mutateAsync({ orgId, email, papel });
      toast(`${email.trim()} foi adicionado.`);
      setEmail('');
      setPapel('equipe');
    } catch (err) {
      setErro(err instanceof Error ? err.message : 'Não foi possível adicionar.');
    }
  }

  async function alternarPapel(userId: string, atual: MembroPapel) {
    if (!orgId) return;
    const novo: MembroPapel = atual === 'gestor' ? 'equipe' : 'gestor';
    try {
      await mudarPapel.mutateAsync({ orgId, userId, papel: novo });
    } catch (err) {
      toast(err instanceof Error ? err.message : 'Não foi possível mudar o papel.');
    }
  }

  async function removerMembroClick(userId: string, emailMembro: string) {
    if (!orgId) return;
    try {
      await remover.mutateAsync({ orgId, userId });
      toast(`${emailMembro} foi removido.`);
    } catch (err) {
      toast(err instanceof Error ? err.message : 'Não foi possível remover.');
    }
  }

  return (
    <>
      <div className="crumb">
        <button onClick={() => navigate('/propostas')}>Propostas</button>
        <Icon name="chev" />
        <span>Equipe</span>
      </div>
      <div className="page-head">
        <h1>Equipe</h1>
        <p className="lead">Quem tem acesso a esta organização.</p>
      </div>

      {souGestor && (
        <form onSubmit={adicionarMembroSubmit} className="card" style={{ marginBottom: 16 }}>
          <div className="section-title" style={{ marginTop: 0 }}>
            <h2>Adicionar pessoa</h2>
          </div>
          <p className="lead" style={{ marginTop: 0 }}>
            A pessoa precisa já ter criado uma conta no bid com este e-mail.
          </p>
          <div className="field">
            <label htmlFor="eq-email">E-mail</label>
            <input
              id="eq-email"
              type="email"
              autoComplete="off"
              placeholder="colega@empresa.com.br"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
          </div>
          <div className="field">
            <label htmlFor="eq-papel">Papel</label>
            <select id="eq-papel" value={papel} onChange={(e) => setPapel(e.target.value as MembroPapel)}>
              <option value="equipe">Equipe — vê e edita, não apaga</option>
              <option value="gestor">Gestor — acesso total (inclui apagar)</option>
            </select>
          </div>
          {erro && (
            <div className="banner warn" role="alert" style={{ marginBottom: 14 }}>
              <Icon name="alert" />
              <span>{erro}</span>
            </div>
          )}
          <Button type="submit" icon="plus" block disabled={adicionar.isPending || !email.trim()}>
            {adicionar.isPending ? 'Adicionando…' : 'Adicionar à organização'}
          </Button>
        </form>
      )}

      <div className="section-title">
        <h2>Membros</h2>
        <span className="c">{lista.length}</span>
      </div>

      {membros.isLoading ? (
        <div className="card">
          <div className="empty">
            <span className="thinking" aria-label="Carregando">
              <i />
              <i />
              <i />
            </span>
          </div>
        </div>
      ) : membros.isError ? (
        <div className="banner warn" role="alert">
          <Icon name="alert" />
          <span>Não foi possível carregar os membros.</span>
        </div>
      ) : (
        <div className="card rowlist">
          {lista.map((m) => {
            const label = PAPEL_LABEL[m.papel];
            const euMesmo = m.userId === meuId;
            return (
              <div key={m.userId} className="row">
                <span className="ic">
                  <Icon name="user" />
                </span>
                <span className="tt">
                  <span className="t1">
                    {m.email}
                    {euMesmo ? ' · você' : ''}
                  </span>
                  <span className="t2">{label.texto}</span>
                </span>
                <span className="rt" style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                  {souGestor && !euMesmo ? (
                    <>
                      <Button
                        size="sm"
                        variant="soft"
                        disabled={mudarPapel.isPending}
                        onClick={() => alternarPapel(m.userId, m.papel)}
                      >
                        {m.papel === 'gestor' ? 'Tornar equipe' : 'Tornar gestor'}
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        icon="trash"
                        aria-label={`Remover ${m.email}`}
                        disabled={remover.isPending}
                        onClick={() => removerMembroClick(m.userId, m.email)}
                      />
                    </>
                  ) : (
                    <span className={`pill ${label.tom}`}>
                      <span className={`dot ${label.tom}`} />
                      {label.texto}
                    </span>
                  )}
                </span>
              </div>
            );
          })}
        </div>
      )}
    </>
  );
}
