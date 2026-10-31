import { useEffect, useRef, useState, type FormEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { Button, Icon } from '@bid/ui';
import { supabase } from '../lib/supabase';
import { useAuth } from '../auth/AuthProvider';
import { Olho } from '../auth/Olho';
import { useMeusConvites } from '../data/hooks';
import { useToast } from './Toast';
import { lerTema, salvarTema, type Tema } from './theme';

/** "30/10 23:05" a partir do ISO do build (horário local). */
function formatarBuild(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '—';
  const p = (n: number) => String(n).padStart(2, '0');
  return `${p(d.getDate())}/${p(d.getMonth() + 1)} ${p(d.getHours())}:${p(d.getMinutes())}`;
}

const TEMAS: { v: Tema; label: string }[] = [
  { v: 'auto', label: 'Auto' },
  { v: 'claro', label: 'Claro' },
  { v: 'escuro', label: 'Escuro' },
];

/**
 * Menu de perfil no topo: conta, convites de obra (com notificação no ícone),
 * trocar senha e sair.
 */
export function ProfileMenu() {
  const { session } = useAuth();
  const navigate = useNavigate();
  const toast = useToast();
  const convites = useMeusConvites();
  const pendentes = convites.data?.length ?? 0;
  const [tema, setTema] = useState<Tema>(() => lerTema());

  function escolherTema(t: Tema) {
    setTema(t);
    salvarTema(t);
  }
  const ref = useRef<HTMLDivElement>(null);
  const [aberto, setAberto] = useState(false);
  const [trocando, setTrocando] = useState(false);
  const [senha, setSenha] = useState('');
  const [confirmar, setConfirmar] = useState('');
  const [mostrar, setMostrar] = useState(false);
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  const email = session?.user?.email ?? '—';

  function fechar() {
    setAberto(false);
    setTrocando(false);
    setSenha('');
    setConfirmar('');
    setErro(null);
    setMostrar(false);
  }

  useEffect(() => {
    if (!aberto) return;
    function onDoc(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) fechar();
    }
    function onEsc(e: KeyboardEvent) {
      if (e.key === 'Escape') fechar();
    }
    document.addEventListener('mousedown', onDoc);
    document.addEventListener('keydown', onEsc);
    return () => {
      document.removeEventListener('mousedown', onDoc);
      document.removeEventListener('keydown', onEsc);
    };
  }, [aberto]);

  async function salvarSenha(e: FormEvent) {
    e.preventDefault();
    if (!supabase) return;
    if (senha.length < 6) return setErro('A senha precisa ter ao menos 6 caracteres.');
    if (senha !== confirmar) return setErro('As senhas não coincidem.');
    setErro(null);
    setSalvando(true);
    const { error } = await supabase.auth.updateUser({ password: senha });
    setSalvando(false);
    if (error) {
      setErro(error.message);
      return;
    }
    toast('Senha alterada.');
    fechar();
  }

  async function sair() {
    fechar();
    await supabase?.auth.signOut();
  }

  return (
    <div ref={ref} style={{ position: 'relative', marginLeft: 8 }}>
      <button
        className="bell"
        type="button"
        aria-label={pendentes > 0 ? `Perfil — ${pendentes} convite${pendentes === 1 ? '' : 's'}` : 'Perfil'}
        aria-haspopup="menu"
        aria-expanded={aberto}
        onClick={() => (aberto ? fechar() : setAberto(true))}
      >
        <Icon name="user" />
        {pendentes > 0 && (
          <span className="badge" aria-hidden="true">
            {pendentes > 9 ? '9+' : pendentes}
          </span>
        )}
      </button>

      {aberto && (
        <div className="profile-menu" role="menu">
          <div className="pm-head">
            <span className="pm-ic">
              <Icon name="user" />
            </span>
            <div style={{ minWidth: 0 }}>
              <div className="pm-k">Conectado como</div>
              <div className="pm-email" title={email}>
                {email}
              </div>
              <div className="pm-k" style={{ marginTop: 4 }}>
                Versão {formatarBuild(__BUILD_TIME__)}
              </div>
            </div>
          </div>

          {!trocando ? (
            <div className="pm-list">
              <button
                className="pm-item"
                type="button"
                onClick={() => {
                  fechar();
                  navigate('/convites');
                }}
              >
                <Icon name="users" />
                Convites
                {pendentes > 0 && <span className="count">{pendentes}</span>}
              </button>
              <div className="pm-tema" role="group" aria-label="Tema do aplicativo">
                <span className="pm-tema-k">Tema</span>
                <div className="pm-seg">
                  {TEMAS.map((t) => (
                    <button
                      key={t.v}
                      type="button"
                      className={tema === t.v ? 'on' : undefined}
                      aria-pressed={tema === t.v}
                      onClick={() => escolherTema(t.v)}
                    >
                      {t.label}
                    </button>
                  ))}
                </div>
              </div>
              <button
                className="pm-item"
                type="button"
                onClick={() => {
                  fechar();
                  navigate('/categorias');
                }}
              >
                <Icon name="cat-estrutura" />
                Categorias
              </button>
              <button className="pm-item" type="button" onClick={() => setTrocando(true)}>
                <Icon name="link" />
                Trocar senha
              </button>
              <button className="pm-item danger" type="button" onClick={sair}>
                <Icon name="logout" />
                Sair
              </button>
            </div>
          ) : (
            <form className="pm-form" onSubmit={salvarSenha}>
              <div className="field" style={{ margin: 0 }}>
                <label htmlFor="pm-senha">Nova senha</label>
                <div style={{ position: 'relative' }}>
                  <input
                    id="pm-senha"
                    type={mostrar ? 'text' : 'password'}
                    autoComplete="new-password"
                    placeholder="Mínimo 6 caracteres"
                    value={senha}
                    onChange={(e) => setSenha(e.target.value)}
                    style={{ paddingRight: 46 }}
                  />
                  <button
                    type="button"
                    className="pm-eye"
                    onClick={() => setMostrar((v) => !v)}
                    aria-label={mostrar ? 'Ocultar senha' : 'Mostrar senha'}
                  >
                    <Olho aberto={mostrar} />
                  </button>
                </div>
              </div>
              <div className="field" style={{ margin: '10px 0 0' }}>
                <label htmlFor="pm-confirmar">Confirmar senha</label>
                <input
                  id="pm-confirmar"
                  type={mostrar ? 'text' : 'password'}
                  autoComplete="new-password"
                  placeholder="Repita a senha"
                  value={confirmar}
                  onChange={(e) => setConfirmar(e.target.value)}
                />
              </div>
              {erro && (
                <div className="banner warn" role="alert" style={{ margin: '10px 0 0' }}>
                  <Icon name="alert" />
                  <span>{erro}</span>
                </div>
              )}
              <div className="pair" style={{ marginTop: 12 }}>
                <Button type="button" variant="ghost" size="sm" onClick={() => setTrocando(false)}>
                  Cancelar
                </Button>
                <Button type="submit" size="sm" icon="check" disabled={salvando || !senha || !confirmar}>
                  {salvando ? 'Salvando…' : 'Salvar senha'}
                </Button>
              </div>
            </form>
          )}
        </div>
      )}
    </div>
  );
}
