import { describe, it, expect } from 'vitest';
import {
  normalizar,
  filtrarAcervo,
  resumoAcervo,
  categoriasDoAcervo,
  ordenarSugestoes,
  filtrarSugestoes,
  type PropostaAcervo,
} from './acervo';

const base: PropostaAcervo[] = [
  {
    id: 'p1',
    fornecedor: 'Premold Paulista',
    categoria: 'Estrutura pré-moldada',
    obraId: 'o1',
    obraNome: 'Residencial Aurora',
    certameId: 'c1',
    certameTitulo: 'Estrutura pré-moldada de concreto',
    status: 'analise',
    valor: 1284500,
    versaoAtual: 2,
  },
  {
    id: 'p2',
    fornecedor: 'Concretex Estruturas',
    categoria: 'Estrutura pré-moldada',
    obraId: 'o1',
    obraNome: 'Residencial Aurora',
    certameId: 'c1',
    certameTitulo: 'Estrutura pré-moldada de concreto',
    status: 'analise',
    valor: 1198900,
    versaoAtual: 3,
  },
  {
    id: 'h1',
    fornecedor: 'ClimaTech Engenharia',
    categoria: 'Climatização',
    obraId: 'o2',
    obraNome: 'Centro Clínico',
    certameId: 'c2',
    certameTitulo: 'Climatização VRF',
    status: 'recebida',
    valor: 486300,
    versaoAtual: 1,
  },
];

describe('normalizar', () => {
  it('ignora acento e caixa', () => {
    expect(normalizar('Climatização')).toBe('climatizacao');
  });
});

describe('filtrarAcervo', () => {
  it('ordena por valor crescente', () => {
    expect(filtrarAcervo(base).map((p) => p.id)).toEqual(['h1', 'p2', 'p1']);
  });
  it('filtra por categoria', () => {
    expect(filtrarAcervo(base, { categoria: 'Climatização' }).map((p) => p.id)).toEqual(['h1']);
  });
  it('filtra por obra (escopo)', () => {
    expect(filtrarAcervo(base, { obraId: 'o1' })).toHaveLength(2);
  });
  it('busca tolerante a acento', () => {
    expect(filtrarAcervo(base, { busca: 'climatizacao' }).map((p) => p.id)).toEqual(['h1']);
    expect(filtrarAcervo(base, { busca: 'concretex' }).map((p) => p.id)).toEqual(['p2']);
  });
});

describe('resumoAcervo', () => {
  it('conta e acha o menor valor', () => {
    expect(resumoAcervo(base)).toEqual({ total: 3, menorValor: 486300 });
  });
  it('menorValor nulo quando todos os valores são nulos', () => {
    const semValor = base.map((p) => ({ ...p, valor: null }));
    expect(resumoAcervo(semValor)).toEqual({ total: 3, menorValor: null });
  });
});

describe('filtrarAcervo · bordas', () => {
  it('propostas sem valor vão para o fim da ordenação', () => {
    const comNulo: PropostaAcervo[] = [
      { ...base[0]!, id: 'x', valor: null },
      { ...base[2]! },
    ];
    expect(filtrarAcervo(comNulo).map((p) => p.id)).toEqual(['h1', 'x']);
  });
});

describe('categoriasDoAcervo', () => {
  it('lista categorias por frequência', () => {
    expect(categoriasDoAcervo(base)).toEqual(['Estrutura pré-moldada', 'Climatização']);
  });
});

describe('sugestões', () => {
  const s = [
    { texto: 'Elétrica', uso: 2 },
    { texto: 'Estrutura pré-moldada', uso: 5 },
    { texto: 'Esquadrias', uso: 5 },
  ];
  it('ordena por uso e depois alfabético', () => {
    expect(ordenarSugestoes(s).map((x) => x.texto)).toEqual([
      'Esquadrias',
      'Estrutura pré-moldada',
      'Elétrica',
    ]);
  });
  it('filtra por termo sem acento', () => {
    expect(filtrarSugestoes(s, 'eletr').map((x) => x.texto)).toEqual(['Elétrica']);
    expect(filtrarSugestoes(s, 'es').map((x) => x.texto)).toEqual(['Esquadrias', 'Estrutura pré-moldada']);
  });
  it('respeita o limite', () => {
    const muitas = Array.from({ length: 20 }, (_, i) => ({ texto: `Item ${i}`, uso: 1 }));
    expect(filtrarSugestoes(muitas, '', 8)).toHaveLength(8);
    expect(filtrarSugestoes(muitas, '')).toHaveLength(8); // default
  });
});
