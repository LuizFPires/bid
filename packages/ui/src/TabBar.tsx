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
  /** Contadores de pendência por aba (ex.: equalizações com IA em andamento). */
  badges?: Partial<Record<TabKey, number>>;
}

export function TabBar({ active, onNavigate, badges }: TabBarProps) {
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
            {(badges?.[t.key] ?? 0) > 0 && (
              <span className="tb-badge" aria-label={`${badges?.[t.key]} em andamento`}>
                {(badges?.[t.key] ?? 0) > 9 ? '9+' : badges?.[t.key]}
              </span>
            )}
          </span>
          {t.label}
        </button>
      ))}
    </nav>
  );
}
