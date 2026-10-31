import { useEffect, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';

export const BARRA_ACAO_ID = 'barra-acao';

/**
 * Barra de ação FIXA acima das abas (opção A aprovada): a tela declara seu
 * botão principal e ele fica sempre visível, fora da área rolável, no alcance
 * do polegar. Renderiza via portal no slot `#barra-acao` do AppShell.
 */
export function BarraAcao({ children }: { children: ReactNode }) {
  const [slot, setSlot] = useState<HTMLElement | null>(null);
  useEffect(() => {
    setSlot(document.getElementById(BARRA_ACAO_ID));
  }, []);
  if (!slot) return null;
  return createPortal(<div className="barra-acao-in">{children}</div>, slot);
}
