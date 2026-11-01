import { createHash } from 'node:crypto';
import type { VercelRequest, VercelResponse } from '@vercel/node';
import { MissingEnvError } from '@bid/server';
import { serviceClient } from '@bid/server';
import { registrarAssinatura, registrarAssinaturaV2 } from '@bid/server';
import type { Parte, ParteV2 } from '@bid/server';

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

async function processar(req: VercelRequest, res: VercelResponse) {
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
    if (e instanceof MissingEnvError || (e instanceof Error && e.name === 'MissingEnvError')) {
      res.status(503).json({ erro: 'Assinatura por link ainda não configurada no servidor.' });
      return;
    }
    throw e;
  }

  const { data: ass, error: aErr } = await sb
    .from('assinaturas')
    .select('id, org_id, contrato_id, parte, signatario_nome, token_expira, assinado_em, signatario_id')
    .eq('token_hash', tokenHash)
    .maybeSingle();
  if (aErr || !ass) {
    res.status(404).json({ erro: 'Link inválido.' });
    return;
  }
  const a = ass as {
    id: string;
    org_id: string;
    contrato_id: string;
    parte: Parte;
    signatario_nome: string | null;
    token_expira: string | null;
    assinado_em: string | null;
    signatario_id: string | null;
  };
  if (a.assinado_em) {
    res.status(409).json({ erro: 'Este documento já foi assinado por esta parte.' });
    return;
  }
  if (a.token_expira && new Date(a.token_expira).getTime() < Date.now()) {
    res.status(410).json({ erro: 'Link expirado.' });
    return;
  }

  if (a.signatario_id) return assinarV2(req, res, sb, tokenHash, { ...a, signatario_id: a.signatario_id });

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

  // Reivindica o token ATOMICAMENTE (uso único): só prossegue se esta chamada
  // for a que zerou o token_hash. Evita corrida de duplo uso.
  const { data: claim } = await sb
    .from('assinaturas')
    .update({ token_hash: null })
    .eq('token_hash', tokenHash)
    .is('assinado_em', null)
    .gt('token_expira', new Date().toISOString())
    .select('id')
    .maybeSingle();
  if (!claim) {
    res.status(409).json({ erro: 'Link já utilizado ou expirado.' });
    return;
  }

  // Caminho derivado no servidor (não confia no valor armazenado).
  const pdfPath = `${a.org_id}/contrato-${c.id}.pdf`;

  try {
    await registrarAssinatura(sb, {
      contratoId: c.id,
      orgId: a.org_id,
      pdfPath,
      parte: a.parte,
      nome,
      via: 'link',
      pngBase64,
      ip: ipDe(req),
      userAgent: typeof req.headers['user-agent'] === 'string' ? req.headers['user-agent'] : null,
    });
    res.status(200).json({ ok: true });
  } catch (e) {
    // Falha transitória: devolve o token (reivindicado antes) para o link não
    // morrer permanentemente — só é invalidado de fato ao assinar com sucesso.
    await sb
      .from('assinaturas')
      .update({ token_hash: tokenHash })
      .eq('id', (claim as { id: string }).id)
      .is('assinado_em', null);
    res.status(502).json({ erro: e instanceof Error ? e.message : 'Falha ao assinar.' });
  }
}

/**
 * v2 (M13): link por SIGNATÁRIO de contrato emitido. GET mostra só número,
 * partes, valor e um link curto do PDF (SPEC §11); POST assina com a cadeia de
 * hashes a partir do pdf_hash da emissão (RC-13).
 */
