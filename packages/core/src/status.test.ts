import { describe, it, expect } from 'vitest';
import {
  podeCertame,
  podeProposta,
  podeContrato,
  PROPOSTA_LABEL,
  CERTAME_LABEL,
  certameAtivo,
} from './status';

describe('transições de certame', () => {
  it('permite adjudicar direto (vencedora sem equalizar)', () => {
    expect(podeCertame('aberta', 'adjudicada')).toBe(true);
  });
  it('não sai de adjudicada por transição comum', () => {
    expect(podeCertame('adjudicada', 'aberta')).toBe(false);
  });
});

describe('transições de proposta', () => {
  it('permite trocar a vencedora', () => {
    expect(podeProposta('vencedora', 'analise')).toBe(true);
    expect(podeProposta('recebida', 'vencedora')).toBe(true);
  });
  it('não pula de desclassificada direto para vencedora', () => {
    expect(podeProposta('desclassificada', 'vencedora')).toBe(false);
  });
});

describe('transições de contrato', () => {
  it('segue rascunho → enviado → assinado', () => {
    expect(podeContrato('rascunho', 'enviado')).toBe(true);
    expect(podeContrato('enviado', 'assinado')).toBe(true);
  });
  it('assinado é terminal', () => {
    expect(podeContrato('assinado', 'rascunho')).toBe(false);
  });
});

describe('rótulos', () => {
  it('mapeiam tom para as pills', () => {
    expect(PROPOSTA_LABEL.vencedora.tom).toBe('adjudicada');
    expect(CERTAME_LABEL.aberta.tom).toBe('aberta');
  });
});

describe('certameAtivo', () => {
  it('ativo enquanto não adjudicado', () => {
    expect(certameAtivo('aberta')).toBe(true);
    expect(certameAtivo('analise')).toBe(true);
    expect(certameAtivo('adjudicada')).toBe(false);
  });
});
