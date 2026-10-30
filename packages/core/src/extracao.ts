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

/** Dados que a IA extrai do arquivo da proposta (antes da conferência). */
export interface PropostaExtraida {
  fornecedor: string | null;
  /** valor total da proposta, em reais. */
  valor: number | null;
  prazo_dias: number | null;
  condicao_pagamento: string | null;
  garantia: string | null;
  itens: ItemExtraido[];
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
    observacoes: { type: ['string', 'null'], description: 'Observações relevantes, exclusões ou ressalvas.' },
  },
  required: ['fornecedor', 'valor', 'prazo_dias', 'condicao_pagamento', 'garantia', 'itens', 'observacoes'],
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
  '',
  'Responda SOMENTE chamando a ferramenta registrar_proposta com os dados. Não',
  'escreva texto fora da ferramenta.',
].join('\n');

const MAX_TEXTO = 2000;
const MAX_ITENS = 200;

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

/**
 * Normaliza a saída (crua e não confiável) da IA para `PropostaExtraida`.
 * Nunca lança: entrada inválida vira campos null / lista vazia.
 */
export function normalizarExtracao(raw: unknown): PropostaExtraida {
  const o = (typeof raw === 'object' && raw !== null ? raw : {}) as Record<string, unknown>;
  const itensRaw = Array.isArray(o.itens) ? o.itens : [];
  const itens = itensRaw
    .slice(0, MAX_ITENS)
    .map(item)
    .filter((i): i is ItemExtraido => i !== null);
  return {
    fornecedor: texto(o.fornecedor),
    valor: numero(o.valor),
    prazo_dias: inteiroPositivo(o.prazo_dias),
    condicao_pagamento: texto(o.condicao_pagamento),
    garantia: texto(o.garantia),
    itens,
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
