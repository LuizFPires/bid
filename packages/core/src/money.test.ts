import { describe, it, expect } from 'vitest';
import { formatBRL, formatBRLCompact, formatNumber, parseBRL } from './money';

//   é o espaço fino que o Intl insere depois de "R$".
const nbsp = ' ';

describe('formatBRL', () => {
  it('formata no padrão brasileiro', () => {
    expect(formatBRL(1234567.8)).toBe(`R$${nbsp}1.234.567,80`);
    expect(formatBRL(0)).toBe(`R$${nbsp}0,00`);
  });
});

describe('formatBRLCompact', () => {
  it('abrevia milhões e milhares', () => {
    expect(formatBRLCompact(1284500)).toBe('R$ 1,28 mi');
    expect(formatBRLCompact(45000)).toBe('R$ 45 mil');
    expect(formatBRLCompact(900)).toBe(`R$${nbsp}900,00`);
  });
});

describe('formatNumber', () => {
  it('usa vírgula decimal e ponto de milhar', () => {
    expect(formatNumber(1234.5, 2)).toBe('1.234,50');
    expect(formatNumber(12, 0)).toBe('12');
  });
});

describe('parseBRL', () => {
  it('lê valores em pt-BR', () => {
    expect(parseBRL('1.284.500,00')).toBe(1284500);
    expect(parseBRL('R$ 1.234,56')).toBe(1234.56);
    expect(parseBRL('99')).toBe(99);
  });
  it('retorna null para texto inválido', () => {
    expect(parseBRL('abc')).toBeNull();
    expect(parseBRL('')).toBeNull();
  });
});
