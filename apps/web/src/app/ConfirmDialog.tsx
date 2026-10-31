import { useEffect, useRef, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { Button, Icon } from '@bid/ui';

/**
 * Confirmação antes de uma ação destrutiva (apagar proposta/obra, remover
 * acesso). Modal acessível: foco no botão de cancelar, Esc fecha, clique fora
 * fecha. Complementa (não substitui) o "Desfazer" do toast — regra #11.
 */
export function ConfirmDialog({
  aberto,
  titulo,
  children,
  confirmarLabel = 'Apagar',
  ocupado = false,
  onConfirmar,
  onCancelar,
}: {
  aberto: boolean;
  titulo: string;
  children?: ReactNode;
  confirmarLabel?: string;
  ocupado?: boolean;
  onConfirmar: () => void;
  onCancelar: () => void;
}) {
  const cancelarRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!aberto) return;
    cancelarRef.current?.focus();
    function onEsc(e: KeyboardEvent) {
      if (e.key === 'Escape') onCancelar();
    }
    document.addEventListener('keydown', onEsc);
    return () => document.removeEventListener('keydown', onEsc);
  }, [aberto, onCancelar]);

  if (!aberto) return null;

  // Portal para o quadro do aparelho (.device): fora da área rolável do
  // conteúdo, que no iOS cria um contexto próprio e deixava o modal atrás das
  // abas inferiores.
  return createPortal(
    <div className="confirm-backdrop" onMouseDown={onCancelar}>
      <div
        className="confirm"
        role="alertdialog"
        aria-modal="true"
        aria-labelledby="confirm-titulo"
        onMouseDown={(e) => e.stopPropagation()}
      >
        <span className="confirm-ic" aria-hidden="true">
          <Icon name="trash" />
        </span>
        <h2 id="confirm-titulo">{titulo}</h2>
        {children && <div className="confirm-body">{children}</div>}
        <div className="pair confirm-acoes">
          <Button type="button" variant="ghost" onClick={onCancelar} disabled={ocupado}>
            Cancelar
          </Button>
          <button type="button" className="btn danger" onClick={onConfirmar} disabled={ocupado}>
            {ocupado ? 'Aguarde…' : confirmarLabel}
          </button>
        </div>
      </div>
    </div>,
    document.querySelector('.device') ?? document.body,
  );
}
