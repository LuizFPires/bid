import Anthropic from '@anthropic-ai/sdk';
import {
  EQUALIZE_INPUT_SCHEMA,
  EQUALIZE_PROMPT,
  EQUALIZE_TOOL_NAME,
  EXTRACAO_INPUT_SCHEMA,
  EXTRACAO_PROMPT,
  EXTRACAO_TOOL_NAME,
  normalizarAnalise,
  normalizarExtracao,
  type AnaliseEqualizacao,
  type PropostaExtraida,
} from '@bid/core';
import { env } from './env';

/**
 * Extrai os dados de uma proposta a partir do PDF (base64), usando saída
 * estruturada por ferramenta forçada. A normalização/validação final é do
 * core (`normalizarExtracao`), então a saída é sempre segura.
 */
export async function extrairPropostaDePdf(pdfBase64: string): Promise<PropostaExtraida> {
  const client = new Anthropic({ apiKey: env.anthropicKey() });

  const msg = await client.messages.create({
    model: env.modelExtract(),
    max_tokens: 2048,
    tools: [
      {
        name: EXTRACAO_TOOL_NAME,
        description: 'Registra os dados estruturados extraídos da proposta de obra.',
        input_schema: EXTRACAO_INPUT_SCHEMA as unknown as Anthropic.Tool.InputSchema,
      },
    ],
    tool_choice: { type: 'tool', name: EXTRACAO_TOOL_NAME },
    messages: [
      {
        role: 'user',
        content: [
          { type: 'document', source: { type: 'base64', media_type: 'application/pdf', data: pdfBase64 } },
          { type: 'text', text: EXTRACAO_PROMPT },
        ],
      },
    ],
  });

  const bloco = msg.content.find((b) => b.type === 'tool_use');
  if (!bloco || bloco.type !== 'tool_use') {
    throw new Error('A IA não retornou dados estruturados.');
  }
  return normalizarExtracao(bloco.input);
}

export interface PropostaParaIA {
  id: string;
  fornecedor: string;
  valor: number | null;
  prazo: number | null;
  condicao_pagamento: string | null;
  garantia: string | null;
  itens: unknown;
}

/** Analisa um conjunto de propostas e devolve a recomendação (apoio). */
export async function analisarEqualizacao(propostas: PropostaParaIA[]): Promise<AnaliseEqualizacao> {
  const client = new Anthropic({ apiKey: env.anthropicKey() });
  const ids = propostas.map((p) => p.id);

  const msg = await client.messages.create({
    model: env.modelEqualize(),
    max_tokens: 2048,
    tools: [
      {
        name: EQUALIZE_TOOL_NAME,
        description: 'Registra a análise comparativa e a recomendação.',
        input_schema: EQUALIZE_INPUT_SCHEMA as unknown as Anthropic.Tool.InputSchema,
      },
    ],
    tool_choice: { type: 'tool', name: EQUALIZE_TOOL_NAME },
    messages: [
      {
        role: 'user',
        content: [
          { type: 'text', text: EQUALIZE_PROMPT },
          { type: 'text', text: `Propostas (JSON):\n${JSON.stringify(propostas)}` },
        ],
      },
    ],
  });

  const bloco = msg.content.find((b) => b.type === 'tool_use');
  if (!bloco || bloco.type !== 'tool_use') {
    throw new Error('A IA não retornou a análise.');
  }
  return normalizarAnalise(bloco.input, ids);
}
