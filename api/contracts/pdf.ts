import type { VercelRequest, VercelResponse } from '@vercel/node';
import { formatBRL } from '@bid/core';
import { bearer, requireMethod } from '../_lib/respond';
import { renderContratoPdf } from '../_lib/pdf';
import { userClient } from '../_lib/supabase';

/**
 * POST /api/contracts/pdf
 * Entrada: { id } — id do contrato.
 * Ação: carrega contrato + cláusulas (RLS, user-scoped), renderiza o PDF
 * (@react-pdf), faz upload ao bucket privado `contratos` na pasta do usuário e
 * grava `pdf_path`/`paginas`. Não usa service_role.
 */
export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (!requireMethod(req, res, 'POST')) return;

  const token = bearer(req);
  if (!token) {
    res.status(401).json({ erro: 'Não autenticado.' });
    return;
  }
  const id = (req.body as { id?: unknown } | null)?.id;
  if (typeof id !== 'string' || !id) {
    res.status(400).json({ erro: 'Informe o id do contrato.' });
    return;
  }

  const sb = userClient(token);
  const { data: userData, error: userErr } = await sb.auth.getUser();
  if (userErr || !userData.user) {
    res.status(401).json({ erro: 'Sessão inválida.' });
    return;
  }

  const { data: contrato, error: cErr } = await sb
    .from('contratos')
    .select('id, org_id, categoria, valor, obras ( nome ), contrato_clausulas ( numero, titulo, texto )')
    .eq('id', id)
    .is('deleted_at', null)
    .maybeSingle();
  if (cErr || !contrato) {
    res.status(404).json({ erro: 'Contrato não encontrado.' });
    return;
  }

  const c = contrato as unknown as {
    id: string;
    org_id: string;
    categoria: string;
    valor: number | null;
    obras: { nome: string } | { nome: string }[] | null;
    contrato_clausulas: { numero: number; titulo: string; texto: string }[] | null;
  };
  const obraNome = Array.isArray(c.obras) ? (c.obras[0]?.nome ?? '') : (c.obras?.nome ?? '');
  const clausulas = [...(c.contrato_clausulas ?? [])].sort((a, b) => a.numero - b.numero);
  if (clausulas.length === 0) {
    res.status(400).json({ erro: 'Contrato sem cláusulas para gerar o PDF.' });
    return;
  }

  let buffer: Buffer;
  let paginas: number;
  try {
    ({ buffer, paginas } = await renderContratoPdf({
      obra: obraNome,
      categoria: c.categoria,
      contratada: '', // identidade das partes entra no M7 (assinatura)
      valor: c.valor != null ? formatBRL(c.valor) : 'a definir',
      clausulas,
    }));
  } catch {
    res.status(502).json({ erro: 'Falha ao renderizar o PDF.' });
    return;
  }

  const path = `${c.org_id}/${userData.user.id}/contrato-${c.id}.pdf`;
  const { error: upErr } = await sb.storage
    .from('contratos')
    .upload(path, buffer, { upsert: true, contentType: 'application/pdf' });
  if (upErr) {
    res.status(502).json({ erro: 'Falha ao salvar o PDF no Storage.' });
    return;
  }

  const { error: updErr } = await sb
    .from('contratos')
    .update({ pdf_path: path, paginas })
    .eq('id', c.id);
  if (updErr) {
    res.status(502).json({ erro: 'PDF gerado, mas falhou ao registrar.' });
    return;
  }

  res.status(200).json({ pdf_path: path, paginas });
}
