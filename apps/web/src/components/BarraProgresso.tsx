import { createPortal } from 'react-dom';

export interface Progresso {
  /** Texto curto do que está acontecendo ("Gerando o relatório…"). */
  rotulo: string;
  /** 0–1 quando se sabe o avanço; null = indeterminado (barra deslizante). */
  fracao: number | null;
}

/**
 * Barrinha de progresso fixa acima das abas, para operações de alguns segundos
 * (gerar/baixar PDF). Portal no `.device`, como o toast, para não ficar atrás
 * das abas no iOS. Some quando `progresso` é null.
 */
export function BarraProgresso({ progresso }: { progresso: Progresso | null }) {
  if (!progresso) return null;
  const pct = progresso.fracao == null ? null : Math.max(0, Math.min(100, Math.round(progresso.fracao * 100)));
  return createPortal(
    <div className="prog-wrap" role="status" aria-live="polite">
      <div className="prog">
        <div className="prog-head">
          <span className="prog-t">{progresso.rotulo}</span>
          {pct != null && <span className="prog-pct">{pct}%</span>}
        </div>
        <div
          className={`prog-bar${pct == null ? ' indeterminada' : ''}`}
          role="progressbar"
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={pct ?? undefined}
        >
          <span className="prog-fill" style={pct != null ? { width: `${pct}%` } : undefined} />
        </div>
      </div>
    </div>,
    document.querySelector('.device') ?? document.body,
  );
}
