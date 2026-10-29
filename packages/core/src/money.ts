/** Dinheiro em reais (BRL). Valores são números em reais (não centavos). */

const BRL = new Intl.NumberFormat('pt-BR', {
  style: 'currency',
  currency: 'BRL',
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

/** Formata no padrão brasileiro: 1234567.8 → "R$ 1.234.567,80". */
export function formatBRL(valor: number): string {
  return BRL.format(valor);
}

/** Forma compacta para listas apertadas: 1284500 → "R$ 1,28 mi". */
export function formatBRLCompact(valor: number): string {
  if (Math.abs(valor) >= 1_000_000) {
    return `R$ ${formatNumber(valor / 1_000_000, 2)} mi`;
  }
  if (Math.abs(valor) >= 1_000) {
    return `R$ ${formatNumber(valor / 1_000, 0)} mil`;
  }
  return formatBRL(valor);
}

/** Número no padrão brasileiro com casas fixas: (1234.5, 2) → "1.234,50". */
export function formatNumber(valor: number, casas = 2): string {
  return new Intl.NumberFormat('pt-BR', {
    minimumFractionDigits: casas,
    maximumFractionDigits: casas,
  }).format(valor);
}

/** Converte texto no padrão brasileiro para número: "1.284.500,00" → 1284500. */
export function parseBRL(texto: string): number | null {
  const limpo = texto
    .replace(/\s|R\$|r\$/g, '')
    .replace(/\./g, '')
    .replace(',', '.');
  if (limpo === '' || Number.isNaN(Number(limpo))) return null;
  return Number(limpo);
}
