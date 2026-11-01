import type { VercelRequest, VercelResponse } from '@vercel/node';
import { MissingEnvError } from '@bid/server';
import { bearer, requireMethod } from '@bid/server';
import { serviceClient, userClient } from '@bid/server';
import { registrarAssinatura, registrarAssinaturaV2 } from '@bid/server';
import type { Parte, ParteV2 } from '@bid/server';

/**
 * POST /api/contracts/sign  (assinatura NO APP)
 * Legado: { contratoId, parte, signatarioNome, pngBase64 } — a org assina como contratante.
 * v2 (M13): { contratoId, signatarioId, pngBase64 } — dono/gestor COLETA
 * presencialmente a assinatura de qualquer signatário do contrato emitido
 * (`coletado_por` na trilha).
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
    signatarioId?: unknown;
    pngBase64?: unknown;
  };
  const contratoId = typeof body.contratoId === 'string' ? body.contratoId : '';
  const nome = typeof body.signatarioNome === 'string' ? body.signatarioNome.trim() : '';
  const pngBase64 = typeof body.pngBase64 === 'string' ? body.pngBase64 : '';
  if (typeof body.signatarioId === 'string' && body.signatarioId) {
    return coletarV2(req, res, token, contratoId, body.signatarioId, pngBase64);
  }
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

/** v2: coleta presencial por dono/gestor; signatário pertence ao contrato emitido/enviado. */
async function coletarV2(req: VercelRequest, res: VercelResponse, token: string, contratoId: string, signatarioId: string, pngBase64: string) {
  if (!contratoId || !pngBase64) return void res.status(400).json({ erro: 'Dados de assinatura incompletos.' });
  const sbUser = userClient(token);
  const { data: userData } = await sbUser.auth.getUser();
  const userId = userData.user?.id ?? null;
  if (!userId) return void res.status(401).json({ erro: 'Sessão inválida.' });
  const { data: gerencia } = await sbUser.rpc('gerencia_contrato', { p_contrato: contratoId });
  if (gerencia !== true) return void res.status(403).json({ erro: 'Só o dono ou um gestor da obra coleta assinaturas no app.' });
  const { data: k } = await sbUser.from('contratos').select('id, org_id, status, pdf_path, pdf_hash, modelo_id, contrato_signatarios ( id, parte, nome )').eq('id', contratoId).is('deleted_at', null).maybeSingle();
  const c = k as { id: string; org_id: string; status: string; pdf_path: string | null; pdf_hash: string | null; modelo_id: string | null; contrato_signatarios: { id: string; parte: ParteV2; nome: string }[] | null } | null;
  if (!c || !c.modelo_id) return void res.status(404).json({ erro: 'Contrato não encontrado.' });
  if (!['emitido', 'enviado'].includes(c.status)) return void res.status(409).json({ erro: 'Só contrato emitido recebe assinaturas.' });
  const sig = (c.contrato_signatarios ?? []).find((s) => s.id === signatarioId);
  if (!sig) return void res.status(404).json({ erro: 'Signatário não encontrado neste contrato.' });
  const pdfPath = `${c.org_id}/${c.id}/emitido.pdf`;
  try {
    const sb = serviceClient();
    const r = await registrarAssinaturaV2(sb, {
      contratoId: c.id,
      orgId: c.org_id,
      pdfPath,
      pdfHashEmissao: c.pdf_hash,
      signatarioId: sig.id,
      parte: sig.parte,
      nome: sig.nome,
      via: 'app',
      coletadoPor: userId,
      pngBase64,
      ip: ipDe(req),
      userAgent: typeof req.headers['user-agent'] === 'string' ? req.headers['user-agent'] : null,
    });
    res.status(200).json({ ok: true, assinado: r.assinado });
  } catch (e) {
    if (e instanceof MissingEnvError) return void res.status(503).json({ erro: 'Assinatura não configurada no servidor (falta service_role).' });
    res.status(502).json({ erro: e instanceof Error ? e.message : 'Falha ao assinar.' });
  }
}
