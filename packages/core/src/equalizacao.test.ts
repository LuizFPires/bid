import { describe, it, expect } from 'vitest';
import { compararPropostas, normalizarAnalise, type PropostaComparavel } from './equalizacao';

const base: PropostaComparavel[] = [
  { id: 'a', fornecedor: 'A', valor: 1200, prazo: 90, condicaoPagamento: 'à vista', garantia: '5 anos' },
  { id: 'b', fornecedor: 'B', valor: 1000, prazo: 110, condicaoPagamento: '30/70', garantia: '3 anos' },
  { id: 'c', fornecedor: 'C', valor: 1300, prazo: 80, condicaoPagamento: 'parcelado', garantia: '2 anos' },
];

describe('compararPropostas', () => {
  it('marca menor/maior valor e prazo', () => {
    const c = compararPropostas(base);
    expect(c.menorValor).toBe(1000);
    expect(c.maiorValor).toBe(1300);
    expect(c.menorPrazo).toBe(80);
    expect(c.maiorPrazo).toBe(110);
    expect(c.marcadores['b']?.menorValor).toBe(true);
    expect(c.marcadores['c']?.maiorValor).toBe(true);
    expect(c.marcadores['c']?.menorPrazo).toBe(true);
    expect(c.marcadores['b']?.maiorPrazo).toBe(true);
    expect(c.marcadores['a']?.menorValor).toBe(false);
  });

  it('calcula a economia potencial (maior - menor)', () => {
    expect(compararPropostas(base).economiaPotencial).toBe(300);
  });

  it('ignora nulos nos extremos', () => {
    const c = compararPropostas([
      { id: 'a', fornecedor: 'A', valor: null, prazo: 50, condicaoPagamento: null, garantia: null },
      { id: 'b', fornecedor: 'B', valor: 900, prazo: null, condicaoPagamento: null, garantia: null },
      { id: 'c', fornecedor: 'C', valor: 800, prazo: 60, condicaoPagamento: null, garantia: null },
    ]);
    expect(c.menorValor).toBe(800);
    expect(c.maiorValor).toBe(900);
    expect(c.menorPrazo).toBe(50);
    expect(c.marcadores['a']?.menorValor).toBe(false); // valor nulo não marca
  });

  it('não marca extremos quando só uma proposta tem o dado', () => {
    const c = compararPropostas([
      { id: 'a', fornecedor: 'A', valor: 1000, prazo: 90, condicaoPagamento: null, garantia: null },
      { id: 'b', fornecedor: 'B', valor: null, prazo: null, condicaoPagamento: null, garantia: null },
    ]);
    expect(c.marcadores['a']?.menorValor).toBe(false);
    expect(c.marcadores['a']?.maiorValor).toBe(false);
    expect(c.economiaPotencial).toBeNull();
  });

  it('empate no menor valor marca ambos', () => {
    const c = compararPropostas([
      { id: 'a', fornecedor: 'A', valor: 1000, prazo: 90, condicaoPagamento: null, garantia: null },
      { id: 'b', fornecedor: 'B', valor: 1000, prazo: 80, condicaoPagamento: null, garantia: null },
    ]);
    expect(c.marcadores['a']?.menorValor).toBe(true);
    expect(c.marcadores['b']?.menorValor).toBe(true);
    expect(c.economiaPotencial).toBeNull(); // maior == menor
  });

  it('lista vazia: tudo nulo', () => {
    const c = compararPropostas([]);
    expect(c.menorValor).toBeNull();
    expect(c.economiaPotencial).toBeNull();
  });
});

describe('normalizarAnalise', () => {
  it('coage uma saída bem formada e mantém o id recomendado válido', () => {
    const r = normalizarAnalise(
      {
        veredito: 'B tem melhor custo-benefício.',
        achados: [{ fornecedor: 'A', pontos: ['não incluiu transporte'] }],
        recomendacao: { proposta_id: 'b', fornecedor: 'B', justificativa: 'menor valor com escopo completo' },
      },
      ['a', 'b', 'c'],
    );
    expect(r.recomendacao.proposta_id).toBe('b');
    expect(r.achados[0]?.fornecedor).toBe('A');
    expect(r.veredito).toContain('custo-benefício');
  });

  it('zera o id recomendado se a IA apontar fora da lista (não inventa alvo)', () => {
    const r = normalizarAnalise({ recomendacao: { proposta_id: 'x', fornecedor: 'X' } }, ['a', 'b']);
    expect(r.recomendacao.proposta_id).toBeNull();
    expect(r.recomendacao.fornecedor).toBe('X');
  });

  it('nunca lança para lixo', () => {
    for (const lixo of [null, 42, 'txt', [], {}]) {
      const r = normalizarAnalise(lixo, []);
      expect(r.achados).toEqual([]);
      expect(r.recomendacao.proposta_id).toBeNull();
    }
  });

  it('descarta achados sem fornecedor e limita pontos', () => {
    const r = normalizarAnalise(
      { achados: [{ pontos: ['x'] }, { fornecedor: 'A', pontos: ['p1', 42, 'p2'] }] },
      [],
    );
    expect(r.achados).toHaveLength(1);
    expect(r.achados[0]?.pontos).toEqual(['p1', 'p2']);
  });
});