async function assinarV2(
  req: VercelRequest,
  res: VercelResponse,
  sb: ReturnType<typeof serviceClient>,
  tokenHash: string,
  a: { id: string; org_id: string; contrato_id: string; parte: Parte | ParteV2; signatario_nome: string | null; token_expira: string | null; signatario_id: string },
) {
  const { data: k } = await sb
    .from('contratos')
    .select('id, numero, status, categoria, valor, pdf_path, pdf_hash, partes, obras ( nome )')
    .eq('id', a.contrato_id)
    .is('deleted_at', null)
    .maybeSingle();
  const c = k as { id: string; numero: string | null; status: string; categoria: string; valor: number | null; pdf_path: string | null; pdf_hash: string | null; partes: { contratante?: { razao_social: string } | null; contratada?: { razao_social: string } | null; construtora?: { razao_social: string } | null } | null; obras: { nome: string } | { nome: string }[] | null } | null;
  if (!c) return void res.status(404).json({ erro: 'Contrato não encontrado.' });
  if (!['emitido', 'enviado'].includes(c.status)) return void res.status(409).json({ erro: c.status === 'assinado' ? 'Este contrato já está assinado por todas as partes.' : 'Este contrato não está disponível para assinatura.' });
  const obraNome = Array.isArray(c.obras) ? (c.obras[0]?.nome ?? '') : (c.obras?.nome ?? '');
  const pdfPath = c.pdf_path && c.pdf_path.startsWith(`${a.org_id}/${c.id}/`) ? c.pdf_path : null;
  if (!pdfPath) return void res.status(409).json({ erro: 'PDF emitido não encontrado.' });

  if (req.method === 'GET') {
    const { data: signed } = await sb.storage.from('contratos').createSignedUrl(pdfPath, 300);
    res.status(200).json({
      v2: true,
      numero: c.numero,
      categoria: c.categoria,
      obra: obraNome,
      valor: c.valor,
      parte: a.parte,
      signatario: a.signatario_nome,
      partes: { contratante: c.partes?.contratante?.razao_social ?? null, contratada: c.partes?.contratada?.razao_social ?? null, construtora: c.partes?.construtora?.razao_social ?? null },
      pdfUrl: signed?.signedUrl ?? null,
    });
    return;
  }
  const body = (req.body ?? {}) as { pngBase64?: unknown };
  const pngBase64 = typeof body.pngBase64 === 'string' ? body.pngBase64 : '';
  if (!pngBase64) return void res.status(400).json({ erro: 'Assinatura ausente.' });

  const { data: claim } = await sb.from('assinaturas').update({ token_hash: null }).eq('token_hash', tokenHash).is('assinado_em', null).gt('token_expira', new Date().toISOString()).select('id').maybeSingle();
  if (!claim) return void res.status(409).json({ erro: 'Link já utilizado ou expirado.' });
  try {
    const r = await registrarAssinaturaV2(sb, {
      contratoId: c.id,
      orgId: a.org_id,
      pdfPath,
      signatarioId: a.signatario_id,
      parte: a.parte as ParteV2,
      nome: a.signatario_nome ?? '',
      via: 'link',
      coletadoPor: null,
      pngBase64,
      ip: ipDe(req),
      userAgent: typeof req.headers['user-agent'] === 'string' ? req.headers['user-agent'] : null,
    });
    res.status(200).json({ ok: true, assinado: r.assinado });
  } catch (e) {
    await sb.from('assinaturas').update({ token_hash: tokenHash }).eq('id', (claim as { id: string }).id).is('assinado_em', null);
    res.status(502).json({ erro: e instanceof Error ? e.message : 'Falha ao assinar.' });
  }
}

/**
 * Blindagem: qualquer exceção não prevista (rede, Supabase, etc.) vira um erro
 * limpo em JSON — nunca um FUNCTION_INVOCATION_FAILED. Não vaza stack ao cliente;
 * registra no servidor para diagnóstico.
 */
export default async function handler(req: VercelRequest, res: VercelResponse) {
  try {
    await processar(req, res);
  } catch (e) {
    console.error('sign/[token] erro não tratado:', e);
    if (!res.headersSent) {
      res.status(500).json({ erro: 'Não foi possível processar o link de assinatura.' });
    }
  }
}
