import { naoImplementado } from '../../src/respond';

/**
 * POST /api/ai/extract-proposal
 * Entrada: arquivo (PDF/planilha) + obra + categoria.
 * Saída: JSON estruturado { fornecedor, valor, prazo_dias, condicao_pagamento,
 * garantia, itens[], observacoes } — lido pela Anthropic (bloco document),
 * SEMPRE no servidor. Implementado no M2.
 */
export default naoImplementado('ai/extract-proposal', 'M2');
