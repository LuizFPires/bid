import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';

export interface ToastOpts {
  actionLabel?: string;
  onAction?: () => void;
  /** ms até sumir (padrão 5s — regra #11). */
  duration?: number;
}

interface ToastState {
  message: string;
  actionLabel?: string;
  onAction?: () => void;
}

const ToastCtx = createContext<(message: string, opts?: ToastOpts) => void>(() => {});

/** Acesso ao toast. Use para feedback com "Desfazer" em ações reversíveis. */
export function useToast() {
  return useContext(ToastCtx);
}

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toast, setToast] = useState<ToastState | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const limpar = useCallback(() => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = null;
  }, []);

  const show = useCallback(
    (message: string, opts?: ToastOpts) => {
      limpar();
      setToast({ message, actionLabel: opts?.actionLabel, onAction: opts?.onAction });
      timer.current = setTimeout(() => setToast(null), opts?.duration ?? 5000);
    },
    [limpar],
  );

  const fechar = useCallback(() => {
    limpar();
    setToast(null);
  }, [limpar]);

  // Limpa o timer pendente ao desmontar (evita setToast após unmount).
  useEffect(() => limpar, [limpar]);

  const ctx = useMemo(() => show, [show]);

  return (
    <ToastCtx.Provider value={ctx}>
      {children}
      {toast && (
        <div className="toast-wrap" role="status" aria-live="polite">
          <div className="toast">
            <span className="msg">{toast.message}</span>
            {toast.actionLabel && (
              <button
                type="button"
                onClick={() => {
                  toast.onAction?.();
                  fechar();
                }}
              >
                {toast.actionLabel}
              </button>
            )}
          </div>
        </div>
      )}
    </ToastCtx.Provider>
  );
}
