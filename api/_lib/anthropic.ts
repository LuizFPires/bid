import Anthropic from '@anthropic-ai/sdk';
import {
  EXTRACAO_INPUT_SCHEMA,
  EXTRACAO_PROMPT,
  EXTRACAO_TOOL_NAME,
  normalizarExtracao,
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
