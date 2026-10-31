import { describe, it, expect } from 'vitest';
import { agruparCategorias, categoriasParecidas, chaveCategoria } from './categorias';

describe('chaveCategoria', () => {
  it('normaliza acento, caixa, pontuação e palavras vazias', () => {
    expect(chaveCategoria('Estrutura Pré-Moldada')).toBe('estrutura pre moldada');
    expect(chaveCategoria('Revestimento em ACM')).toBe('revestimento acm');
    expect(chaveCategoria('  Ar-condicionado ')).toBe('ar condicionado');
  });
});

describe('categoriasParecidas', () => {
  it('iguais a menos de acento/caixa', () => {
    expect(categoriasParecidas('Estrutura pré-moldada', 'estrutura pre moldada')).toBe(true);
  });
  it('uma é prefixo da outra', () => {
    expect(categoriasParecidas('Estrutura', 'Estrutura pré-moldada')).toBe(true);
  });
  it('mesmas palavras com plural/variação', () => {
    expect(categoriasParecidas('Pré-moldados', 'Estrutura pré-moldada')).toBe(true);
    expect(categoriasParecidas('Climatização', 'Climatizações')).toBe(true);
  });
  it('diferentes não casam', () => {
    expect(categoriasParecidas('Estrutura metálica', 'Estrutura pré-moldada')).toBe(false);
    expect(categoriasParecidas('Ar-condicionado', 'Ar3')).toBe(false);
    expect(categoriasParecidas('Elétrica', 'Hidráulica')).toBe(false);
  });
  it('ignora nomes curtos demais', () => {
    expect(categoriasParecidas('AC', 'ACM')).toBe(false);
  });
});

describe('agruparCategorias', () => {
  it('marca a mais usada do grupo como padrão e lista as parecidas', () => {
    const r = agruparCategorias([
      { nome: 'Estrutura', propostas: 2, obras: 1 },
      { nome: 'Estrutura pré-moldada', propostas: 7, obras: 2 },
      { nome: 'Pré-moldados', propostas: 1, obras: 1 },
      { nome: 'Revestimento em ACM', propostas: 3, obras: 1 },
    ]);
    const porNome = Object.fromEntries(r.map((c) => [c.nome, c]));
    expect(porNome['Estrutura pré-moldada']!.padrao).toBe(true);
    expect(porNome['Estrutura']!.padrao).toBe(false);
    expect(porNome['Estrutura']!.parecidas.sort()).toEqual(['Estrutura pré-moldada', 'Pré-moldados']);
    expect(porNome['Revestimento em ACM']!.parecidas).toEqual([]);
    expect(porNome['Revestimento em ACM']!.padrao).toBe(false);
  });
});
