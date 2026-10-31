import { describe, expect, it } from 'vitest';
import { linkWhatsAppMensagem, mensagemRevisao, pedidosDeRevisao } from './revisao';

const analise = {
  matriz: {
    criterios: ['Tributos', 'Garantia', 'Prazo', 'Valor'],
    porProposta: [
      { proposta_id: 'a', celulas: [{ texto: 'Não inclusos: ISS 5%', status: 'alerta' as const }, { texto: '5 anos', status: 'ok' as const }, { texto: null, status: 'neutro' as const }, { texto: null, status: 'falta' as const }] },
      { proposta_id: 'b', celulas: [{ texto: 'Inclusos', status: 'ok' as const }, { texto: null, status: 'falta' as const }, { texto: null, status: 'neutro' as const }, { texto: 'R$ 1', status: 'ok' as const }] },
      { proposta_id: 'c', celulas: [{ texto: 'ok', status: 'ok' as const }, { texto: 'ok', status: 'ok' as const }, { texto: 'ok', status: 'ok' as const }, { texto: 'ok', status: 'ok' as const }] },
    ],
  },
};

describe('pedidosDeRevisao', () => {
  it('lista faltas antes de alertas e ignora propostas sem pendência', () => {
    const r = pedidosDeRevisao(analise, [
      { id: 'a', nome: 'Construferro', valor: null },
      { id: 'b', nome: 'Techneaço', valor: 10 },
      { id: 'c', nome: 'Ok Ltda', valor: 10 },
    ]);
    expect(r.map((x) => x.nome)).toEqual(['Construferro', 'Techneaço']);
    expect(r[0]!.pontos.map((p) => [p.criterio, p.situacao])).toEqual([
      ['Valor total', 'falta'],
      ['Tributos', 'alerta'],
    ]);
    expect(r[1]!.pontos).toEqual([{ criterio: 'Garantia', situacao: 'falta', texto: null }]);
  });
});

describe('mensagemRevisao', () => {
  it('monta o texto com um ponto por linha, em linguagem de obra', () => {
    const m = mensagemRevisao({
      fornecedor: 'Construferro',
      categoria: 'Estrutura Metálica',
      obra: 'RAFLog',
      remetente: 'Clássica Engenharia',
      pontos: [
        { criterio: 'Tributos', situacao: 'alerta', texto: 'Não inclusos: ISS 5%' },
        { criterio: 'Garantia', situacao: 'falta', texto: null },
      ],
    });
    expect(m).toContain('Olá, Construferro!');
    expect(m).toContain('Estrutura Metálica da obra RAFLog');
    expect(m).toContain('• Tributos: confirmar por escrito que os tributos estão incluídos no preço final (a proposta traz: "Não inclusos: ISS 5%").');
    expect(m).toContain('• Garantia: incluir a garantia (prazo e cobertura).');
    expect(m.trim().endsWith('Clássica Engenharia')).toBe(true);
  });
});

describe('linkWhatsAppMensagem', () => {
  it('sem telefone deixa o WhatsApp escolher o contato', () => {
    expect(linkWhatsAppMensagem('oi')).toBe('https://wa.me/?text=oi');
  });
  it('com DDD+número acrescenta o DDI 55; com DDI, mantém', () => {
    expect(linkWhatsAppMensagem('oi', '(31) 99999-0000')).toBe('https://wa.me/5531999990000?text=oi');
    expect(linkWhatsAppMensagem('oi', '+55 31 99999-0000')).toBe('https://wa.me/5531999990000?text=oi');
  });
});
