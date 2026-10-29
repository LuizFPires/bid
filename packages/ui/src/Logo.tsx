import type { SVGProps } from 'react';

/**
 * Logomarca do bid: propostas empilhadas em 3D (três camadas).
 * Símbolo conforme o protótipo aprovado — NÃO redesenhar a geometria.
 * Usa currentColor para herdar a cor do contexto (o badge define a tinta).
 */
export function LogoMark(props: SVGProps<SVGSVGElement>) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      {...props}
    >
      <path d="M3 7l9-4 9 4-9 4-9-4z" />
      <path d="M3 12l9 4 9-4" />
      <path d="M3 17l9 4 9-4" />
    </svg>
  );
}

export interface BrandLogoProps {
  /** Mostra o texto "bid" ao lado do símbolo. */
  withWordmark?: boolean;
  className?: string;
}

/** Símbolo dentro do badge índigo + marca "bid" (minúsculas), como no topo do app. */
export function BrandLogo({ withWordmark = true, className }: BrandLogoProps) {
  return (
    <span
      className={className}
      style={{ display: 'inline-flex', alignItems: 'center', gap: 11 }}
    >
      <span
        className="logo"
        style={{
          width: 30,
          height: 30,
          borderRadius: 9,
          background: 'var(--accent)',
          color: 'var(--accent-ink)',
          display: 'grid',
          placeItems: 'center',
          flex: '0 0 auto',
        }}
      >
        <LogoMark style={{ width: 18, height: 18 }} />
      </span>
      {withWordmark && (
        <span className="name" style={{ fontWeight: 900, letterSpacing: '0.09em', fontSize: 15 }}>
          bid
        </span>
      )}
    </span>
  );
}
