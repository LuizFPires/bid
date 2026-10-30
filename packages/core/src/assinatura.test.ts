import { describe, it, expect } from 'vitest';
import {
  ambasPartesAssinaram,
  partesPendentes,
  linkWhatsApp,
  type AssinaturaResumo,
} from './assinatura';

describe('ambasPartesAssinaram', () => {
  it('só verdadeiro quando as duas partes assinaram', () => {
    const nenhuma: AssinaturaResumo[] = [];
    const uma: AssinaturaResumo[] = [{ parte: 'contratada', assinadoEm: '2026-10-30T12:00:00Z' }];
    const ambas: AssinaturaResumo[] = [
      { parte: 'contratada', assinadoEm: '2026-10-30T12:00:00Z' },
      { parte: 'contratante', assinadoEm: '2026-10-30T13:00:00Z' },
    ];
    expect(ambasPartesAssinaram(nenhuma)).toBe(false);
    expect(ambasPartesAssinaram(uma)).toBe(false);
    expect(ambasPartesAssinaram(ambas)).toBe(true);
  });

  it('linha sem assinadoEm não conta', () => {
    const r: AssinaturaResumo[] = [
      { parte: 'contratada', assinadoEm: '2026-10-30T12:00:00Z' },
      { parte: 'contratante', assinadoEm: null },
    ];
    expect(ambasPartesAssinaram(r)).toBe(false);
  });
});

describe('partesPendentes', () => {
  it('lista as partes que faltam', () => {
    expect(partesPendentes([])).toEqual(['contratante', 'contratada']);
    expect(partesPendentes([{ parte: 'contratante', assinadoEm: 'x' }])).toEqual(['contratada']);
    expect(
      partesPendentes([
        { parte: 'contratante', assinadoEm: 'x' },
        { parte: 'contratada', assinadoEm: 'y' },
      ]),
    ).toEqual([]);
  });
});

describe('linkWhatsApp', () => {
  it('monta wa.me com texto e url codificados', () => {
    const l = linkWhatsApp('https://bid.app/sign/abc', 'Assine o contrato:');
    expect(l.startsWith('https://wa.me/?text=')).toBe(true);
    expect(l).toContain(encodeURIComponent('https://bid.app/sign/abc'));
    expect(l).toContain(encodeURIComponent('Assine o contrato:'));
  });
});
