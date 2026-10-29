import type { VercelRequest, VercelResponse } from '@vercel/node';
import { extrairPropostaDePdf } from '../_lib/anthropic';
import { MissingEnvError } from '../_lib/env';
import { bearer, requireMethod } from '../_lib/respond';
import { userClient } from '../_lib/supabase';

/**
 * POST /api/ai/extract-proposal
 * Entrada: { path } — caminho do PDF já enviado ao bucket privado `propostas`.
 * Saída: { dados } — PropostaExtraida para CONFERÊNCIA (não grava nada).
 *
 * Segurança: exige Bearer do usuário; a URL assinada é criada no contexto do
 * usuário (RLS), então só funciona para arquivos que ele mesmo pode ler. O
 * caminho precisa estar na pasta do usuário (`{org}/{user}/…`). A IA roda só
 * no servidor.
 */
const MAX_BYTES = 8 * 1024 * 1024; // 8 MB

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (!requireMethod(req, res, 'POST')) return;

  const token = bearer(req);
  if (!token) {
    res.status(401).json({ erro: 'Não autenticado.' });
    return;
  }

  const path = (req.body as { path?: unknown } | null)?.path;
  if (typeof path !== 'string' || !path.trim()) {
    res.status(400).json({ erro: 'Informe o caminho do arquivo (path).' });
    return;
  }

  const sb = userClient(token);
  const { data: userData, error: userErr } = await sb.auth.getUser();
  if (userErr || !userData.user) {
    res.status(401).json({ erro: 'Sessão inválida.' });
    return;
  }

  // O arquivo precisa estar na pasta do próprio usuário: {org_id}/{user_id}/...
  const partes = path.split('/');
  if (partes[1] !== userData.user.id) {
    res.status(403).json({ erro: 'Arquivo fora da pasta do usuário.' });
    return;
  }

  const { data: signed, error: signErr } = await sb.storage
    .from('propostas')
    .createSignedUrl(path, 60);
  if (signErr || !signed) {
    res.status(404).json({ erro: 'Arquivo não encontrado ou sem acesso.' });
    return;
  }

  const resp = await fetch(signed.signedUrl);
  if (!resp.ok) {
    res.status(502).json({ erro: 'Falha ao ler o arquivo do Storage.' });
    return;
  }
  const buf = Buffer.from(await resp.arrayBuffer());
  if (buf.byteLength > MAX_BYTES) {
    res.status(413).json({ erro: 'Arquivo grande demais para extração (máx. 8 MB).' });
    return;
  }

  try {
    const dados = await extrairPropostaDePdf(buf.toString('base64'));
    res.status(200).json({ dados });
  } catch (e) {
    if (e instanceof MissingEnvError) {
      res.status(503).json({ erro: 'Extração por IA não configurada no servidor.' });
      return;
    }
    res.status(502).json({ erro: 'Não foi possível extrair os dados da proposta.' });
  }
}
