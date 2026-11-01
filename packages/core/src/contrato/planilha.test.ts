import { describe, expect, it } from 'vitest';
import { divergenciaValor, fmtUnit, importarXlsxLinhas, linhasDaProposta, numeroBR, totalLinha, totalPlanilha, totaisPorGrupo } from './planilha';
import { aplicarBloco, derivarAnexos, numeroItemBloco, precisaRatificacao, reconciliarItensBlocos, sugerirBlocos, type BlocoModelo } from './blocos';
import type { ItemClausula } from './tipos';
import { montarDossie } from './dossie';

describe('planilha', () => {
  it('total da linha: 1.800 × 152,4725 = 274.450,50; 3 × 0,3333 = 1,00; HALF_UP', () => {
    expect(totalLinha(1800, 152.4725)).toBe(274450.5);
    expect(totalLinha(3, 0.3333)).toBe(1.0);
    expect(totalLinha(1, 0.005)).toBe(0.01);
    expect(totalLinha(0.1, 0.2)).toBe(0.02);
    expect(totalLinha(null, 10)).toBeNull();
    // produto acima de 2^53 em décimos de milésimo
    expect(totalLinha(1_000_000, 123456.7891)).toBe(123456789100);
    expect(totalLinha(-1, 0.005)).toBe(-0.01);
  });
  it('subtotal por grupo até o próximo grupo', () => {
    const linhas = [
      { codigo: '1', grupo: true, descricao: 'A', unidade: null, quantidade: null, preco_unitario: null },
      { codigo: '1.1', grupo: false, descricao: 'a', unidade: 'un', quantidade: 2, preco_unitario: 10 },
      { codigo: '2', grupo: true, descricao: 'B', unidade: null, quantidade: null, preco_unitario: null },
      { codigo: '2.1', grupo: false, descricao: 'b', unidade: 'un', quantidade: 1, preco_unitario: 0.1 },
      { codigo: '2.2', grupo: false, descricao: 'c', unidade: 'un', quantidade: 1, preco_unitario: 0.2 },
    ];
    expect([...totaisPorGrupo(linhas)]).toEqual([[0, 20], [2, 0.3]]);
  });
  it('soma ignora grupos e fecha o caso fictício em 312.450,00', () => {
    const linhas = [
      { codigo: '1', grupo: true, descricao: 'MOBILIZAÇÃO', unidade: null, quantidade: null, preco_unitario: null },
      { codigo: '1.1', grupo: false, descricao: 'Mobilização', unidade: 'vb', quantidade: 1, preco_unitario: 18000 },
      { codigo: '2.1', grupo: false, descricao: 'Estaca', unidade: 'm', quantidade: 1800, preco_unitario: 152.4725 },
      { codigo: '2.2', grupo: false, descricao: 'Arrasamento', unidade: 'un', quantidade: 120, preco_unitario: 166.6625 },
    ];
    expect(totalPlanilha(linhas)).toBe(312450);
    expect(divergenciaValor(312450, 312450)).toEqual({ difere: false, diferenca: 0 });
    expect(divergenciaValor(312450, 300000).difere).toBe(true);
  });
  it('formata unitário com 2 a 4 casas', () => {
    expect(fmtUnit(152.4725)).toBe('152,4725');
    expect(fmtUnit(18000)).toBe('18.000,00');
    expect(fmtUnit(10.5)).toBe('10,50');
    expect(fmtUnit(0.333)).toBe('0,333');
  });
  it('números no padrão brasileiro e americano', () => {
    expect(numeroBR('1.800')).toBe(1800);
    expect(numeroBR('152,4725')).toBe(152.4725);
    expect(numeroBR('R$ 18.000,00')).toBe(18000);
    expect(numeroBR('1,234.56')).toBe(1234.56);
    expect(numeroBR(7)).toBe(7);
    expect(numeroBR('abc')).toBeNull();
  });
  it('importa matriz de .xlsx: acha cabeçalho, grupos e ignora total', () => {
    const rows = [
      ['PLANILHA ORÇAMENTÁRIA'],
      ['Código', 'Descrição', 'Und', 'Quant.', 'P. Unitário', 'Total'],
      ['1', 'MOBILIZAÇÃO', '', '', '', ''],
      ['1.1', 'Mobilização e desmobilização', 'vb', '1', '18.000,00', '18.000,00'],
      ['2.1', 'Estaca hélice contínua Ø40', 'm', '1.800', '152,4725', '274.450,50'],
      ['', 'TOTAL', '', '', '', '292.450,50'],
    ];
    const r = importarXlsxLinhas(rows);
    expect(r.avisos).toEqual([]);
    expect(r.linhas).toHaveLength(3);
    expect(r.linhas[0]).toMatchObject({ codigo: '1', grupo: true, descricao: 'MOBILIZAÇÃO' });
    expect(r.linhas[2]).toMatchObject({ codigo: '2.1', unidade: 'm', quantidade: 1800, preco_unitario: 152.4725 });
    expect(totalPlanilha(r.linhas)).toBe(292450.5);
  });
  it('linhas a partir dos itens lidos (unitário derivado do total)', () => {
    const l = linhasDaProposta([{ descricao: 'Estaca', qtd: 1800, unit: null, total: 274450.5 }]);
    expect(l[0]).toMatchObject({ codigo: '1', quantidade: 1800, preco_unitario: 152.4725 });
  });
});

