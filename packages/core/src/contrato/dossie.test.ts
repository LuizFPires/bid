import { describe, expect, it } from 'vitest';
import { destaquesDoDossie, dossieDesatualizado, montarDossie } from './dossie';
import { camposFaltando, parametrosIniciais } from './parametros';
import { canonico, hashDocumento } from './hash';
import { achadosBloqueantes, contarPorSeveridade, justificativaValida, normalizarRevisao } from './revisao';
import type { EntradaDossie } from './tipos';

// Caso fictício (docs/contratos/casos/caso-ficticio-01.json): fundações, 60 dias, R$ 312.450,00
const entrada: EntradaDossie = {
  proposta: { id: 'p1', fornecedor: 'Fundações Exemplo Ltda.', opcao: null, versao: 2, arquivoPath: 'org/u/proposta.pdf', valor: 312450, prazoDias: 60, condicaoPagamento: '30% sinal + medições', garantia: '5 anos' },
  extraida: {
    observacoes: 'Execução de 120 estacas hélice contínua Ø40 cm, incluindo mobilização, concreto e armação. Não inclui sondagem.',
    itens: [
      { descricao: 'Mobilização e desmobilização', qtd: 1, unit: 18000, total: 18000 },
      { descricao: 'Estaca hélice contínua Ø40 cm', qtd: 1800, unit: 152.4725, total: 274450.5 },
      { descricao: 'Arrasamento de estaca', qtd: 120, unit: 166.6625, total: 19999.5 },
    ],
    alertas: [{ tipo: 'validade', titulo: 'Validade curta', texto: 'Proposta válida por 5 dias.' }],
  },
  analise: {
    id: 'eq1',
    matriz: { criterios: ['Prazo', 'Garantia'], porProposta: [{ proposta_id: 'p1', celulas: [{ texto: '60 dias', status: 'ok' }, { texto: null, status: 'falta' }] }, { proposta_id: 'p2', celulas: [{ texto: '90', status: 'ok' }, { texto: '1 ano', status: 'ok' }] }] },
    escopo: { itens: ['Sondagem', 'Ensaios PIT'], porProposta: [{ proposta_id: 'p1', status: ['ausente', 'parcial'] }, { proposta_id: 'p2', status: ['incluido', 'incluido'] }] },
    forcas_riscos: [{ proposta_id: 'p1', resumo: 'mais barata', a_favor: ['menor preço'], riscos: ['sem sondagem'] }, { proposta_id: 'p2', resumo: 'x', a_favor: ['y'], riscos: ['z'] }],
    cards: [{ proposta_id: 'p1', apresentado: 312450, equalizado: 330000, base: '120 estacas', nota: '+ sondagem' }],
  },
  obra: { id: 'o1', nome: 'Residencial Jardim das Acácias', cidade: 'Cidade Exemplo/MG', endereco: 'Rua das Palmeiras, 100, Bairro Novo, Cidade Exemplo/MG', cep: '30000000', cno: '900000000001', foro: null },
  categoria: 'Fundações',
  agora: '2026-11-01T12:00:00.000Z',
};

describe('montarDossie', () => {
  const d = montarDossie(entrada);
  it('fotografa a proposta e só o que a equalização diz DELA (nada das concorrentes)', () => {
    expect(d.geradoEm).toBe('2026-11-01T12:00:00.000Z');
    expect(d.proposta.itens).toHaveLength(3);
    expect(d.equalizacao?.criterios).toEqual([{ criterio: 'Prazo', texto: '60 dias', status: 'ok' }, { criterio: 'Garantia', texto: null, status: 'falta' }]);
    expect(d.equalizacao?.escopo).toEqual([{ item: 'Sondagem', status: 'ausente' }, { item: 'Ensaios PIT', status: 'parcial' }]);
    expect(d.equalizacao?.riscos).toEqual(['sem sondagem']);
    expect(d.equalizacao?.equalizado).toBe(330000);
    expect(JSON.stringify(d)).not.toContain('p2');
  });
  it('sem análise, equalização fica null', () => {
    expect(montarDossie({ ...entrada, analise: null }).equalizacao).toBeNull();
  });
  it('destaques: alertas da leitura, escopo ausente/parcial e riscos', () => {
    const t = destaquesDoDossie(d).map((x) => x.tipo);
    expect(t).toEqual(['alerta', 'escopo', 'escopo', 'risco']);
  });
  it('desatualizado quando a proposta ganha versão ou muda valor/prazo', () => {
    expect(dossieDesatualizado(d, { versao: 2, valor: 312450, prazoDias: 60 })).toBe(false);
    expect(dossieDesatualizado(d, { versao: 3, valor: 312450, prazoDias: 60 })).toBe(true);
    expect(dossieDesatualizado(d, { versao: 2, valor: 300000, prazoDias: 60 })).toBe(true);
  });
});

