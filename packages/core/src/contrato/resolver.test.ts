import { describe, expect, it } from 'vitest';
import { inteiroExtenso, valorExtenso } from './extenso';
import { formatarNumeroContrato, parseNumeroContrato } from './numeracao';
import { agruparPorClausula, aplicarParametrosClausula, aplicarVariante, cmpNumeroItem, editarTexto, itemExtra, itensIniciais, proximoNumero, restaurarPadrao, suprimir, type CatalogoModelo } from './clausulas-v2';
import { resolverDocumento, textoDoDocumento, type EntradaResolver } from './resolver';
import { pendencias, pendenciasBloqueantes, type EntradaValidar } from './validar';
import type { LinhaPlanilha } from './planilha';
import { hashDocumento } from './hash';
import type { ItemClausula, PartesContrato, SignatarioContrato } from './tipos';

describe('extenso', () => {
  it('casos do SPEC', () => {
    expect(valorExtenso(0.01)).toBe('um centavo');
    expect(valorExtenso(1)).toBe('um real');
    expect(valorExtenso(1000)).toBe('mil reais');
    expect(valorExtenso(1_000_000)).toBe('um milhão de reais');
    expect(valorExtenso(312450)).toBe('trezentos e doze mil, quatrocentos e cinquenta reais');
    expect(valorExtenso(2_001_001.1)).toBe('dois milhões, mil e um reais e dez centavos');
    expect(valorExtenso(1100)).toBe('mil e cem reais');
    expect(valorExtenso(100)).toBe('cem reais');
    expect(valorExtenso(0)).toBe('zero reais');
    expect(valorExtenso(18000)).toBe('dezoito mil reais');
    expect(valorExtenso(274450.5)).toBe('duzentos e setenta e quatro mil, quatrocentos e cinquenta reais e cinquenta centavos');
  });
  it('inteiros', () => {
    expect(inteiroExtenso(21)).toBe('vinte e um');
    expect(inteiroExtenso(101)).toBe('cento e um');
    expect(inteiroExtenso(1_000_000_000)).toBe('um bilhão');
  });
});

describe('numeracao', () => {
  it('CT-AAAA-NNN', () => {
    expect(formatarNumeroContrato(2026, 7)).toBe('CT-2026-007');
    expect(formatarNumeroContrato(2026, 1234)).toBe('CT-2026-1234');
    expect(parseNumeroContrato('CT-2026-007')).toEqual({ ano: 2026, n: 7 });
    expect(parseNumeroContrato('x')).toBeNull();
    expect(() => formatarNumeroContrato(2026, 0)).toThrow();
  });
});

// Catálogo mínimo (o real é privado): só o suficiente para as regras.
const catalogo: CatalogoModelo = {
  versao: '1.0',
  clausulas: [
    { clausula: 'PRIMEIRA', titulo: 'NATUREZA', itens: [{ numero: '1.1', texto: 'A empreitada é contratada pela CONTRATANTE.' }, { numero: '1.3', texto: 'Integram: Anexos I e II.' }] },
    { clausula: 'TERCEIRA', titulo: 'PRAZO', itens: [{ numero: '3.1', texto: 'A CONTRATADA iniciará a mobilização na data do ANEXO I.' }, { numero: '3.6', texto: 'Item 3.6 padrão.' }] },
    { clausula: 'SEXTA', titulo: 'PREÇO', itens: [{ numero: '6.3', texto: 'Item 6.3.' }, { numero: '6.3.1', texto: 'Subitem 6.3.1.' }] },
    { clausula: 'VIGÉSIMA SEGUNDA', titulo: 'FORO', itens: [{ numero: '22.8', texto: 'Fica eleito o foro de {{obra_foro}}.' }] },
  ],
  anexo_ii: [
    { numero: '1', titulo: 'Capacidade técnica.', texto: 'Possui capacidade técnica.' },
    { numero: '4', titulo: 'Situação jurídica.', texto: 'Não está em recuperação judicial.' },
  ],
};

