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

  it('mantém as alternativas de preço (opcoes) e usa a 1ª como valor quando falta', () => {
    const r = normalizarExtracao({
      fornecedor: 'PANAIR',
      valor: null,
      opcoes: [
        { rotulo: 'Opção 1 (Cassete)', valor: 'R$ 1.016.729,00', descricao: 'Cassetes' },
        { rotulo: 'Opção 2 (Splitão)', valor: 980462, descricao: null },
        { valor: 1 }, // sem rótulo → fora
      ],
    });
    expect(r.opcoes).toHaveLength(2);
    expect(r.opcoes[0]).toEqual({ rotulo: 'Opção 1 (Cassete)', valor: 1016729, descricao: 'Cassetes' });
    expect(r.valor).toBe(1016729);
  });

  it('mantém os alertas da leitura (texto oculto, inconsistência) e descarta lixo', () => {
    const r = normalizarExtracao({
      valor: 330000,
      alertas: [
        { tipo: 'texto_oculto', titulo: 'Texto oculto de versões anteriores', texto: 'R$ 255.000 e R$ 315.000 no texto; visível R$ 330.000' },
        { tipo: 'xpto', titulo: 'Validade', texto: '5 dias' }, // tipo desconhecido → outro
        { tipo: 'outro' }, // sem título nem texto → fora
        'lixo',
      ],
    });
    expect(r.alertas).toHaveLength(2);
    expect(r.alertas[0]?.tipo).toBe('texto_oculto');
    expect(r.alertas[1]).toEqual({ tipo: 'outro', titulo: 'Validade', texto: '5 dias' });
    expect(normalizarExtracao({}).alertas).toEqual([]);
  });

  it('uma única "opção" não é alternativa: lista vazia', () => {
    const r = normalizarExtracao({ valor: 100, opcoes: [{ rotulo: 'Única', valor: 100, descricao: null }] });
    expect(r.opcoes).toEqual([]);
    expect(r.valor).toBe(100);
    expect(normalizarExtracao({ opcoes: 'x' }).opcoes).toEqual([]);
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
    expect(EXTRACAO_INPUT_SCHEMA.required).toContain('opcoes');
    expect(EXTRACAO_INPUT_SCHEMA.required).toContain('alertas');
  });
});
