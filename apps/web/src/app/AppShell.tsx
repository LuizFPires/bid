import { Outlet, useLocation, useNavigate } from 'react-router-dom';
import { BrandLogo, Icon, TabBar, type TabKey } from '@bid/ui';
import { ToastProvider } from './Toast';
import { ProfileMenu } from './ProfileMenu';

/** Casca do app: topo com a marca, conteúdo roteado e abas inferiores. */
export function AppShell() {
  const navigate = useNavigate();
  const location = useLocation();

  const active = (location.pathname.split('/')[1] || 'propostas') as TabKey;

  return (
    <div className="stage">
      <div className="device">
        <ToastProvider>
        <header className="topbar">
          <BrandLogo />
          {active === 'propostas' && (
            <button
              className="ticon"
              type="button"
              aria-label="Nova proposta"
              style={{ marginLeft: 'auto' }}
              onClick={() => navigate('/propostas/nova')}
            >
              <Icon name="plus" />
            </button>
          )}
          {active === 'equalizacoes' && (
            <button
              className="ticon"
              type="button"
              aria-label="Iniciar equalização"
              style={{ marginLeft: 'auto' }}
              onClick={() => navigate('/equalizacoes/nova')}
            >
              <Icon name="plus" />
            </button>
          )}
          {active === 'contratos' && (
            <button
              className="ticon"
              type="button"
              aria-label="Novo contrato"
              style={{ marginLeft: 'auto' }}
              onClick={() => navigate('/contratos/nova')}
            >
              <Icon name="plus" />
            </button>
          )}
          {active === 'obras' && (
            <button
              className="ticon"
              type="button"
              aria-label="Nova obra"
              style={{ marginLeft: 'auto' }}
              onClick={() => navigate('/obras/nova')}
            >
              <Icon name="plus" />
            </button>
          )}
          <ProfileMenu />
        </header>

        <main className="content">
          <Outlet />
        </main>

          <TabBar active={active} onNavigate={(key) => navigate(`/${key}`)} />
        </ToastProvider>
      </div>
    </div>
  );
}
