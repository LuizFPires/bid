import type { VercelRequest, VercelResponse } from '@vercel/node';

/** GET /api/health — sonda de diagnóstico (sem dependências de workspace). */
export default function handler(_req: VercelRequest, res: VercelResponse) {
  res.status(200).json({ ok: true, ts: Date.now() });
}
