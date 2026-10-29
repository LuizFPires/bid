import { describe, it, expect } from 'vitest';
import { gerarClausulas, type DadosContrato } from './clausulas';

const base: DadosContrato = {
  objeto: 'Estrutura pré-moldada de concreto',
  contratada: 'Premold Paulista',
  obra: 'Residencial Aurora',
  valor: 1284500,
  prazoDias: 95,
  condicaoPagamento: '30/40/30%',
  garantia: '5 anos',
};

describe('gerarClausulas', () => {
  it('numera as cláusulas em sequência a partir de 1', () => {
    const cs = gerarClausulas(base);
    expect(cs.map((c) => c.numero)).toEqual(cs.map((_, i) => i + 1));
    expect(cs[0]?.numero).toBe(1);
  });

  it('marca a origem (proposta vs modelo)', () => {
    const cs = gerarClausulas(base);
    expect(cs.find((c) => c.titulo === 'Do objeto')?.origem).toBe('proposta');
    expect(cs.find((c) => c.titulo === 'Do foro')?.origem).toBe('modelo');
  });

  it('inclui valor formatado em BRL e dados da proposta', () => {
    const cs = gerarClausulas(base);
    const preco = cs.find((c) => c.titulo.startsWith('Do preço'));
    expect(preco?.texto).toContain('R$');
    expect(preco?.texto).toContain('1.284.500,00');
    expect(preco?.texto).toContain('30/40/30%');
    const objeto = cs.find((c) => c.titulo === 'Do objeto');
    expect(objeto?.texto).toContain('Premold Paulista');
    expect(objeto?.texto).toContain('Residencial Aurora');
  });

  it('inclui a cláusula de garantia só quando há garantia', () => {
    expect(gerarClausulas(base).some((c) => c.titulo === 'Da garantia')).toBe(true);
    expect(gerarClausulas({ ...base, garantia: null }).some((c) => c.titulo === 'Da garantia')).toBe(false);
  });

  it('trata valor/prazo nulos sem quebrar', () => {
    const cs = gerarClausulas({ ...base, valor: null, prazoDias: null, condicaoPagamento: null });
    const preco = cs.find((c) => c.titulo.startsWith('Do preço'));
    const prazo = cs.find((c) => c.titulo === 'Do prazo de execução');
    expect(preco?.texto).toContain('a definir');
    expect(prazo?.texto).toContain('ordem de início');
    // numeração continua sequencial mesmo sem garantia/condição
    expect(cs.map((c) => c.numero)).toEqual(cs.map((_, i) => i + 1));
  });
});
