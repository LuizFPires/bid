import { Icon, type IconName } from './Icon';

/** Abas inferiores na ordem das prioridades do produto. */
export type TabKey = 'propostas' | 'equalizacoes' | 'contratos' | 'obras';

interface TabDef {
  key: TabKey;
  label: string;
  icon: IconName;
}

export const TABS: readonly TabDef[] = [
  { key: 'propostas', label: 'Propostas', icon: 'tab-propostas' },
  { key: 'equalizacoes', label: 'Equalizar', icon: 'tab-equalizacoes' },
  { key: 'contratos', label: 'Contratos', icon: 'tab-contratos' },
  { key: 'obras', label: 'Obras', icon: 'tab-obras' },
] as const;

export interface TabBarProps {
  active: TabKey;
  onNavigate: (key: TabKey) => void;
}

export function TabBar({ active, onNavigate }: TabBarProps) {
  return (
    <nav className="tabbar" aria-label="Navegação principal">
      {TABS.map((t) => (
        <button
          key={t.key}
          type="button"
          className={`tab ${active === t.key ? 'on' : ''}`.trim()}
          aria-current={active === t.key ? 'page' : undefined}
          onClick={() => onNavigate(t.key)}
        >
          <span className="tb">
            <Icon name={t.icon} />
          </span>
          {t.label}
        </button>
      ))}
    </nav>
  );
}
