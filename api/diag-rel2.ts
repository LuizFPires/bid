import type { VercelRequest, VercelResponse } from '@vercel/node';
import { marca } from '../srvlib/helper';

/** Diagnóstico: importa um módulo de /srvlib (fora de /api, sem prefixo _). */
export default function handler(_req: VercelRequest, res: VercelResponse) {
  res.status(200).json({ dep: 'srvlib', ok: marca() === 'srv-ok', marker: 'v7' });
}
