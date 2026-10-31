import { useRef, useState, type ReactNode } from 'react';
import { Icon } from '@bid/ui';

const ABERTO = 84; // largura da ação revelada
const LIMIAR = 40; // a partir daqui, solta e fica aberto

/**
 * Linha de lista com "arrastar para o lado → lixeira" (padrão iOS). Arrastar
 * para a esquerda revela o botão vermelho; tocar nele dispara `onApagar` — que
 * SEMPRE abre a confirmação (regra #11). Toque na linha aberta só a fecha.
 * Sem `onApagar`, a linha é comum (sem gesto).
 */
export function SwipeRow({
  children,
  onApagar,
  rotulo = 'Apagar',
  className,
}: {
  children: ReactNode;
  onApagar?: () => void;
  rotulo?: string;
  className?: string;
}) {
  const [x, setX] = useState(0);
  const [arrastando, setArrastando] = useState(false);
  const inicio = useRef<{ x: number; y: number; base: number; decidido: boolean | null } | null>(null);
  const moveu = useRef(false);

  if (!onApagar) return <>{children}</>;

  function onPointerDown(e: React.PointerEvent) {
    if (e.pointerType === 'mouse' && e.button !== 0) return;
    inicio.current = { x: e.clientX, y: e.clientY, base: x, decidido: null };
    moveu.current = false;
  }
  function onPointerMove(e: React.PointerEvent) {
    const s = inicio.current;
    if (!s) return;
    const dx = e.clientX - s.x;
    const dy = e.clientY - s.y;
    // Decide uma vez: gesto horizontal (nosso) ou vertical (rolagem da página).
    if (s.decidido === null) {
      if (Math.abs(dx) < 6 && Math.abs(dy) < 6) return;
      s.decidido = Math.abs(dx) > Math.abs(dy);
      if (!s.decidido) {
        inicio.current = null;
        return;
      }
      setArrastando(true);
      (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    }
    moveu.current = true;
    const alvo = Math.max(-ABERTO, Math.min(0, s.base + dx));
    setX(alvo);
  }
  function onPointerUp() {
    const s = inicio.current;
    inicio.current = null;
    setArrastando(false);
    if (!s) return;
    setX(x < -LIMIAR ? -ABERTO : 0);
  }
  // Clique na linha aberta: só fecha (não navega).
  function onClickCapture(e: React.MouseEvent) {
    if (moveu.current || x !== 0) {
      e.stopPropagation();
      e.preventDefault();
      moveu.current = false;
      setX(0);
    }
  }

  return (
    <div className={`swipe ${className ?? ''} ${x < 0 ? 'open' : ''}`}>
      <button
        type="button"
        className="swipe-act"
        tabIndex={x < 0 ? 0 : -1}
        aria-hidden={x === 0}
        onClick={() => {
          setX(0);
          onApagar();
        }}
      >
        <Icon name="trash" />
        <span>{rotulo}</span>
      </button>
      <div
        className="swipe-body"
        style={{ transform: `translateX(${x}px)`, transition: arrastando ? 'none' : 'transform 180ms ease-out' }}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
        onClickCapture={onClickCapture}
      >
        {children}
      </div>
    </div>
  );
}
