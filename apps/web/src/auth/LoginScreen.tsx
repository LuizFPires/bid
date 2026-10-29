import { useState, type FormEvent } from 'react';
import { BrandLogo, Button } from '@bid/ui';
import { supabase, supabaseConfigured } from '../lib/supabase';

export function LoginScreen() {
  const [email, setEmail] = useState('');
  const [enviado, setEnviado] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [enviando, setEnviando] = useState(false);

  async function entrar(e: FormEvent) {
    e.preventDefault();
    if (!supabase) return;
    setEnviando(true);
    setErro(null);
    const { error } = await supabase.auth.signInWithOtp({
      email,
      options: { emailRedirectTo: window.location.origin },
    });
    setEnviando(false);
    if (error) setErro(error.message);
    else setEnviado(true);
  }

  return (
    <div className="stage">
      <div className="device">
        <div
          className="content"
          style={{ display: 'flex', flexDirection: 'column', justifyContent: 'center', gap: 20 }}
        >
          <div style={{ display: 'flex', justifyContent: 'center' }}>
            <BrandLogo />
          </div>
          <div className="page-head" style={{ textAlign: 'center', margin: 0 }}>
            <h1 style={{ fontSize: 24 }}>Entrar</h1>
            <p className="lead">Propostas, equalização e contratos de obra.</p>
          </div>

          {!supabaseConfigured ? (
            <div className="banner warn" role="status">
              <span>
                Supabase ainda não configurado. Defina <code>VITE_SUPABASE_URL</code> e{' '}
                <code>VITE_SUPABASE_ANON_KEY</code> no <code>.env</code> para habilitar o login por
                link mágico.
              </span>
            </div>
          ) : enviado ? (
            <div className="banner ok" role="status">
              <span>Link enviado para {email}. Abra o e-mail para entrar.</span>
            </div>
          ) : (
            <form onSubmit={entrar}>
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
              {erro && (
                <div className="banner warn" role="alert" style={{ marginBottom: 14 }}>
                  <span>{erro}</span>
                </div>
              )}
              <Button type="submit" block disabled={enviando || !email}>
                {enviando ? 'Enviando…' : 'Receber link mágico'}
              </Button>
            </form>
          )}
        </div>
      </div>
    </div>
  );
}
