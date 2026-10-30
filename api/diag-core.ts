import type { VercelRequest, VercelResponse } from '@vercel/node';
import { ambasPartesAssinaram } from '@bid/core';

/** Diagnóstico: importa SÓ @bid/core. 200 = core carrega em runtime. */
export default function handler(_req: VercelRequest, res: VercelResponse) {
  res.status(200).json({ dep: 'core', ok: ambasPartesAssinaram([]) === false, marker: 'diag3' });
}
