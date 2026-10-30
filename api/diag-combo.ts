import type { VercelRequest, VercelResponse } from '@vercel/node';
import { normalizarExtracao } from '@bid/core';
import Anthropic from '@anthropic-ai/sdk';
import { createClient } from '@supabase/supabase-js';

/** Diagnóstico: combina os 3 SDKs direto (sem _lib). */
export default function handler(_req: VercelRequest, res: VercelResponse) {
  const ok =
    typeof normalizarExtracao === 'function' &&
    typeof Anthropic === 'function' &&
    typeof createClient === 'function';
  res.status(200).json({ dep: 'combo', ok, marker: 'v6' });
}
