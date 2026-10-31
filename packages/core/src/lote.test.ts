import { describe, expect, it } from 'vitest';
import {
  entradasDoLote,
  fornecedoresRepetidos,
  itensComOpcoes,
  itensPendentes,
  podeArquivarLote,
  proximoAConferir,
  resumoLote,
  totalPropostasDoLote,
  type ItemLote,
} from './lote';
import type { PropostaExtraida } from './extracao';

const dados = (over: Partial<PropostaExtraida> = {}): PropostaExtraida => ({
  fornecedor: 'Construferro',
  valor: 241657.22,
  prazo_dias: 60,
  condicao_pagamento: null,
  garantia: '5 anos',
  itens: [],
  opcoes: [],
  alertas: [],
  observacoes: null,
  ...over,
});
const item = (id: string, situacao: ItemLote['situacao'], over: Partial<ItemLote> = {}): ItemLote => ({
  id,
  nomeArquivo: `${id}.pdf`,
  arquivoPath: `org/user/${id}.pdf`,
  legivel: true,
  situacao,
  dados: situacao === 'fila' || situacao === 'lendo' ? null : dados(),
  opcoesMarcadas: [],
  novaVersaoDe: null,
  erro: null,
  ...over,
});

describe('resumoLote / podeArquivarLote', () => {
  it('conta por situação e mede o progresso da leitura', () => {
    const lote = { itens: [item('a', 'confirmada'), item('b', 'lida'), item('c', 'lendo'), item('d', 'fila'), item('e', 'erro')] };
    const r = resumoLote(lote);
    expect(r).toMatchObject({ total: 5, confirmadas: 1, lidas: 1, lendo: 1, fila: 1, erros: 1, emAndamento: 2 });
    expect(r.progressoLeitura).toBeCloseTo(0.6);
    expect(podeArquivarLote(lote)).toBe(false);
  });
  it('arquiva com lidas e confirmadas (conferir é opcional); trava em leitura e sem fornecedor', () => {
    expect(podeArquivarLote({ itens: [item('a', 'confirmada'), item('b', 'lida')] })).toBe(true);
    expect(podeArquivarLote({ itens: [item('a', 'lida'), item('b', 'lendo')] })).toBe(false);
    expect(podeArquivarLote({ itens: [item('a', 'lida'), item('b', 'erro')] })).toBe(false);
    expect(podeArquivarLote({ itens: [item('a', 'lida', { dados: dados({ fornecedor: null }) })] })).toBe(false);
    expect(podeArquivarLote({ itens: [] })).toBe(false);
    expect(itensPendentes({ itens: [item('a', 'lida'), item('b', 'erro'), item('c', 'lendo')] }).map((i) => i.id)).toEqual(['b']);
  });
});

describe('proximoAConferir', () => {
  it('anda em círculo a partir do atual, pulando confirmadas e as ainda em leitura', () => {
    const lote = { itens: [item('a', 'confirmada'), item('b', 'lida'), item('c', 'lendo'), item('d', 'erro')] };
    expect(proximoAConferir(lote, 'b')?.id).toBe('d');
    expect(proximoAConferir(lote, 'd')?.id).toBe('b');
    expect(proximoAConferir(lote, null)?.id).toBe('b');
    expect(proximoAConferir({ itens: [item('a', 'confirmada')] }, null)).toBeNull();
  });
});

describe('fornecedoresRepetidos', () => {
  it('detecta repetição no lote e contra o acervo, ignorando sufixos societários e acentos', () => {
    const lote = {
      itens: [
        item('a', 'lida', { dados: dados({ fornecedor: 'Ágape Montagem LTDA' }) }),
        item('b', 'lida', { dados: dados({ fornecedor: 'agape montagem' }) }),
        item('c', 'lida', { dados: dados({ fornecedor: 'Cyrne' }) }),
      ],
    };
    const r = fornecedoresRepetidos(lote, [{ id: 'p9', fornecedor: 'CYRNE Oficina' }, { id: 'p1', fornecedor: 'Agape Montagem Ltda.' }]);
    expect([...r.noLote].sort()).toEqual(['a', 'b']);
    expect(r.mesmoQue.get('b')).toBe('a');
    expect(r.jaExiste.get('a')?.id).toBe('p1');
    expect(r.jaExiste.has('c')).toBe(false);
  });
});

describe('entradasDoLote / totalPropostasDoLote', () => {
  it('expande opções marcadas em propostas separadas e respeita nova versão', () => {
    const lote = {
      itens: [
        item('a', 'confirmada', { novaVersaoDe: 'p1' }),
        item('b', 'confirmada', {
          dados: dados({ fornecedor: 'Panair', valor: 1427487, opcoes: [{ rotulo: 'Opção 1', valor: 1427487, descricao: 'Cassete' }, { rotulo: 'Opção 2', valor: 980462, descricao: 'Splitão' }] }),
          opcoesMarcadas: [true, true],
        }),
        item('c', 'lida'),
        item('d', 'erro'),
      ],
    };
    const e = entradasDoLote(lote);
    // "lida" entra (conferir é opcional); "erro" não.
    expect(e).toHaveLength(4);
    expect(itensComOpcoes(lote)).toEqual([{ nome: 'Panair', n: 2 }]);
    expect(e[0]).toMatchObject({ fornecedor: 'Construferro', proposta_id: 'p1', opcao: null });
    expect(e[1]).toMatchObject({ fornecedor: 'Panair', opcao: 'Opção 1', valor: 1427487, proposta_id: null, obs: 'Cassete' });
    expect(e[2]).toMatchObject({ opcao: 'Opção 2', valor: 980462 });
    expect(totalPropostasDoLote(lote)).toBe(4);
  });
});