describe('parametrosIniciais', () => {
  const d = montarDossie(entrada);
  const p = parametrosIniciais(d, { contratante: null, contratada: { origemId: 'f1', razao_social: 'Fundações Exemplo Ltda.', nome_curto: null, natureza: null, cnpj: '11222333000181', endereco: 'Av. Teste, 50', cep: null, email: 'contato@fundacoes-exemplo.com.br', qualificacao: '…' }, construtora: null }, { representante: 'Eng. Fulano' });
  it('sugere o quadro a partir do dossiê e deixa vazio o que não tem base', () => {
    expect(p.obra_nome).toBe('Residencial Jardim das Acácias');
    expect(p.obra_endereco).toBe('Rua das Palmeiras, 100, Bairro Novo, Cidade Exemplo/MG, CEP 30000-000');
    expect(p.obra_foro).toBe('Cidade Exemplo/MG');
    expect(p.q_regime).toMatch(/^Preço unitário/);
    expect(p.q_prazo).toBe('60 dias corridos');
    expect(p.q_antecipacao).toBe('30% sinal + medições');
    expect(p.q_garantia).toBe('5 anos');
    expect(p.empreitada_desc).toBe('execução de fundações');
    expect(p.cd_email).toBe('contato@fundacoes-exemplo.com.br');
    expect(p.q_representante).toBe('Eng. Fulano');
    expect(p.q_seguros).toBeUndefined();
    expect(p.q_valor).toBeUndefined(); // é do servidor
  });
  it('lista o que falta (obrigatórios vazios, sem os automáticos)', () => {
    const faltam = camposFaltando(p).map((c) => c.chave);
    expect(faltam).toContain('q_inicio');
    expect(faltam).toContain('q_seguros');
    expect(faltam).toContain('ct_email');
    expect(faltam).not.toContain('q_valor');
    expect(faltam).not.toContain('q_prazo');
  });
});

describe('hash', () => {
  it('canônico ignora ordem de chaves e undefined; hash muda com uma vírgula', async () => {
    expect(canonico({ b: 1, a: { d: undefined, c: [2, { z: 1, y: 2 }] } })).toBe('{"a":{"c":[2,{"y":2,"z":1}]},"b":1}');
    const h1 = await hashDocumento({ campos: { q_valor: '1.234,56' }, final: true });
    const h2 = await hashDocumento({ final: false, campos: { q_valor: '1.234,56' } });
    const h3 = await hashDocumento({ campos: { q_valor: '1.234,57' } });
    expect(h1).toBe(h2);
    expect(h1).not.toBe(h3);
    expect(h1).toMatch(/^[0-9a-f]{64}$/);
  });
});

describe('normalizarRevisao', () => {
  it('valida enums, descarta sem numero/titulo, ordena por severidade', () => {
    const r = normalizarRevisao({
      resumo: 'Quase tudo bate.',
      achados: [
        { tipo: 'risco', severidade: 'baixa', numero: '19.4', titulo: 'Variante', explicacao: 'x' },
        { tipo: 'conflito', severidade: 'alta', numero: 'quadro.q_prazo', titulo: 'Prazo', explicacao: 'quadro 60 × proposta 90', trecho_proposta: 'prazo de 90 dias', sugestao: '90 dias corridos' },
        { tipo: 'inventado', severidade: 'urgente', numero: 'planilha', titulo: 'Soma', explicacao: 'y' },
        { tipo: 'lacuna', severidade: 'media', titulo: 'sem numero', explicacao: 'z' },
      ],
    });
    expect(r.resumo).toBe('Quase tudo bate.');
    expect(r.achados.map((a) => [a.numero, a.tipo, a.severidade])).toEqual([
      ['quadro.q_prazo', 'conflito', 'alta'],
      ['planilha', 'risco', 'media'],
      ['19.4', 'risco', 'baixa'],
    ]);
    expect(contarPorSeveridade(r.achados)).toEqual({ alta: 1, media: 1, baixa: 1 });
  });
  it('bloqueia envio com alta sem resolução; aceite exige justificativa', () => {
    const a = normalizarRevisao({ achados: [{ tipo: 'conflito', severidade: 'alta', numero: '3.2', titulo: 't', explicacao: 'e' }] }).achados;
    expect(achadosBloqueantes(a.map((x) => ({ ...x, resolucao: null, justificativa: null })))).toHaveLength(1);
    expect(achadosBloqueantes(a.map((x) => ({ ...x, resolucao: 'aceito' as const, justificativa: 'negociado com o fornecedor' })))).toHaveLength(0);
    expect(justificativaValida('ok')).toBe(false);
    expect(justificativaValida('negociado em reunião')).toBe(true);
  });
});
