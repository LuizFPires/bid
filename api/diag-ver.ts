import type { VercelRequest, VercelResponse } from '@vercel/node';

/** Marcador de versão do deploy (sem imports) — detecta quando o novo build sobe. */
export default function handler(_req: VercelRequest, res: VercelResponse) {
  res.status(200).json({ ver: 'v8' });
}
