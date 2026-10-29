import { describe, it, expect } from 'vitest';
import { variacao, variacaoUltimaVersao } from './versions';

describe('variacao', () => {
  it('detecta queda de valor', () => {
    const v = variacao(1342000, 1284500);
    expect(v.dir).toBe('down');
    expect(v.abs).toBe(-57500);
    expect(v.pct).toBeCloseTo(-4.285, 2);
  });
  it('detecta alta e estabilidade', () => {
    expect(variacao(100, 120).dir).toBe('up');
    expect(variacao(100, 100).dir).toBe('flat');
  });
  it('trata anterior zero sem dividir por zero', () => {
    expect(variacao(0, 50)).toEqual({ abs: 50, pct: 0, dir: 'up' });
  });
});

describe('variacaoUltimaVersao', () => {
  it('compara as duas últimas versões, fora de ordem', () => {
    const r = variacaoUltimaVersao([
      { n: 2, valor: 1284500, prazo: 95 },
      { n: 1, valor: 1342000, prazo: 100 },
    ]);
    expect(r?.valor.dir).toBe('down');
    expect(r?.prazo.abs).toBe(-5);
  });
  it('retorna null com uma única versão', () => {
    expect(variacaoUltimaVersao([{ n: 1, valor: 100, prazo: 10 }])).toBeNull();
  });
});