describe('clausulas-v2', () => {
  const itens = itensIniciais(catalogo);
  it('itens iniciais: catálogo + decl:N, tudo padrão', () => {
    expect(itens).toHaveLength(9);
    expect(itens.every((i) => i.origem === 'padrao' && i.textoPadrao === i.texto)).toBe(true);
    expect(itens.at(-1)!.numero).toBe('decl:4');
  });
  it('variante exige justificativa, propaga reduz_protecao e só vale no item certo', () => {
    const v = { chave: '1.3_x', numero: '1.3', titulo: 'x', texto: 'Novo 1.3.', reduz_protecao: true, explicacao: 'perde' };
    expect(() => aplicarVariante(itens[1]!, v, 'curta')).toThrow();
    const r = aplicarVariante(itens[1]!, v, 'negociado em reunião de 30/10');
    expect(r).toMatchObject({ origem: 'variante', varianteChave: '1.3_x', reduzProtecao: true, texto: 'Novo 1.3.' });
    expect(() => aplicarVariante(itens[0]!, v, 'negociado em reunião de 30/10')).toThrow();
  });
  it('editar texto vira variante livre; voltar ao texto padrão restaura; suprimir e restaurar', () => {
    const ed = editarTexto(itens[0]!, 'Texto editado.', 'pedido do fornecedor por e-mail');
    expect(ed).toMatchObject({ origem: 'variante', varianteChave: null, reduzProtecao: false });
    expect(editarTexto(ed, itens[0]!.textoPadrao!, 'x')).toMatchObject({ origem: 'padrao', justificativa: null });
    expect(() => editarTexto(itens[0]!, '', 'pedido do fornecedor')).toThrow();
    const sup = suprimir(itens[5]!, 'não há subempreitada neste serviço');
    expect(sup.suprimido).toBe(true);
    expect(restaurarPadrao(sup)).toMatchObject({ suprimido: false, origem: 'padrao' });
  });
  it('item extra: próximo número livre depois do apos', () => {
    expect(proximoNumero(itens, '3.6')).toBe('3.7');
    const ex = itemExtra(itens, '3.6', 'Dias de chuva prorrogam o prazo.', 'serviço a céu aberto, acordado');
    expect(ex).toMatchObject({ numero: '3.7', apos: '3.6', textoPadrao: null, origem: 'variante' });
    expect(proximoNumero([...itens, ex], '3.6')).toBe('3.8');
    expect(itemExtra([...itens, ex], '3.7', 'Outro.', 'justificativa suficiente')).toMatchObject({ numero: '3.8', apos: '3.6' });
    expect(() => restaurarPadrao(ex)).toThrow();
    expect(() => itemExtra(itens, '9.9', 'x', 'justificativa longa')).toThrow();
  });
  it('parâmetro de cláusula troca o texto só de item padrão e marca origem parametro', () => {
    const params = [{ numero: '3.1', parametro: 'inicio_anterior', rotulo: 'Início', tipo: 'data', texto: 'A CONTRATADA iniciou em {{inicio_anterior}}.' }];
    const r = aplicarParametrosClausula(itens, params, { inicio_anterior: '01/10/2026' });
    expect(r.find((i) => i.numero === '3.1')).toMatchObject({ texto: 'A CONTRATADA iniciou em 01/10/2026.', origem: 'parametro' });
    expect(aplicarParametrosClausula(itens, params, {}).find((i) => i.numero === '3.1')!.origem).toBe('padrao');
    const variante = editarTexto(itens[2]!, 'Outro.', 'justificativa suficiente');
    expect(aplicarParametrosClausula([variante], params, { inicio_anterior: 'x' })[0]!.origem).toBe('variante');
  });
  it('ordena e agrupa com extras depois do apos', () => {
    expect(['6.3.1', '1.3', 'decl:1', '1.1', '22.8'].sort(cmpNumeroItem)).toEqual(['1.1', '1.3', '6.3.1', '22.8', 'decl:1']);
    const ex = itemExtra(itens, '3.6', 'Extra.', 'justificativa suficiente');
    const g = agruparPorClausula(catalogo, [...itens, ex]);
    expect(g[1]!.itens.map((i) => i.numero)).toEqual(['3.1', '3.6', '3.7']);
  });
});

