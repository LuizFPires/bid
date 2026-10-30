import { useState, type FormEvent } from 'react';
import { BrandLogo, Button } from '@bid/ui';
import { supabase, supabaseConfigured } from '../lib/supabase';

type Modo = 'entrar' | 'criar';

/** Ícone de olho (mostrar/ocultar senha), inline. */
function Olho({ aberto }: { aberto: boolean }) {
  return (
    <svg
      viewBox="0 0 24 24"
      width="20"
      height="20"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.9"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      {aberto ? (
        <>
          <path d="M1 12s4-7 11-7 11 7 11 7-4 7-11 7-11-7-11-7z" />
          <circle cx="12" cy="12" r="3" />
        </>
      ) : (
        <path d="M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24M1 1l22 22M6.61 6.61A18.52 18.52 0 0 0 1 12s4 8 11 8a9.12 9.12 0 0 0 5.39-1.61" />
      )}
    </svg>
  );
}

/** Traduz os erros do Supabase para mensagens amigáveis. */
function traduzErro(msg: string): string {
  const m = msg.toLowerCase();
  if (m.includes('invalid login credentials')) return 'E-mail ou senha incorretos.';
  if (m.includes('already registered') || m.includes('already been registered'))
    return 'Esse e-mail já tem conta. Entre com sua senha.';
  if (m.includes('email not confirmed')) return 'Confirme seu e-mail antes de entrar.';
  if (m.includes('password should be')) return 'A senha precisa ter ao menos 6 caracteres.';
  if (m.includes('unable to validate email') || m.includes('invalid email'))
    return 'E-mail inválido.';
  if (m.includes('rate limit')) return 'Muitas tentativas. Aguarde um instante.';
  return msg;
}

export function LoginScreen() {
  const [modo, setModo] = useState<Modo>('entrar');
  const [email, setEmail] = useState('');
  const [senha, setSenha] = useState('');
  const [confirmar, setConfirmar] = useState('');
  const [mostrar, setMostrar] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [enviando, setEnviando] = useState(false);
  const [checarEmail, setChecarEmail] = useState(false);

  function limpar() {
    setErro(null);
    setChecarEmail(false);
  }

  async function submeter(e: FormEvent) {
    e.preventDefault();
    if (!supabase) return;
    limpar();

    if (modo === 'criar') {
      if (senha.length < 6) {
        setErro('A senha precisa ter ao menos 6 caracteres.');
        return;
      }
      if (senha !== confirmar) {
        setErro('As senhas não coincidem.');
        return;
      }
    }

    setEnviando(true);
    try {
      if (modo === 'entrar') {
        const { error } = await supabase.auth.signInWithPassword({ email, password: senha });
        if (error) setErro(traduzErro(error.message));
        // sucesso: o AuthProvider detecta a sessão e entra.
      } else {
        const { data, error } = await supabase.auth.signUp({
          email,
          password: senha,
          options: { emailRedirectTo: window.location.origin },
        });
        if (error) {
          setErro(traduzErro(error.message));
        } else if (!data.session) {
          // Confirmação de e-mail está ligada no Supabase.
          setChecarEmail(true);
        }
        // com sessão: entra direto (confirmação de e-mail desligada).
      }
    } finally {
      setEnviando(false);
    }
  }

  const titulo = modo === 'entrar' ? 'Entrar' : 'Criar conta';

  return (
    <div className="stage">
      <div className="device">
        <div
          className="content"
          style={{ display: 'flex', flexDirection: 'column', justifyContent: 'center', gap: 18 }}
        >
          <div style={{ display: 'flex', justifyContent: 'center' }}>
            <BrandLogo />
          </div>
          <div className="page-head" style={{ textAlign: 'center', margin: 0 }}>
            <h1 style={{ fontSize: 24 }}>{titulo}</h1>
            <p className="lead">Propostas, equalização e contratos de obra.</p>
          </div>

          {!supabaseConfigured ? (
            <div className="banner warn" role="status">
              <span>
                Supabase não configurado. Defina <code>VITE_SUPABASE_URL</code> e{' '}
                <code>VITE_SUPABASE_ANON_KEY</code>.
              </span>
            </div>
          ) : checarEmail ? (
            <div className="banner ok" role="status">
              <span>
                Conta criada! Enviamos um e-mail de confirmação para <strong>{email}</strong>. Confirme
                e volte para entrar.
              </span>
            </div>
          ) : (
            <>
              {/* Alternância Entrar / Criar conta */}
              <div className="seg" role="group" aria-label="Modo de acesso">
                <button
                  type="button"
                  className={modo === 'entrar' ? 'on' : ''}
                  aria-pressed={modo === 'entrar'}
                  onClick={() => {
                    setModo('entrar');
                    limpar();
                  }}
                >
                  Entrar
                </button>
                <button
                  type="button"
                  className={modo === 'criar' ? 'on' : ''}
                  aria-pressed={modo === 'criar'}
                  onClick={() => {
                    setModo('criar');
                    limpar();
                  }}
                >
                  Criar conta
                </button>
              </div>

              <form onSubmit={submeter}>
                <div className="field">
                  <label htmlFor="email">E-mail</label>
                  <input
                    id="email"
                    type="email"
                    required
                    autoComplete="email"
                    placeholder="voce@empresa.com.br"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                  />
                </div>

                <div className="field">
                  <label htmlFor="senha">Senha</label>
                  <div style={{ position: 'relative' }}>
                    <input
                      id="senha"
                      type={mostrar ? 'text' : 'password'}
                      required
                      autoComplete={modo === 'entrar' ? 'current-password' : 'new-password'}
                      placeholder="Mínimo 6 caracteres"
                      value={senha}
                      onChange={(e) => setSenha(e.target.value)}
                      style={{ paddingRight: 46 }}
                    />
                    <button
                      type="button"
                      onClick={() => setMostrar((v) => !v)}
                      aria-label={mostrar ? 'Ocultar senha' : 'Mostrar senha'}
                      style={{
                        position: 'absolute',
                        right: 6,
                        top: '50%',
                        transform: 'translateY(-50%)',
                        display: 'grid',
                        placeItems: 'center',
                        width: 38,
                        height: 38,
                        border: 0,
                        background: 'none',
                        color: 'var(--muted)',
                        cursor: 'pointer',
                      }}
                    >
                      <Olho aberto={mostrar} />
                    </button>
                  </div>
                </div>

                {modo === 'criar' && (
                  <div className="field">
                    <label htmlFor="confirmar">Confirmar senha</label>
                    <input
                      id="confirmar"
                      type={mostrar ? 'text' : 'password'}
                      required
                      autoComplete="new-password"
                      placeholder="Repita a senha"
                      value={confirmar}
                      onChange={(e) => setConfirmar(e.target.value)}
                    />
                  </div>
                )}

                {erro && (
                  <div className="banner warn" role="alert" style={{ marginBottom: 14 }}>
                    <span>{erro}</span>
                  </div>
                )}

                <Button type="submit" block disabled={enviando || !email || !senha}>
                  {enviando
                    ? modo === 'entrar'
                      ? 'Entrando…'
                      : 'Criando…'
                    : modo === 'entrar'
                      ? 'Entrar'
                      : 'Criar conta'}
                </Button>
              </form>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
