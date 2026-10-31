import { describe, expect, it } from 'vitest';
import { pendenciasDaAnalise, textoPendencias } from './pendencias';

const analise = {
  matriz: {
    criterios: ['Valor total', 'Prazo de execução', 'Garantia'],
    porProposta: [
      { proposta_id: 'a', celulas: [{ texto: 'R$ 330.000', status: 'ok' as const }, { texto: null, status: 'falta' as const }, { texto: '5 anos', status: 'ok' as const }] },
      { proposta_id: 'b', celulas: [{ texto: null, status: 'falta' as const }, { texto: null, status: 'falta' as const }, { texto: null, status: 'neutro' as const }] },
    ],
  },
};

describe('pendenciasDaAnalise', () => {
  it('nomeia a proposta e os critérios marcados como falta', () => {
    const r = pendenciasDaAnalise(analise, [
      { id: 'a', nome: 'Cyrne', valor: 330000 },
      { id: 'b', nome: 'Precom', valor: null },
    ]);
    expect(r).toEqual([
      { proposta_id: 'a', nome: 'Cyrne', faltas: ['Prazo de execução'] },
      { proposta_id: 'b', nome: 'Precom', faltas: ['valor total', 'Prazo de execução'] },
    ]);
  });

  it('não repete "valor total" quando a matriz também o marca como falta', () => {
    const r = pendenciasDaAnalise(analise, [{ id: 'b', nome: 'Precom', valor: null }]);
    expect(r[0]?.faltas.filter((f) => f.toLowerCase() === 'valor total')).toHaveLength(1);
  });

  it('sem análise, só o valor conta', () => {
    expect(pendenciasDaAnalise(null, [{ id: 'x', nome: 'X', valor: null }])).toEqual([{ proposta_id: 'x', nome: 'X', faltas: ['valor total'] }]);
    expect(pendenciasDaAnalise(null, [{ id: 'x', nome: 'X', valor: 10 }])).toEqual([]);
  });
});

describe('textoPendencias', () => {
  it('monta frase explícita por proposta', () => {
    expect(
      textoPendencias([
        { proposta_id: 'a', nome: 'Cyrne', faltas: ['Prazo de execução'] },
        { proposta_id: 'b', nome: 'Precom', faltas: ['valor total', 'prazo', 'garantia'] },
      ]),
    ).toBe('Falta na proposta da Cyrne: prazo de execução. Faltam na proposta da Precom: valor total, prazo e garantia.');
  });
  it('vazio vira null', () => {
    expect(textoPendencias([])).toBeNull();
  });
});