const biblioteca: BlocoModelo[] = [
  { chave: 'ratificacao_proposta', titulo: 'Ratificação', categorias: ['*'], quando: null, parametros: [{ chave: 'prop_numero', rotulo: 'Nº', tipo: 'texto' }, { chave: 'docs_nao_anexados', rotulo: 'Docs', tipo: 'texto_longo' }], itens_anexo: ['A Proposta nº {{prop_numero}} é ratificada.', '{{docs_nao_anexados}}'], altera_clausulas: [{ numero: '1.3', texto: 'Integram: Anexos I, II e III.' }] },
  { chave: 'exclusoes', titulo: 'Exclusões', categorias: ['*'], quando: null, parametros: [{ chave: 'lista_exclusoes', rotulo: 'Lista', tipo: 'lista' }], itens_anexo: ['Não integram o escopo: {{lista_exclusoes}}.'], altera_clausulas: [] },
  { chave: 'ensaios', titulo: 'Ensaios', categorias: ['fundação', 'fundações', 'estrutura'], quando: null, parametros: [{ chave: 'ensaios_lista', rotulo: 'Ensaios', tipo: 'texto_longo' }], itens_anexo: ['Ensaios: {{ensaios_lista}}.'], altera_clausulas: [] },
  { chave: 'itens_temporais', titulo: 'Temporais', categorias: ['terraplanagem'], quando: null, parametros: [], itens_anexo: ['x'], altera_clausulas: [] },
];

