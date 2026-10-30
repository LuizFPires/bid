import type { VercelRequest, VercelResponse } from '@vercel/node';
import { createClient } from '@supabase/supabase-js';

/** Diagnóstico: importa SÓ @supabase/supabase-js. 200 = o SDK carrega. */
export default function handler(_req: VercelRequest, res: VercelResponse) {
  res.status(200).json({ dep: 'supabase', ok: typeof createClient === 'function', marker: 'diag3' });
}
