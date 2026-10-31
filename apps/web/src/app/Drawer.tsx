import { useEffect, useRef, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { Icon } from '@bid/ui';

/**
 * Drawer de baixo para cima (bottom sheet) para detalhes: puxador, X, fecha
 * com Esc, toque fora ou arrastando para baixo. Conteúdo rola dentro dele.
 * `rodape` fica fixo embaixo (ação principal daquele conteúdo).
 */
export function Drawer({
  aberto,
  titulo,
  subtitulo,
  children,
  rodape,
  onFechar,
}: {
  aberto: boolean;
  titulo: ReactNode;
  subtitulo?: ReactNode;
  children: ReactNode;
  rodape?: ReactNode;
  onFechar: () => void;
}) {
  const fecharRef = useRef<HTMLButtonElement>(null);
  const [arrasto, setArrasto] = useState(0);
  const inicioY = useRef<number | null>(null);

  useEffect(() => {
    if (!aberto) return;
    fecharRef.current?.focus();
    function onEsc(e: KeyboardEvent) {
      if (e.key === 'Escape') onFechar();
    }
    document.addEventListener('keydown', onEsc);
    return () => document.removeEventListener('keydown', onEsc);
  }, [aberto, onFechar]);

  useEffect(() => {
    if (!aberto) setArrasto(0);
  }, [aberto]);

  if (!aberto) return null;

  // Arrastar o puxador/cabeçalho para baixo fecha (gesto nativo de sheet).
  function onTouchStart(e: React.TouchEvent) {
    inicioY.current = e.touches[0]?.clientY ?? null;
  }
  function onTouchMove(e: React.TouchEvent) {
    if (inicioY.current === null) return;
    const dy = (e.touches[0]?.clientY ?? 0) - inicioY.current;
    setArrasto(Math.max(0, dy));
  }
  function onTouchEnd() {
    if (arrasto > 90) onFechar();
    setArrasto(0);
    inicioY.current = null;
  }

  // Portal para o quadro do aparelho (.device), fora da área rolável do
  // conteúdo (no iOS ela "prende" o overlay atrás das abas).
  return createPortal(
    <div className="drawer-backdrop" onMouseDown={onFechar}>
      <div
        className="drawer"
        role="dialog"
        aria-modal="true"
        aria-labelledby="drawer-titulo"
        style={arrasto ? { transform: `translateY(${arrasto}px)`, transition: 'none' } : undefined}
        onMouseDown={(e) => e.stopPropagation()}
      >
        <div
          className="drawer-head"
          onTouchStart={onTouchStart}
          onTouchMove={onTouchMove}
          onTouchEnd={onTouchEnd}
        >
          <span className="drawer-grab" aria-hidden="true" />
          <button ref={fecharRef} type="button" className="drawer-x" aria-label="Fechar" onClick={onFechar}>
            <Icon name="x" />
          </button>
          <h2 id="drawer-titulo">{titulo}</h2>
          {subtitulo && <p className="drawer-sub">{subtitulo}</p>}
        </div>
        <div className="drawer-body">{children}</div>
        {rodape && <div className="drawer-foot">{rodape}</div>}
      </div>
    </div>,
    document.querySelector('.device') ?? document.body,
  );
}
