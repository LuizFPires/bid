/**
 * Extração de proposta por IA — partes PURAS e testáveis (regra #1 do CLAUDE.md).
 * A chamada à Anthropic acontece no servidor (/api); aqui ficam o schema da
 * saída estruturada, o prompt e a normalização/validação do JSON devolvido pela
 * IA, para que a função de servidor seja fina e o resultado seja sempre seguro.
 */

import { parseBRL } from './money';

/** Um item de planilha/escopo extraído da proposta. */
export interface ItemExtraido {
  descricao: string;
  qtd: number | null;
  unit: number | null;
  total: number | null;
}

/**
 * Uma ALTERNATIVA de preço, quando o mesmo documento traz mais de uma (ex.:
 * "Opção 1 (Cassete)" e "Opção 2 (Splitão)", "Alternativa A/B", cenários).
 * Cada opção tem seu valor TOTAL; fornecedor e condições costumam ser comuns.
 */
export interface OpcaoExtraida {
  rotulo: string;
  valor: number | null;
  /** O que muda nesta alternativa (escopo/equipamentos). */
  descricao: string | null;
}

/** Dados que a IA extrai do arquivo da proposta (antes da conferência). */
export interface PropostaExtraida {
  fornecedor: string | null;
  /** valor total da proposta, em reais (com várias opções, o da 1ª). */
  valor: number | null;
  prazo_dias: number | null;
  condicao_pagamento: string | null;
  garantia: string | null;
  itens: ItemExtraido[];
  /** Alternativas de preço do documento; vazia quando há um único preço. */
  opcoes: OpcaoExtraida[];
  observacoes: string | null;
}

/**
 * JSON Schema da ferramenta forçada (Anthropic `input_schema`). Mantido como
 * objeto simples para a função de servidor passar direto à Messages API.
 */
export const EXTRACAO_INPUT_SCHEMA = {
  type: 'object',
  properties: {
    fornecedor: { type: ['string', 'null'], description: 'Nome do fornecedor/empresa proponente.' },
    valor: {
      type: ['number', 'null'],
      description: 'Valor TOTAL da proposta em reais (número, sem símbolo nem separador de milhar).',
    },
    prazo_dias: {
      type: ['number', 'null'],
      description: 'Prazo de execução/entrega em DIAS corridos (converta de semanas/meses se preciso).',
    },
    condicao_pagamento: { type: ['string', 'null'], description: 'Condição de pagamento (ex.: 30/40/30%, à vista).' },
    garantia: { type: ['string', 'null'], description: 'Garantia oferecida (ex.: 5 anos).' },
    itens: {
      type: 'array',
      description: 'Itens/escopo com quantidades e valores, quando houver planilha.',
      items: {
        type: 'object',
        properties: {
          descricao: { type: 'string' },
          qtd: { type: ['number', 'null'] },
          unit: { type: ['number', 'null'] },
          total: { type: ['number', 'null'] },
        },
        required: ['descricao'],
      },
    },
    opcoes: {
      type: 'array',
      description:
        'SÓ quando o documento apresenta MAIS DE UMA alternativa de preço (ex.: "Opção 1" e "Opção 2", "Alternativa A/B", cenários com totais distintos). Uma entrada por alternativa, com o valor TOTAL de cada uma. Se há um único preço, lista vazia.',
      items: {
        type: 'object',
        properties: {
          rotulo: { type: 'string', description: 'Nome da alternativa como aparece no documento (ex.: "Opção 1 (Cassete)").' },
          valor: { type: ['number', 'null'], description: 'Valor TOTAL desta alternativa, em reais (número puro).' },
          descricao: { type: ['string', 'null'], description: 'O que muda nesta alternativa (escopo/equipamentos), em uma frase.' },
        },
        required: ['rotulo', 'valor', 'descricao'],
      },
    },
    observacoes: { type: ['string', 'null'], description: 'Observações relevantes, exclusões ou ressalvas.' },
  },
  required: ['fornecedor', 'valor', 'prazo_dias', 'condicao_pagamento', 'garantia', 'itens', 'opcoes', 'observacoes'],
} as const;

export const EXTRACAO_TOOL_NAME = 'registrar_proposta';

