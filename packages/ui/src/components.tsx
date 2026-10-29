import type { ButtonHTMLAttributes, HTMLAttributes, ReactNode } from 'react';
import { Icon, type IconName } from './Icon';

/* ---------- Button ---------- */
export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'primary' | 'ghost' | 'soft';
  size?: 'md' | 'sm';
  block?: boolean;
  icon?: IconName;
}

export function Button({
  variant = 'primary',
  size = 'md',
  block,
  icon,
  className = '',
  children,
  ...rest
}: ButtonProps) {
  const cls = ['btn', variant, size === 'sm' ? 'sm' : '', block ? 'block' : '', className]
    .filter(Boolean)
    .join(' ');
  return (
    <button className={cls} {...rest}>
      {icon && <Icon name={icon} />}
      {children}
    </button>
  );
}

/* ---------- Card ---------- */
export function Card({ className = '', children, ...rest }: HTMLAttributes<HTMLDivElement>) {
  return (
    <div className={`card ${className}`.trim()} {...rest}>
      {children}
    </div>
  );
}

/* ---------- Pill (status) ---------- */
export type StatusTone = 'aberta' | 'analise' | 'adjudicada' | 'neutro';

export interface PillProps {
  tone: StatusTone;
  children: ReactNode;
  /** Mostra o ponto colorido antes do texto (semântica com texto + forma, não só cor). */
  dot?: boolean;
}

export function Pill({ tone, children, dot = true }: PillProps) {
  return (
    <span className={`pill ${tone}`}>
      {dot && <span className={`dot ${tone}`} />}
      {children}
    </span>
  );
}
