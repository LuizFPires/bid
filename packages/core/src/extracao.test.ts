import { describe, it, expect } from 'vitest';
import {
  normalizarExtracao,
  somaItens,
  EXTRACAO_INPUT_SCHEMA,
  EXTRACAO_TOOL_NAME,
  type ItemExtraido,
} from './extracao';

describe('normalizarExtracao', () => {
  it('coage uma saída bem formada preservando os valores', () => {
    const r = normalizarExtracao({
      fornecedor: 'Premold Paulista',
      valor: 1284500,
      prazo_dias: 95,
      condicao_pagamento: '30/40/30%',
      garantia: '5 anos',
      itens: [{ descricao: 'Pilares', qtd: 12, unit: 1000, total: 12000 }],
      observacoes: 'Transporte não incluso.',
    });
    expect(r.fornecedor).toBe('Premold Paulista');
    expect(r.valor).toBe(1284500);
    expect(r.prazo_dias).toBe(95);
    expect(r.itens).toHaveLength(1);
    expect(r.observacoes).toContain('Transporte');
  });

  it('entende números no padrão brasileiro em texto', () => {
    const r = normalizarExtracao({ valor: 'R$ 1.284.500,00', prazo_dias: '95' });
    expect(r.valor).toBe(1284500);
    expect(r.prazo_dias).toBe(95);
  });

  it('nunca lança e devolve nulos/lista vazia para lixo', () => {
    for (const lixo of [null, undefined, 42, 'texto', [], { itens: 'x' }]) {
      const r = normalizarExtracao(lixo);
      expect(r.fornecedor).toBeNull();
      expect(r.valor).toBeNull();
      expect(r.itens).toEqual([]);
    }
  });

  it('descarta itens sem descrição e campos não-numéricos', () => {
    const r = normalizarExtracao({
      itens: [
        { descricao: 'Viga', qtd: 'três', unit: null, total: 900 },
        { qtd: 1, total: 10 }, // sem descrição → fora
        'não-objeto',
      ],
    });
    expect(r.itens).toHaveLength(1);
    expect(r.itens[0]).toMatchObject({ descricao: 'Viga', qtd: null, total: 900 });
  });

  it('rejeita prazo não positivo', () => {
    expect(normalizarExtracao({ prazo_dias: 0 }).prazo_dias).toBeNull();
    expect(normalizarExtracao({ prazo_dias: -5 }).prazo_dias).toBeNull();
    expect(normalizarExtracao({ prazo_dias: 30.4 }).prazo_dias).toBe(30);
  });

  it('trata string vazia como null e limita o tamanho do texto', () => {
    const r = normalizarExtracao({ fornecedor: '   ', observacoes: 'a'.repeat(5000) });
    expect(r.fornecedor).toBeNull();
    expect(r.observacoes).toHaveLength(2000);
  });
});

describe('somaItens', () => {
  const itens: ItemExtraido[] = [
    { descricao: 'A', qtd: 1, unit: 100, total: 100 },
    { descricao: 'B', qtd: 2, unit: 50, total: 100 },
  ];
  it('soma quando todos têm total', () => {
    expect(somaItens(itens)).toBe(200);
  });
  it('null quando algum item não tem total, ou lista vazia', () => {
    expect(somaItens([{ descricao: 'A', qtd: null, unit: null, total: null }])).toBeNull();
    expect(somaItens([])).toBeNull();
  });
});

describe('schema da tool', () => {
  it('exige todos os campos de topo e tem nome estável', () => {
    expect(EXTRACAO_TOOL_NAME).toBe('registrar_proposta');
    expect(EXTRACAO_INPUT_SCHEMA.required).toContain('valor');
    expect(EXTRACAO_INPUT_SCHEMA.required).toContain('itens');
  });
});
