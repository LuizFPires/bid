import { useState, type FormEvent } from 'react';
import { BrandLogo, Button } from '@bid/ui';
import { supabase } from '../lib/supabase';
import { useAuth } from './AuthProvider';
import { Olho } from './Olho';

/** Tela de definir nova senha (fluxo "esqueci minha senha"). */
export function NovaSenhaScreen() {
  const { clearRecovering } = useAuth();
  const [senha, setSenha] = useState('');
  const [confirmar, setConfirmar] = useState('');
  const [mostrar, setMostrar] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [salvando, setSalvando] = useState(false);

  async function salvar(e: FormEvent) {
    e.preventDefault();
    if (!supabase) return;
    setErro(null);
    if (senha.length < 6) {
      setErro('A senha precisa ter ao menos 6 caracteres.');
      return;
    }
    if (senha !== confirmar) {
      setErro('As senhas não coincidem.');
      return;
    }
    setSalvando(true);
    const { error } = await supabase.auth.updateUser({ password: senha });
    setSalvando(false);
    if (error) setErro(error.message);
    else clearRecovering(); // já está logado com a nova senha
  }

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
            <h1 style={{ fontSize: 24 }}>Nova senha</h1>
            <p className="lead">Defina a nova senha da sua conta.</p>
          </div>

          <form onSubmit={salvar}>
            <div className="field">
              <label htmlFor="nova">Nova senha</label>
              <div style={{ position: 'relative' }}>
                <input
                  id="nova"
                  type={mostrar ? 'text' : 'password'}
                  required
                  autoComplete="new-password"
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

            <div className="field">
              <label htmlFor="conf">Confirmar senha</label>
              <input
                id="conf"
                type={mostrar ? 'text' : 'password'}
                required
                autoComplete="new-password"
                placeholder="Repita a senha"
                value={confirmar}
                onChange={(e) => setConfirmar(e.target.value)}
              />
            </div>

            {erro && (
              <div className="banner warn" role="alert" style={{ marginBottom: 14 }}>
                <span>{erro}</span>
              </div>
            )}

            <Button type="submit" block disabled={salvando || !senha}>
              {salvando ? 'Salvando…' : 'Salvar nova senha'}
            </Button>
          </form>
        </div>
      </div>
    </div>
  );
}
