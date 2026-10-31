import { useEffect, useRef, useState, type ReactNode } from 'react';
import { Icon, type IconName } from '@bid/ui';

export interface KebabItem {
  label: ReactNode;
  icon: IconName;
  onClick: () => void;
  danger?: boolean;
  disabled?: boolean;
}

/** Menu de 3 pontinhos (⋮) do cabeçalho: fecha com Esc e clique fora. */
export function Kebab({ itens, ariaLabel = 'Mais ações' }: { itens: KebabItem[]; ariaLabel?: string }) {
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
        aria-label={ariaLabel}
        aria-haspopup="menu"
        aria-expanded={aberto}
        onClick={() => setAberto((v) => !v)}
      >
        <Icon name="dots" />
      </button>
      {aberto && (
        <div className="kebab-menu" role="menu">
          {itens.map((it, i) => (
            <button
              key={i}
              type="button"
              role="menuitem"
              className={`kebab-item ${it.danger ? 'danger' : ''}`}
              disabled={it.disabled}
              onClick={() => {
                setAberto(false);
                it.onClick();
              }}
            >
              <Icon name={it.icon} />
              {it.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
