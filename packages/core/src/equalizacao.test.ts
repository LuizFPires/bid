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

  it('empate total de valor não marca menor/maior (evita ruído)', () => {
    const c = compararPropostas([
      { id: 'a', fornecedor: 'A', valor: 1000, prazo: 90, condicaoPagamento: null, garantia: null },
      { id: 'b', fornecedor: 'B', valor: 1000, prazo: 80, condicaoPagamento: null, garantia: null },
    ]);
    expect(c.marcadores['a']?.menorValor).toBe(false);
    expect(c.marcadores['b']?.menorValor).toBe(false);
    expect(c.economiaPotencial).toBeNull(); // maior == menor
    // prazo varia, então marca o prazo normalmente
    expect(c.marcadores['b']?.menorPrazo).toBe(true);
    expect(c.marcadores['a']?.maiorPrazo).toBe(true);
  });

  it('empate parcial no menor valor marca os empatados (há um maior diferente)', () => {
    const c = compararPropostas([
      { id: 'a', fornecedor: 'A', valor: 1000, prazo: 90, condicaoPagamento: null, garantia: null },
      { id: 'b', fornecedor: 'B', valor: 1000, prazo: 80, condicaoPagamento: null, garantia: null },
      { id: 'c', fornecedor: 'C', valor: 1200, prazo: 70, condicaoPagamento: null, garantia: null },
    ]);
    expect(c.marcadores['a']?.menorValor).toBe(true);
    expect(c.marcadores['b']?.menorValor).toBe(true);
    expect(c.marcadores['c']?.maiorValor).toBe(true);
    expect(c.economiaPotencial).toBe(200);
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

  it('monta a matriz de escopo alinhada aos itens e só com propostas válidas', () => {
    const r = normalizarAnalise(
      {
        escopo: {
          itens: ['Transporte', 'Montagem', 'Transporte'], // duplicado é removido
          propostas: [
            {
              proposta_id: 'a',
              marcacoes: [
                { item: 'Transporte', status: 'incluido' },
                { item: 'Montagem', status: 'parcial' },
              ],
            },
            // 'Montagem' faltando → 'na'; status inválido vira 'na'
            { proposta_id: 'b', marcacoes: [{ item: 'Transporte', status: 'xunga' }] },
            { proposta_id: 'z', marcacoes: [] }, // fora da lista → descartada
          ],
        },
      },
      ['a', 'b'],
    );
    expect(r.escopo.itens).toEqual(['Transporte', 'Montagem']);
    expect(r.escopo.porProposta).toEqual([
      { proposta_id: 'a', status: ['incluido', 'parcial'] },
      { proposta_id: 'b', status: ['na', 'na'] },
    ]);
  });

  it('relatório completo: cards, matriz, equalização, forças/riscos só com ids válidos', () => {
    const r = normalizarAnalise(
      {
        titulo: 'A mais barata no papel não é a mais barata na obra.',
        cards: [
          { proposta_id: 'a', apresentado: 465629, equalizado: 498134, base: '818 m²', nota: 'estrutura inclusa' },
          { proposta_id: 'zz', apresentado: 1, equalizado: 1, base: null, nota: null }, // fora → descartado
          { proposta_id: 'a', apresentado: 9, equalizado: 9, base: null, nota: null }, // duplicado → ignorado
        ],
        matriz: {
          criterios: ['Pagamento', 'Garantia', 'Pagamento'],
          propostas: [
            { proposta_id: 'a', celulas: [{ criterio: 'Garantia', texto: 'mín. 5 anos', status: 'ok' }] },
            { proposta_id: 'b', celulas: [{ criterio: 'Pagamento', texto: null, status: 'xpto' }] },
          ],
        },
        equalizacao: {
          base: '898,94 m² × preço unitário',
          linhas: [
            { item: 'ACM', valores: [{ proposta_id: 'a', valor: 332607.8, referencia: false, nota: null }, { proposta_id: 'zz', valor: 1, referencia: true, nota: null }] },
            { valores: [] }, // sem item → fora
          ],
          totais: [{ proposta_id: 'a', total: 498133.8 }, { proposta_id: 'b', total: 'x' }],
        },
        divergencias: [{ titulo: 'Ninguém cotou a área do projeto', texto: 'Cada um mediu uma fachada.' }, { titulo: 'sem texto' }],
        forcas_riscos: [{ proposta_id: 'b', resumo: 'documento robusto', a_favor: ['garantia 5 anos'], riscos: ['área -18%'] }],
        proximos_passos: [{ titulo: 'Planilha-base', texto: 'Mandar aos três.' }],
        conclusao: 'LED lidera com folga.',
      },
      ['a', 'b'],
    );
    expect(r.titulo).toContain('papel');
    expect(r.cards).toEqual([{ proposta_id: 'a', apresentado: 465629, equalizado: 498134, base: '818 m²', nota: 'estrutura inclusa' }]);
    expect(r.matriz.criterios).toEqual(['Pagamento', 'Garantia']);
    expect(r.matriz.porProposta).toEqual([
      { proposta_id: 'a', celulas: [{ texto: null, status: 'neutro' }, { texto: 'mín. 5 anos', status: 'ok' }] },
      { proposta_id: 'b', celulas: [{ texto: null, status: 'neutro' }, { texto: null, status: 'neutro' }] },
    ]);
    expect(r.equalizacao.base).toContain('898,94');
    expect(r.equalizacao.linhas).toHaveLength(1);
    expect(r.equalizacao.linhas[0]?.valores).toEqual([{ proposta_id: 'a', valor: 332607.8, referencia: false, nota: null }]);
    expect(r.equalizacao.totais).toEqual([{ proposta_id: 'a', total: 498133.8 }, { proposta_id: 'b', total: null }]);
    expect(r.divergencias).toEqual([{ titulo: 'Ninguém cotou a área do projeto', texto: 'Cada um mediu uma fachada.' }]);
    expect(r.forcas_riscos[0]).toMatchObject({ proposta_id: 'b', a_favor: ['garantia 5 anos'], riscos: ['área -18%'] });
    expect(r.proximos_passos).toHaveLength(1);
    expect(r.conclusao).toBe('LED lidera com folga.');
  });

  it('análise antiga (sem seções novas) continua válida, com seções vazias', () => {
    const r = normalizarAnalise({ veredito: 'ok', achados: [], recomendacao: { proposta_id: 'a', fornecedor: 'A', justificativa: 'x' } }, ['a']);
    expect(r.titulo).toBeNull();
    expect(r.cards).toEqual([]);
    expect(r.matriz).toEqual({ criterios: [], porProposta: [] });
    expect(r.equalizacao).toEqual({ base: null, linhas: [], totais: [] });
    expect(r.divergencias).toEqual([]);
    expect(r.recomendacao.proposta_id).toBe('a');
  });

  it('normalizar de novo um resultado já normalizado não perde matriz nem escopo', () => {
    const uma = normalizarAnalise(
      {
        matriz: { criterios: ['Prazo', 'Garantia'], propostas: [{ proposta_id: 'a', celulas: [{ criterio: 'Prazo', texto: '60 dias', status: 'ok' }, { criterio: 'Garantia', texto: null, status: 'falta' }] }] },
        escopo: { itens: ['Transporte'], propostas: [{ proposta_id: 'a', marcacoes: [{ item: 'Transporte', status: 'incluido' }] }] },
      },
      ['a'],
    );
    const duas = normalizarAnalise(uma, ['a']);
    expect(duas.matriz).toEqual(uma.matriz);
    expect(duas.escopo).toEqual(uma.escopo);
    expect(duas.matriz.porProposta[0]?.celulas[0]).toEqual({ texto: '60 dias', status: 'ok' });
  });

  it('escopo vazio quando não há itens', () => {
    const r = normalizarAnalise({ escopo: { itens: [], propostas: [{ proposta_id: 'a', marcacoes: [] }] } }, ['a']);
    expect(r.escopo).toEqual({ itens: [], porProposta: [] });
  });
});
