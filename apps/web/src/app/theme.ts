/**
 * Tema do app: "auto" segue o sistema; "claro"/"escuro" fixam via
 * `data-theme` no <html> (os tokens já respondem a isso). A escolha fica no
 * localStorage e é aplicada antes do primeiro paint por um script no index.html.
 */
export type Tema = 'auto' | 'claro' | 'escuro';

export const TEMA_KEY = 'bid.tema';

export function lerTema(): Tema {
  try {
    const v = localStorage.getItem(TEMA_KEY);
    return v === 'claro' || v === 'escuro' ? v : 'auto';
  } catch {
    return 'auto';
  }
}

export function aplicarTema(t: Tema) {
  const el = document.documentElement;
  if (t === 'auto') delete el.dataset.theme;
  else el.dataset.theme = t === 'escuro' ? 'dark' : 'light';
}

export function salvarTema(t: Tema) {
  try {
    if (t === 'auto') localStorage.removeItem(TEMA_KEY);
    else localStorage.setItem(TEMA_KEY, t);
  } catch {
    /* sem storage (modo privado): só aplica na sessão */
  }
  aplicarTema(t);
}