describe('blocos', () => {
  const dossie = montarDossie({
    proposta: { id: 'p1', fornecedor: 'F', opcao: null, versao: 1, arquivoPath: null, valor: 1, prazoDias: 1, condicaoPagamento: null, garantia: null },
    extraida: { observacoes: 'Não inclui sondagem. Hora técnica R$ 295,00.' },
    analise: { id: 'e', escopo: { itens: ['Sondagem', 'PIT'], porProposta: [{ proposta_id: 'p1', status: ['ausente', 'incluido'] }] } },
    obra: { id: 'o', nome: 'O', cidade: null, endereco: null, cep: null, cno: null, foro: null },
    categoria: 'Fundações profundas',
  });
  it('sugere por categoria e por sinais; ratificação nunca vem marcada', () => {
    const s = sugerirBlocos('Fundações profundas', dossie, biblioteca);
    const por = Object.fromEntries(s.map((x) => [x.chave, x]));
    expect(por.ensaios!.marcado).toBe(true);
    expect(por.itens_temporais!.marcado).toBe(false);
    expect(por.exclusoes!.marcado).toBe(true);
    expect(por.exclusoes!.parametros.lista_exclusoes).toBe('Sondagem');
    expect(por.ratificacao_proposta!.marcado).toBe(false);
  });
  it('aplica bloco: troca marcadores, lista vira "a; b", item só-parâmetro vazio some, faltando lista o resto', () => {
    const r = aplicarBloco(biblioteca[1]!, { lista_exclusoes: 'Sondagem\nPIT' });
    expect(r.itens).toEqual(['Não integram o escopo: Sondagem; PIT.']);
    const rat = aplicarBloco(biblioteca[0]!, {});
    expect(rat.itens).toEqual(['A Proposta nº [PROP_NUMERO] é ratificada.']);
    expect(rat.faltando).toEqual(['prop_numero']);
    expect(rat.alteracoes[0]).toEqual({ numero: '1.3', apos: undefined, texto: 'Integram: Anexos I, II e III.' });
  });
  it('ratificação obrigatória quando emitente/destinatário divergem das partes', () => {
    const partes = { contratante: { razao_social: 'SPE Exemplo Ltda.', nome_curto: 'SPE EXEMPLO' }, contratada: { razao_social: 'Fundações Exemplo Ltda.', nome_curto: null }, construtora: { razao_social: 'Construtora Exemplo S.A.', nome_curto: null } } as never;
    expect(precisaRatificacao(partes, { incluir: true, emitente: 'Fundações Exemplo Ltda', destinatario: 'Construtora Exemplo S.A.' })).toBe(false);
    expect(precisaRatificacao(partes, { incluir: true, emitente: 'Fundações Exemplo Ltda', destinatario: 'Outra Incorporadora' })).toBe(true);
    expect(precisaRatificacao(partes, { incluir: false, emitente: 'X', destinatario: 'Y' })).toBe(false);
    expect(derivarAnexos({ anexoIII: true }).anexos_lista).toBe('ANEXOS I, II e III');
    expect(derivarAnexos({ anexoIII: false }).anexos_lista).toBe('ANEXOS I e II');
  });
});

describe('reconciliarItensBlocos', () => {
  const base = (n: string, texto: string, extra: Partial<ItemClausula> = {}): ItemClausula => ({ numero: n, apos: null, texto, textoPadrao: texto, origem: 'padrao', varianteChave: null, blocoChave: null, suprimido: false, justificativa: null, reduzProtecao: false, ...extra });
  const rat = aplicarBloco(biblioteca[0]!, { prop_numero: '045' });
  it('altera item existente e insere item novo com número único do bloco', () => {
    const itens = [base('1.3', 'Integram: Anexos I e II.')];
    const out = reconciliarItensBlocos(itens, [rat]);
    expect(out).toHaveLength(1);
    expect(out[0]).toMatchObject({ numero: '1.3', texto: 'Integram: Anexos I, II e III.', origem: 'bloco', blocoChave: 'ratificacao_proposta' });
    const ins = aplicarBloco({ ...biblioteca[1]!, altera_clausulas: [{ apos: '5.2', texto: 'Novo item.' }] }, { lista_exclusoes: 'x' });
    const out2 = reconciliarItensBlocos(itens, [ins]);
    expect(out2[0]).toMatchObject({ numero: numeroItemBloco('5.2', 'exclusoes'), apos: '5.2', origem: 'bloco', textoPadrao: null });
  });
  it('bloco que saiu: alterado volta ao padrão, inserido fica suprimido; nada muda se já está igual', () => {
    const itens: ItemClausula[] = [
      base('1.3', 'Integram: Anexos I, II e III.', { textoPadrao: 'Integram: Anexos I e II.', origem: 'bloco', blocoChave: 'ratificacao_proposta' }),
      base('5.2.b.exclusoes', 'Novo item.', { apos: '5.2', textoPadrao: null, origem: 'bloco', blocoChave: 'exclusoes' }),
    ];
    const out = reconciliarItensBlocos(itens, []);
    expect(out).toEqual([
      expect.objectContaining({ numero: '1.3', texto: 'Integram: Anexos I e II.', origem: 'padrao', blocoChave: null }),
      expect.objectContaining({ numero: '5.2.b.exclusoes', suprimido: true, origem: 'bloco' }),
    ]);
    expect(reconciliarItensBlocos([itens[0]!], [rat])).toEqual([]);
  });
});
