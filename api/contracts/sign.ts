import type { VercelRequest, VercelResponse } from '@vercel/node';
import { MissingEnvError } from '@bid/server';
import { bearer, requireMethod } from '@bid/server';
import { serviceClient, userClient } from '@bid/server';
import { registrarAssinatura } from '@bid/server';
import type { Parte } from '@bid/server';

/**
 * POST /api/contracts/sign  (assinatura NO APP)
 * Entrada: { contratoId, parte, signatarioNome, pngBase64 }.
 * Autoriza pela sessão (membro da org, via RLS no load) e grava a assinatura +
 * trilha de forma AUTORITATIVA com service_role (o cliente não grava a trilha).
 */
function ipDe(req: VercelRequest): string | null {
  const xf = req.headers['x-forwarded-for'];
  if (typeof xf === 'string') return xf.split(',')[0]?.trim() ?? null;
  if (Array.isArray(xf)) return xf[0] ?? null;
  return null;
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (!requireMethod(req, res, 'POST')) return;

  const token = bearer(req);
  if (!token) {
    res.status(401).json({ erro: 'Não autenticado.' });
    return;
  }
  const body = (req.body ?? {}) as {
    contratoId?: unknown;
    parte?: unknown;
    signatarioNome?: unknown;
    pngBase64?: unknown;
  };
  const contratoId = typeof body.contratoId === 'string' ? body.contratoId : '';
  const nome = typeof body.signatarioNome === 'string' ? body.signatarioNome.trim() : '';
  const pngBase64 = typeof body.pngBase64 === 'string' ? body.pngBase64 : '';
  // No app, o usuário da org assina pela própria parte: a CONTRATANTE. A
  // CONTRATADA (fornecedor) assina pelo link externo. Impede forjar o fornecedor.
  const parte: Parte = 'contratante';
  if (body.parte && body.parte !== 'contratante') {
    res.status(403).json({ erro: 'No app só é possível assinar como contratante.' });
    return;
  }
  if (!contratoId || !pngBase64) {
    res.status(400).json({ erro: 'Dados de assinatura incompletos.' });
    return;
  }

  // Autorização: carrega o contrato NO CONTEXTO DO USUÁRIO (RLS → é membro).
  const sbUser = userClient(token);
  const { data: contrato, error: cErr } = await sbUser
    .from('contratos')
    .select('id, org_id, pdf_path')
    .eq('id', contratoId)
    .is('deleted_at', null)
    .maybeSingle();
  if (cErr || !contrato) {
    res.status(404).json({ erro: 'Contrato não encontrado.' });
    return;
  }
  const c = contrato as { id: string; org_id: string; pdf_path: string | null };
  if (!c.pdf_path) {
    res.status(400).json({ erro: 'Gere o PDF do contrato antes de assinar.' });
    return;
  }
  // Caminho derivado no servidor (não confia no valor armazenado — evita que um
  // pdf_path forjado faça o servidor escrever/ler em caminho arbitrário).
  const pdfPath = `${c.org_id}/contrato-${c.id}.pdf`;

  try {
    const sb = serviceClient(); // escrita autoritativa da trilha
    await registrarAssinatura(sb, {
      contratoId: c.id,
      orgId: c.org_id,
      pdfPath,
      parte,
      nome,
      via: 'app',
      pngBase64,
      ip: ipDe(req),
      userAgent: typeof req.headers['user-agent'] === 'string' ? req.headers['user-agent'] : null,
    });
    res.status(200).json({ ok: true });
  } catch (e) {
    if (e instanceof MissingEnvError) {
      res.status(503).json({ erro: 'Assinatura não configurada no servidor (falta service_role).' });
      return;
    }
    res.status(502).json({ erro: e instanceof Error ? e.message : 'Falha ao assinar.' });
  }
}