const partes: PartesContrato = {
  contratante: { origemId: null, razao_social: 'SPE Exemplo Empreendimentos Ltda.', nome_curto: 'SPE EXEMPLO', natureza: 'sociedade empresária limitada', cnpj: '22333444000181', endereco: 'Rua Alfa, 1, Cidade Exemplo/MG', cep: '30000001', email: 'obras@spe-exemplo.com.br', qualificacao: 'SPE Exemplo Empreendimentos Ltda., … representada por Sicrano Alves' },
  contratada: { origemId: null, razao_social: 'Fundações Exemplo Ltda.', nome_curto: null, natureza: 'sociedade empresária limitada', cnpj: '11222333000181', endereco: 'Av. Teste, 50, Cidade Exemplo/MG', cep: null, email: 'contato@fundacoes-exemplo.com.br', qualificacao: 'Fundações Exemplo Ltda., … representada por Beltrano Exemplo' },
  construtora: { origemId: null, razao_social: 'Construtora Exemplo S.A.', nome_curto: null, natureza: 'sociedade anônima', cnpj: '33444555000181', endereco: 'Rua Beta, 2', cep: null, email: 'contratos@construtora-exemplo.com.br', qualificacao: 'Construtora Exemplo S.A., … representada por seus diretores Diretor Um e Diretor Dois', marca: 'classica' },
};
const signatarios: SignatarioContrato[] = [
  { parte: 'contratante', nome: 'Sicrano Alves', cpf: null, cargo: 'Administrador', email: null, telefone: null, ordem: 1, obrigatorio: true },
  { parte: 'contratada', nome: 'Beltrano Exemplo', cpf: '52998224725', cargo: 'Sócio-administrador', email: null, telefone: null, ordem: 1, obrigatorio: true },
  { parte: 'construtora', nome: 'Diretor Um', cpf: null, cargo: 'Diretor', email: null, telefone: null, ordem: 1, obrigatorio: true },
  { parte: 'construtora', nome: 'Diretor Dois', cpf: null, cargo: 'Diretor', email: null, telefone: null, ordem: 2, obrigatorio: true },
];
const planilha: LinhaPlanilha[] = [
  { codigo: '1', grupo: true, descricao: 'MOBILIZAÇÃO', unidade: null, quantidade: null, preco_unitario: null },
  { codigo: '1.1', grupo: false, descricao: 'Mobilização e desmobilização de equipamento', unidade: 'vb', quantidade: 1, preco_unitario: 18000 },
  { codigo: '2', grupo: true, descricao: 'ESTACAS', unidade: null, quantidade: null, preco_unitario: null },
  { codigo: '2.1', grupo: false, descricao: 'Estaca hélice contínua Ø40 cm', unidade: 'm', quantidade: 1800, preco_unitario: 152.4725 },
  { codigo: '2.2', grupo: false, descricao: 'Arrasamento de estaca', unidade: 'un', quantidade: 120, preco_unitario: 166.6625 },
];
const parametros: Record<string, string> = {
  obra_nome: 'Residencial Jardim das Acácias', obra_endereco: 'Rua das Palmeiras, 100, Bairro Novo, Cidade Exemplo/MG, CEP 30000-000', obra_cno: '90.000.00000/01', obra_foro: 'Cidade Exemplo/MG',
  empreitada_desc: 'execução de fundações profundas tipo estaca hélice contínua', escopo_resumo: 'Execução de 120 estacas hélice contínua Ø40 cm.', q_regime: 'Preço unitário — pagamento pelas quantidades efetivamente medidas.',
  q_inicio: '10/11/2026', q_prazo: '60 dias corridos', q_marcos: 'Não se aplica.', q_docs: 'Projeto de fundações rev. 02.', q_criterio: 'Medição mensal por metro linear executado.', q_periodicidade: 'Mensal, com corte no dia 25.', q_liberacao: 'Até 10 dias após a aprovação da medição.',
  q_antecipacao: 'Não há.', q_retencao: '5% de cada medição.', q_garantia: '5 anos.', q_seguros: 'RC obras de R$ 500.000,00.', q_mat_contratante: 'Não há.', q_mat_contratada: 'Concreto, aço e consumíveis.', q_fat_direto: 'Não há.', q_representante: 'Eng. Fulano de Tal (fictício)',
  ct_email: 'obras@spe-exemplo.com.br', cd_email: 'contato@fundacoes-exemplo.com.br', cs_email: 'contratos@construtora-exemplo.com.br',
  decl_nome: 'Beltrano Exemplo', decl_cpf: '529.982.247-25', decl_cargo: 'Sócio-administrador',
  anexo_iii_incluir: 'sim', prop_numero: '045/2026', prop_data: '20/10/2026', prop_emitente: 'Fundações Exemplo Ltda.', prop_destinatario: 'Construtora Exemplo S.A.',
  _aviso_soma: 'interno',
};

