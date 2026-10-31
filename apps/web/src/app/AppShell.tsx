import { Outlet, useLocation, useNavigate } from 'react-router-dom';
import { BrandLogo, Icon, TabBar, type TabKey } from '@bid/ui';
import { ToastProvider } from './Toast';
import { ProfileMenu } from './ProfileMenu';
import { AtualizacaoApp } from './AtualizacaoApp';
import { useAnalisesEmAndamento, useEqualizacoes } from '../data/hooks';
import { useLote } from '../data/lote';
import { resumoLote } from '@bid/core';

/** Ação principal de cada aba: rótulo curto no botão, nome completo no aria-label. */
const CTA: Partial<Record<TabKey, { label: string; aria: string; to: string }>> = {
  propostas: { label: 'Proposta', aria: 'Nova proposta', to: '/propostas/nova' },
  equalizacoes: { label: 'Equalizar', aria: 'Iniciar equalização', to: '/equalizacoes/nova' },
  contratos: { label: 'Contrato', aria: 'Novo contrato', to: '/contratos/nova' },
  obras: { label: 'Obra', aria: 'Nova obra', to: '/obras/nova' },
};

/** Casca do app: topo com a marca, conteúdo roteado e abas inferiores. */
export function AppShell() {
  const navigate = useNavigate();
  const location = useLocation();

  const active = (location.pathname.split('/')[1] || 'propostas') as TabKey;
  const cta = CTA[active];
  // Pendência na aba Equalizar: quantas análises por IA estão em andamento.
  const eqs = useEqualizacoes();
  const gerando = useAnalisesEmAndamento((eqs.data ?? []).map((e) => e.id));
  // Pendência na aba Propostas: lote com arquivos ainda em leitura.
  const lote = useLote();
  const loteLendo = lote ? resumoLote(lote).emAndamento : 0;

  return (
    <div className="stage">
      <div className="device">
        <ToastProvider>
        <header className="topbar">
          <BrandLogo />
          {cta && (
            <button className="cta" type="button" aria-label={cta.aria} onClick={() => navigate(cta.to)}>
              <Icon name="plus" />
              <span className="lbl">{cta.label}</span>
            </button>
          )}
          <ProfileMenu />
        </header>

        <main className="content">
          <Outlet />
        </main>

          <div id="barra-acao" className="barra-acao" />
          <AtualizacaoApp />
          <TabBar
            active={active}
            onNavigate={(key) => navigate(`/${key}`)}
            badges={{ equalizacoes: gerando.size, propostas: loteLendo }}
          />
        </ToastProvider>
      </div>
    </div>
  );
}