/** Instrução enviada à IA junto com o documento. */
export const EXTRACAO_PROMPT = [
  'Você é um analista de compras de obras. Leia a proposta anexada e extraia os',
  'dados para a ferramenta registrar_proposta.',
  '',
  '- Valores em reais, como número puro (1284500.00), nunca como texto com "R$".',
  '- Prazo sempre em DIAS corridos.',
  '- Se um campo não existir no documento, use null — não invente.',
  '- itens: só quando o documento traz planilha/quantitativo; senão, lista vazia.',
  '- opcoes: ATENÇÃO — alguns documentos trazem MAIS DE UMA alternativa de preço',
  '  ("Opção 1 / Opção 2", "Alternativa A / B", cenários ou sistemas distintos, cada',
  '  um com seu TOTAL). Nesse caso liste UMA entrada por alternativa em opcoes, com o',
  '  rótulo do documento, o valor TOTAL dela e o que muda; e em valor coloque o total',
  '  da PRIMEIRA opção. Se o documento tem um único preço, opcoes é lista vazia.',
  '  Não confunda com itens (linhas de planilha que SOMAM o total) nem com formas de',
  '  pagamento diferentes do mesmo preço.',
  '- opcoes SÓ existem quando o documento OFERECE alternativas ao cliente de forma',
  '  explícita: rótulos como "Opção 1/2", "Alternativa A/B", "Cenário", ou totais',
  '  distintos apresentados lado a lado para escolha. NUNCA crie opções a partir de',
  '  versões/revisões do mesmo orçamento.',
  '- TEXTO OCULTO / REVISÕES SOBREPOSTAS: PDFs editados costumam guardar, na camada',
  '  de texto, trechos de versões anteriores (ex.: a seção "Investimento" repetida',
  '  com R$ 255.000, R$ 315.000 e R$ 330.000, sem rótulo de opção). Isso NÃO é',
  '  opção. Vale o que está VISÍVEL na página renderizada e, em dúvida, a ÚLTIMA',
  '  ocorrência / a frase "Valor total da proposta: R$ X". Use esse X em valor,',
  '  deixe opcoes vazia e registre em observacoes: "O arquivo contém texto oculto',
  '  de versão anterior (R$ …); considerado o valor visível R$ X".',
  '',
  'Responda SOMENTE chamando a ferramenta registrar_proposta com os dados. Não',
  'escreva texto fora da ferramenta.',
].join('\n');

const MAX_TEXTO = 2000;
const MAX_ITENS = 200;
const MAX_OPCOES = 10;

function texto(v: unknown): string | null {
  if (typeof v !== 'string') return null;
  const t = v.trim();
  if (!t) return null;
  return t.length > MAX_TEXTO ? t.slice(0, MAX_TEXTO) : t;
}

/** Aceita número ou texto no padrão brasileiro; devolve número finito ou null. */
function numero(v: unknown): number | null {
  if (typeof v === 'number') return Number.isFinite(v) ? v : null;
  if (typeof v === 'string') {
    const t = v.trim();
    if (!t) return null;
    const n = parseBRL(t);
    return n !== null && Number.isFinite(n) ? n : null;
  }
  return null;
}

function inteiroPositivo(v: unknown): number | null {
  const n = numero(v);
  if (n === null) return null;
  const i = Math.round(n);
  return i > 0 ? i : null;
}

function item(v: unknown): ItemExtraido | null {
  if (typeof v !== 'object' || v === null) return null;
  const o = v as Record<string, unknown>;
  const descricao = texto(o.descricao);
  if (!descricao) return null;
  return {
    descricao,
    qtd: numero(o.qtd),
    unit: numero(o.unit),
    total: numero(o.total),
  };
}

function opcao(v: unknown): OpcaoExtraida | null {
  if (typeof v !== 'object' || v === null) return null;
  const o = v as Record<string, unknown>;
  const rotulo = texto(o.rotulo);
  if (!rotulo) return null;
  return { rotulo, valor: numero(o.valor), descricao: texto(o.descricao) };
}

/**
 * Normaliza a saída (crua e não confiável) da IA para `PropostaExtraida`.
 * Nunca lança: entrada inválida vira campos null / lista vazia.
 * Uma única "opção" não é alternativa: vira lista vazia (o valor fica em `valor`).
 */
export function normalizarExtracao(raw: unknown): PropostaExtraida {
  const o = (typeof raw === 'object' && raw !== null ? raw : {}) as Record<string, unknown>;
  const itensRaw = Array.isArray(o.itens) ? o.itens : [];
  const itens = itensRaw
    .slice(0, MAX_ITENS)
    .map(item)
    .filter((i): i is ItemExtraido => i !== null);
  const opcoesRaw = Array.isArray(o.opcoes) ? o.opcoes : [];
  let opcoes = opcoesRaw
    .slice(0, MAX_OPCOES)
    .map(opcao)
    .filter((x): x is OpcaoExtraida => x !== null);
  if (opcoes.length < 2) opcoes = [];
  return {
    fornecedor: texto(o.fornecedor),
    valor: numero(o.valor) ?? opcoes[0]?.valor ?? null,
    prazo_dias: inteiroPositivo(o.prazo_dias),
    condicao_pagamento: texto(o.condicao_pagamento),
    garantia: texto(o.garantia),
    itens,
    opcoes,
    observacoes: texto(o.observacoes),
  };
}

/** Soma dos totais dos itens, quando todos têm total (apoio à conferência). */
export function somaItens(itens: readonly ItemExtraido[]): number | null {
  if (itens.length === 0) return null;
  let soma = 0;
  for (const it of itens) {
    if (it.total === null) return null;
    soma += it.total;
  }
  return soma;
}
