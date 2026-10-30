import type { VercelRequest, VercelResponse } from '@vercel/node';

/** Importa @bid/server dinamicamente para CAPTURAR o erro de carga (que senão
 *  derruba a função antes do handler). Devolve a mensagem para diagnóstico. */
export default async function handler(_req: VercelRequest, res: VercelResponse) {
  try {
    const srv = await import('@bid/server');
    res.status(200).json({ ok: typeof srv.requireMethod === 'function', marker: 'srv1' });
  } catch (e) {
    res.status(500).json({
      erro: e instanceof Error ? e.message : String(e),
      stack: e instanceof Error ? (e.stack ?? '').slice(0, 600) : '',
    });
  }
}