function entrada(over: Partial<EntradaResolver> = {}): EntradaResolver {
  const base = itensIniciais(catalogo);
  const ex = itemExtra(base, '3.6', 'Os dias de chuva que impeçam a execução prorrogam o prazo na mesma medida.', 'serviço a céu aberto');
  const itens = [...base.map((i) => (i.numero === '6.3.1' ? suprimir(i, 'não há subempreitada aqui') : i)), ex];
  return { parametros, partes, itens, planilha, blocos: [{ titulo: 'Fundações — escavação e escoramento', itens: ['A CONTRATADA é responsável pela estabilidade das escavações.', 'Sobras serão destinadas conforme o plano de resíduos.'] }, { titulo: 'Ensaios', itens: ['PIT em 10% das estacas.'] }], signatarios, catalogo, final: false, ...over };
}

describe('resolverDocumento (caso fictício)', () => {
  const doc = resolverDocumento(entrada());
  it('campos: valor é a soma da planilha, extenso, anexos derivados, contratada, sem internos', () => {
    expect(doc.campos.q_valor).toBe('312.450,00');
    expect(doc.campos.total).toBe('312.450,00');
    expect(doc.campos.q_valor_extenso).toBe('trezentos e doze mil, quatrocentos e cinquenta reais');
    expect(doc.campos.anexos_lista).toBe('ANEXOS I, II e III');
    expect(doc.campos.cd_cnpj).toBe('11.222.333/0001-81');
    expect(doc.campos.ass_local).toBe('Cidade Exemplo/MG');
    expect(doc.campos.ass_dia).toBeUndefined();
    expect(Object.keys(doc.campos).some((k) => k.startsWith('_') || k.startsWith('prop_') || k.startsWith('anexo_iii_'))).toBe(false);
  });
  it('cláusulas: suprimido = null, extra 3.7 depois do 3.6, marcador dentro do texto preservado para o motor', () => {
    expect(doc.clausulas['6.3.1']).toBeNull();
    expect(doc.clausulas['3.7']).toBeUndefined();
    expect(doc.extras).toEqual([{ apos: '3.6', numero: '3.7', texto: 'Os dias de chuva que impeçam a execução prorrogam o prazo na mesma medida.' }]);
    expect(doc.clausulas['22.8']).toContain('{{obra_foro}}');
    expect(doc._origens['6.3.1']).toBe('variante');
  });
  it('planilha formatada, signatários por parte (declarante do quadro), Anexo II e III', () => {
    expect(doc.itens[0]).toEqual({ grupo: true, n: '1', desc: 'MOBILIZAÇÃO' });
    expect(doc.itens[3]).toEqual({ n: '2.1', desc: 'Estaca hélice contínua Ø40 cm', und: 'm', qtd: '1.800', unit: '152,4725', total: '274.450,50' });
    expect(doc.signatarios.construtora).toHaveLength(2);
    expect(doc.signatarios.declarante).toEqual([{ nome: 'Beltrano Exemplo', cargo: 'Sócio-administrador' }]);
    expect(doc.declaracao).toHaveLength(2);
    expect(doc.anexoIII?.texto).toContain('Proposta nº 045/2026, de 20/10/2026, emitida por Fundações Exemplo Ltda. e dirigida a Construtora Exemplo S.A.');
    expect(doc.razao.contratada).toBe('Fundações Exemplo Ltda.');
  });
  it('emissão preenche data por extenso', () => {
    const d = resolverDocumento(entrada({ emissao: { data: '2026-11-05T12:00:00-03:00', local: 'Belo Horizonte/MG' }, final: true }));
    expect(d.campos).toMatchObject({ ass_dia: '5', ass_mes: 'novembro', ass_ano: '2026', ass_local: 'Belo Horizonte/MG' });
    expect(d.final).toBe(true);
  });
  it('hash: estável, ignora final e _origens, muda com uma vírgula', async () => {
    const h1 = await hashDocumento(doc);
    const h2 = await hashDocumento(resolverDocumento(entrada({ final: true })));
    expect(h1).toBe(h2);
    const h3 = await hashDocumento(resolverDocumento(entrada({ parametros: { ...parametros, q_prazo: '60 dias corridos,' } })));
    expect(h3).not.toBe(h1);
  });
  it('snapshot do documento e do texto corrido', () => {
    expect(doc).toMatchSnapshot();
    expect(textoDoDocumento(doc)).toMatchSnapshot();
  });
});

