import { useRegisterSW } from 'virtual:pwa-register/react';
import { Icon } from '@bid/ui';

const CHECAR_A_CADA_MS = 60 * 1000;

/**
 * Aviso de versão nova do PWA. O service worker baixa a atualização em segundo
 * plano; quando ela está pronta, mostramos um botão fixo acima das abas para
 * aplicar na hora (sem esperar o usuário fechar e reabrir o app). Também
 * verificamos periodicamente e ao voltar para o app se há versão nova.
 */
export function AtualizacaoApp() {
  const {
    needRefresh: [precisa, setPrecisa],
    updateServiceWorker,
  } = useRegisterSW({
    onRegisteredSW(_url, reg) {
      if (!reg) return;
      const checar = () => {
        if (document.visibilityState === 'visible') void reg.update();
      };
      const id = setInterval(checar, CHECAR_A_CADA_MS);
      document.addEventListener('visibilitychange', checar);
      window.addEventListener('focus', checar);
      // Sem lugar para limpar aqui (registro é único por página); o intervalo
      // vive enquanto o app estiver aberto.
      void id;
    },
  });

  // Só renderiza quando há versão pronta.
  if (!precisa) return null;

  return (
    <div className="upd" role="status" aria-live="polite">
      <span className="upd-t">
        <Icon name="spark" /> Nova versão disponível
      </span>
      <button type="button" className="upd-btn" onClick={() => void updateServiceWorker(true)}>
        Atualizar
      </button>
      <button type="button" className="upd-x" aria-label="Depois" onClick={() => setPrecisa(false)}>
        <Icon name="x" />
      </button>
    </div>
  );
}
