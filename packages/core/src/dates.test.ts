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
