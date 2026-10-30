import { createHash } from 'node:crypto';
import type { VercelRequest, VercelResponse } from '@vercel/node';
import { MissingEnvError } from '../_lib/env';
import { serviceClient } from '../_lib/supabase';
import { registrarAssinatura } from '../_lib/assinar';
import type { Parte } from '../_lib/assinatura-pdf';

/**
 * /api/sign/:token  (assinatura por LINK externo — signatário SEM login)
 * GET  → resumo do documento para a página de assinatura.
 * POST → aplica a assinatura e registra a trilha.
 *
 * Sem sessão de usuário, não há RLS a aplicar: roda com service_role. Fica
 * INATIVO (503) até a SUPABASE_SERVICE_ROLE_KEY ser provisionada. Token de uso
 * único, com expiração; invalidado ao assinar.
 */
function ipDe(req: VercelRequest): string | null {
  const xf = req.headers['x-forwarded-for'];
  if (typeof xf === 'string') return xf.split(',')[0]?.trim() ?? null;
  if (Array.isArray(xf)) return xf[0] ?? null;
  return null;
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'GET' && req.method !== 'POST') {
    res.status(405).json({ erro: 'Método não permitido.' });
    return;
  }
  const raw = req.query.token;
  const tokenClaro = typeof raw === 'string' ? raw : Array.isArray(raw) ? raw[0] : '';
  if (!tokenClaro) {
    res.status(400).json({ erro: 'Token ausente.' });
    return;
  }
  const tokenHash = createHash('sha256').update(tokenClaro).digest('hex');

  let sb;
  try {
    sb = serviceClient();
  } catch (e) {
    if (e instanceof MissingEnvError) {
      res.status(503).json({ erro: 'Assinatura por link ainda não configurada no servidor.' });
      return;
    }
    throw e;
  }

  const { data: ass, error: aErr } = await sb
    .from('assinaturas')
    .select('id, org_id, contrato_id, parte, signatario_nome, token_expira, assinado_em')
    .eq('token_hash', tokenHash)
    .maybeSingle();
  if (aErr || !ass) {
    res.status(404).json({ erro: 'Link inválido.' });
    return;
  }
  const a = ass as {
    org_id: string;
    contrato_id: string;
    parte: Parte;
    signatario_nome: string | null;
    token_expira: string | null;
    assinado_em: string | null;
  };
  if (a.assinado_em) {
    res.status(409).json({ erro: 'Este documento já foi assinado por esta parte.' });
    return;
  }
  if (a.token_expira && new Date(a.token_expira).getTime() < Date.now()) {
    res.status(410).json({ erro: 'Link expirado.' });
    return;
  }

  const { data: contrato, error: cErr } = await sb
    .from('contratos')
    .select('id, pdf_path, categoria, valor, obras ( nome )')
    .eq('id', a.contrato_id)
    .is('deleted_at', null)
    .maybeSingle();
  if (cErr || !contrato) {
    res.status(404).json({ erro: 'Contrato não encontrado.' });
    return;
  }
  const c = contrato as {
    id: string;
    pdf_path: string | null;
    categoria: string;
    valor: number | null;
    obras: { nome: string } | { nome: string }[] | null;
  };
  const obraNome = Array.isArray(c.obras) ? (c.obras[0]?.nome ?? '') : (c.obras?.nome ?? '');

  if (req.method === 'GET') {
    res.status(200).json({
      categoria: c.categoria,
      obra: obraNome,
      valor: c.valor,
      parte: a.parte,
      signatario: a.signatario_nome,
    });
    return;
  }

  // POST — assinar.
  if (!c.pdf_path) {
    res.status(400).json({ erro: 'O contrato ainda não tem PDF para assinar.' });
    return;
  }
  const body = (req.body ?? {}) as { pngBase64?: unknown; signatarioNome?: unknown };
  const pngBase64 = typeof body.pngBase64 === 'string' ? body.pngBase64 : '';
  const nome = typeof body.signatarioNome === 'string' && body.signatarioNome.trim()
    ? body.signatarioNome.trim()
    : (a.signatario_nome ?? '');
  if (!pngBase64) {
    res.status(400).json({ erro: 'Assinatura ausente.' });
    return;
  }

  try {
    await registrarAssinatura(sb, {
      contratoId: c.id,
      orgId: a.org_id,
      pdfPath: c.pdf_path,
      parte: a.parte,
      nome,
      via: 'link',
      pngBase64,
      ip: ipDe(req),
      userAgent: typeof req.headers['user-agent'] === 'string' ? req.headers['user-agent'] : null,
    });
    res.status(200).json({ ok: true });
  } catch (e) {
    res.status(502).json({ erro: e instanceof Error ? e.message : 'Falha ao assinar.' });
  }
}
