import type { SVGProps } from 'react';

/**
 * Marca do bid (identidade aprovada em 30/10/2026).
 *
 * Geometria copiada dos SVGs do pacote de marca — NÃO redesenhar nem alterar
 * viewBoxes/transformações. O badge roxo arredondado contém duas folhas
 * sobrepostas em branco sólido (formas preenchidas, sem stroke, opacidade 1);
 * o lettering "bid" é um path vetorial próprio (corte diagonal no topo do "d"),
 * não texto em fonte.
 *
 * Cores por variáveis CSS (tokens.css): --brand-badge, --brand-paper,
 * --brand-wordmark. No tema escuro o badge usa a mesma cor do botão "+"
 * (var(--accent-soft)). Dimensões e espaçamento em brand.css.
 */

/** Duas folhas sobrepostas (símbolo), no sistema de coordenadas 58 × 64. */
const SIMBOLO_PATH = 'M0 0H42V8H8V50H0Z M14 14H49L58 23V64H14Z';

/** Lettering "bid" como path (prancheta -.6 -2.6 179.2 100.2 do SVG original). */
const LETTERING_PATH =
  'M0.0 0.0H18.0V32.0C23.0 27.0 30.0 25.0 37.0 25.0C57.0 25.0 73.0 41.0 73.0 61.0C73.0 81.0 57.0 97.0 37.0 97.0C29.0 97.0 22.0 94.0 18.0 90.0V96.0H0.0V0.0ZM55.0 61.0C55.00000014813431 51.05887439829894 46.94112560170105 42.9999997317791 37.0 42.9999997317791C27.05887439829894 42.9999997317791 18.999999851865685 51.05887439829894 18.999999999999996 61.0C18.999999851865685 70.94112560170106 27.05887439829894 79.0000002682209 37.0 79.0000002682209C46.941125601701046 79.0000002682209 55.00000014813431 70.94112560170106 55.0 61.00000000000001ZM80.0 26.0H98.0V96.0H80.0V26.0ZM99.0 8.0C99.0 2.477152501692067 94.52284749830793 -1.9999999999999993 89.0 -1.9999999999999996C83.47715250169207 -1.9999999999999996 79.0 2.477152501692066 79.0 7.999999999999999C79.0 13.522847498307936 83.47715250169207 18.0 89.0 18.0C94.52284749830793 18.0 99.0 13.522847498307936 99.0 8.0ZM178.0 10.0 168.0 0.0H160.0V32.0C155.0 27.0 148.0 25.0 141.0 25.0C121.0 25.0 105.0 41.0 105.0 61.0C105.0 81.0 121.0 97.0 141.0 97.0C149.0 97.0 156.0 94.0 160.0 90.0V96.0H178.0V10.0ZM159.0 61.0C159.0 51.05887450304572 150.94112549695427 43.0 141.0 43.0C131.05887450304573 43.0 123.0 51.05887450304572 123.0 61.0C123.0 70.94112549695429 131.05887450304573 79.0 141.0 79.0C150.94112549695427 79.0 159.0 70.94112549695427 159.0 61.0Z';

/** Badge (quadrado arredondado) + duas folhas, no sistema 32 × 32 do SVG `bid-badge`. */
function BadgeShapes() {
  return (
    <>
      <rect className="brand-logo__badge" width={32} height={32} rx={9} fill="var(--brand-badge)" />
      <path
        className="brand-logo__paper"
        d={SIMBOLO_PATH}
        transform="translate(6.9375 6) scale(.3125)"
        fill="var(--brand-paper)"
        fillOpacity={1}
      />
    </>
  );
}

/**
 * Símbolo da marca: badge roxo arredondado com as duas folhas brancas
 * (equivale ao `bid-badge.svg`, viewBox 0 0 32 32). Decorativo por padrão
 * (`aria-hidden`); passe `role="img"` e `aria-label` para uso autônomo.
 */
export function LogoMark(props: SVGProps<SVGSVGElement>) {
  return (
    <svg
      viewBox="0 0 32 32"
      className="brand-logo brand-logo--badge"
      aria-hidden="true"
      focusable="false"
      {...props}
    >
      <BadgeShapes />
    </svg>
  );
}

export interface BrandLogoProps {
  /** Mostra o lettering "bid" ao lado do badge. */
  withWordmark?: boolean;
  className?: string;
}

/**
 * Marca completa (badge + lettering), prancheta 94 × 32 como em
 * `bid-logo-fundo-*.svg`. Com `withWordmark={false}` renderiza só o badge (32 × 32).
 * Nome acessível "bid" no próprio SVG; não repita o nome nos paths internos.
 */
export function BrandLogo({ withWordmark = true, className }: BrandLogoProps) {
  const classes = ['brand-logo', withWordmark ? 'brand-logo--full' : 'brand-logo--badge', className]
    .filter(Boolean)
    .join(' ');
  return (
    <svg
      viewBox={withWordmark ? '0 0 94 32' : '0 0 32 32'}
      className={classes}
      role="img"
      aria-label="bid"
      focusable="false"
    >
      <BadgeShapes />
      {withWordmark && (
        <g className="brand-logo__wordmark" transform="translate(42.168 2.748) scale(.28)">
          <path
            d={LETTERING_PATH}
            fill="var(--brand-wordmark)"
            fillRule="evenodd"
            stroke="var(--brand-wordmark)"
            strokeWidth={1.2}
            strokeLinejoin="round"
          />
        </g>
      )}
    </svg>
  );
}