describe('pendencias', () => {
  const base: EntradaValidar = { dossie: { proposta: { valor: 312450 } } as never, parametros, partes, itens: itensIniciais(catalogo), planilha, blocos: [{ chave: 'ensaios' }], signatarios };
  it('contrato completo não tem pendência bloqueante', () => {
    expect(pendenciasBloqueantes(pendencias(base))).toEqual([]);
  });
  it('cada regra isolada', () => {
    const cod = (e: Partial<typeof base>) => pendencias({ ...base, ...e }).map((p) => p.codigo);
    expect(cod({ dossie: null })).toContain('dossie');
    expect(cod({ partes: { ...partes, contratada: null } })).toContain('parte:contratada');
    expect(cod({ partes: { ...partes, contratada: { ...partes.contratada!, cnpj: '11222333000100' } } })).toContain('cnpj:contratada');
    expect(cod({ signatarios: signatarios.filter((s) => s.parte !== 'construtora') })).toContain('signatario:construtora');
    expect(cod({ parametros: { ...parametros, q_prazo: '' } })).toContain('quadro');
    expect(cod({ planilha: [] })).toContain('planilha');
    expect(cod({ planilha: [{ ...planilha[1]!, preco_unitario: null }] })).toContain('planilha:incompleta');
    const comValor = pendencias({ ...base, dossie: { proposta: { valor: 300000 } } as never });
    expect(comValor.find((p) => p.codigo === 'planilha:valor')?.bloqueia).toBe(false);
    expect(cod({ parametros: { ...parametros, prop_destinatario: 'Outra Incorporadora' } })).toContain('ratificacao');
    expect(cod({ blocos: [{ chave: 'ratificacao_proposta' }], parametros: { ...parametros, prop_destinatario: 'Outra Incorporadora' } })).not.toContain('ratificacao');
    const semJust: ItemClausula = { ...base.itens[0]!, origem: 'variante', texto: 'x', justificativa: null };
    expect(cod({ itens: [semJust] })).toContain('justificativa:1.1');
    expect(pendencias({ ...base, itens: [{ ...base.itens[0]!, reduzProtecao: true }] }).find((p) => p.codigo === 'reduz_protecao')?.bloqueia).toBe(false);
    expect(cod({ faltandoServidor: ['q_seguros', 'ass_dia'] })).toEqual(expect.arrayContaining(['marcador:q_seguros']));
    expect(cod({ faltandoServidor: ['ass_dia'] }).some((c) => c.startsWith('marcador:'))).toBe(false);
  });
});
