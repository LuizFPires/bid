import type { VercelRequest, VercelResponse } from '@vercel/node';
import Anthropic from '@anthropic-ai/sdk';

/** Diagnóstico: importa SÓ @anthropic-ai/sdk. 200 = o SDK carrega. */
export default function handler(_req: VercelRequest, res: VercelResponse) {
  res.status(200).json({ dep: 'anthropic', ok: typeof Anthropic === 'function', marker: 'diag3' });
}
