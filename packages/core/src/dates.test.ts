import { describe, it, expect } from 'vitest';
import { formatShort, formatFull, formatNumeric } from './dates';

// Usa horário "ao meio-dia" para evitar troca de dia por fuso em datas ISO.
const qua = new Date(2026, 9, 21, 12); // quarta, 21/10/2026
const qui = new Date(2026, 11, 3, 12); // quinta, 03/12/2026

describe('formatShort', () => {
  it('mostra dia da semana abreviado + dd/mm', () => {
    expect(formatShort(qua)).toBe('qua 21/10');
  });
});

describe('formatFull', () => {
  it('mostra dia da semana por extenso + dd/mm/aaaa', () => {
    expect(formatFull(qui)).toBe('quinta, 03/12/2026');
  });
});

describe('formatNumeric', () => {
  it('formata dd/mm/aaaa com zero à esquerda', () => {
    expect(formatNumeric(qui)).toBe('03/12/2026');
  });
});

describe('string só-data (coluna date) não desloca por fuso', () => {
  it('formata o mesmo dia, independe do fuso', () => {
    expect(formatNumeric('2026-10-30')).toBe('30/10/2026');
    expect(formatNumeric('2026-01-01')).toBe('01/01/2026');
    expect(formatShort('2026-10-21')).toBe('qua 21/10');
    expect(formatFull('2026-12-03')).toBe('quinta, 03/12/2026');
  });
});
