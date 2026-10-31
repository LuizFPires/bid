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
      categoria: 'Estrutura Metálica',
      obra: 'RAFLog',
      pontos: [
        { criterio: 'Tributos', situacao: 'alerta', texto: 'Não inclusos: ISS 5%' },
        { criterio: 'Garantia', situacao: 'falta', texto: null },
      ],
    });
    expect(m.startsWith('Estamos equalizando as propostas de Estrutura Metálica da obra RAFLog')).toBe(true);
    expect(m).toContain('• Tributos: confirmar por escrito que os tributos estão incluídos no preço final (a proposta traz: "Não inclusos: ISS 5%").');
    expect(m).toContain('• Garantia: incluir a garantia (prazo e cobertura).');
    expect(m.trim().endsWith('Obrigado!')).toBe(true);
  });
});

describe('linkWhatsAppMensagem', () => {
  it('deixa o WhatsApp escolher o contato e codifica o texto', () => {
    expect(linkWhatsAppMensagem('oi, tudo bem?')).toBe('https://wa.me/?text=oi%2C%20tudo%20bem%3F');
  });
});
