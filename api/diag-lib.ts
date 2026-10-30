import type { VercelRequest, VercelResponse } from '@vercel/node';
import { requireMethod } from './_lib/respond';

/** Diagnóstico: importa um módulo de ../_lib (código compartilhado). */
export default function handler(_req: VercelRequest, res: VercelResponse) {
  res.status(200).json({ dep: 'lib', ok: typeof requireMethod === 'function', marker: 'v6' });
}
