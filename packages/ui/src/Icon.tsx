import type { SVGProps } from 'react';

/** Ícones lineares arredondados, inline SVG (sem emoji na UI). currentColor herda a cor. */
export type IconName =
  | 'chev'
  | 'back'
  | 'plus'
  | 'scale'
  | 'trophy'
  | 'spark'
  | 'check'
  | 'x'
  | 'tilde'
  | 'doc'
  | 'clock'
  | 'bldg'
  | 'layers'
  | 'alert'
  | 'link'
  | 'upload'
  | 'dl'
  | 'search'
  | 'arrow'
  | 'bell'
  | 'tab-propostas'
  | 'tab-equalizacoes'
  | 'tab-contratos'
  | 'tab-obras';

const PATHS: Record<IconName, { sw: number; el: React.ReactNode }> = {
  chev: { sw: 2.2, el: <path d="m9 18 6-6-6-6" /> },
  back: { sw: 2.3, el: <path d="m15 18-6-6 6-6" /> },
  plus: { sw: 2.2, el: <path d="M12 5v14M5 12h14" /> },
  scale: { sw: 1.9, el: <path d="M12 3v18M7 7l-4 7h8zM17 7l-4 7h8zM8 21h8M5 7h14" /> },
  trophy: {
    sw: 1.9,
    el: <path d="M6 4h12v4a6 6 0 0 1-12 0z M6 6H3v2a3 3 0 0 0 3 3M18 6h3v2a3 3 0 0 1-3 3M9 18h6M10 14v4M14 14v4M8 21h8" />,
  },
  spark: {
    sw: 1.9,
    el: <path d="M12 3v4M12 17v4M3 12h4M17 12h4M5.6 5.6l2.8 2.8M15.6 15.6l2.8 2.8M18.4 5.6l-2.8 2.8M8.4 15.6l-2.8 2.8" />,
  },
  check: { sw: 2.6, el: <path d="m5 12 5 5L20 7" /> },
  x: { sw: 2.6, el: <path d="M6 6l12 12M18 6 6 18" /> },
  tilde: { sw: 2.4, el: <path d="M4 13c1.5-3 3.5-3 5 0s3.5 3 5 0 3.5-3 5 0" /> },
  doc: { sw: 1.9, el: <path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z M14 3v5h5" /> },
  clock: { sw: 1.9, el: <><circle cx="12" cy="12" r="9" /><path d="M12 7v5l3 2" /></> },
  bldg: { sw: 1.9, el: <path d="M3 21h18M5 21V7l8-4v18M19 21V11l-6-4" /> },
  layers: { sw: 1.9, el: <path d="m12 3 9 5-9 5-9-5 9-5z M3 13l9 5 9-5" /> },
  alert: {
    sw: 1.9,
    el: <path d="M12 9v4M12 17h.01M10.3 3.3 1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.3a2 2 0 0 0-3.4 0z" />,
  },
  link: {
    sw: 1.9,
    el: <path d="M10 13a5 5 0 0 0 7 0l3-3a5 5 0 0 0-7-7l-1 1M14 11a5 5 0 0 0-7 0l-3 3a5 5 0 0 0 7 7l1-1" />,
  },
  upload: { sw: 1.9, el: <path d="M12 15V3M8 7l4-4 4 4M4 15v4a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-4" /> },
  dl: { sw: 1.9, el: <path d="M12 3v12M8 11l4 4 4-4M4 21h16" /> },
  search: { sw: 2, el: <><circle cx="11" cy="11" r="7" /><path d="m21 21-4.3-4.3" /></> },
  arrow: { sw: 2, el: <path d="M5 12h14M13 6l6 6-6 6" /> },
  bell: { sw: 1.9, el: <path d="M18 8a6 6 0 0 0-12 0c0 7-3 9-3 9h18s-3-2-3-9M13.7 21a2 2 0 0 1-3.4 0" /> },
  'tab-propostas': { sw: 1.9, el: <><rect x="4" y="3" width="16" height="18" rx="2.5" /><path d="M8 8h8M8 12h8M8 16h5" /></> },
  'tab-equalizacoes': { sw: 1.9, el: <path d="M12 3v18M7 7l-4 7h8zM17 7l-4 7h8zM8 21h8M5 7h14" /> },
  'tab-contratos': { sw: 1.9, el: <path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z M14 3v5h5M9 13h6M9 17h4" /> },
  'tab-obras': { sw: 1.9, el: <path d="M3 21h18M5 21V7l8-4v18M19 21V11l-6-4" /> },
};

export interface IconProps extends Omit<SVGProps<SVGSVGElement>, 'name'> {
  name: IconName;
}

export function Icon({ name, ...props }: IconProps) {
  const def = PATHS[name];
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={def.sw}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      {...props}
    >
      {def.el}
    </svg>
  );
}
