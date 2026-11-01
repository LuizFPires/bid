import type { VercelRequest, VercelResponse } from '@vercel/node';
import { MissingEnvError, bearer, serviceClient, userClient } from '@bid/server';

/**
 * GET /api/contracts/download?id=…&formato=docx|pdf
 * URL assinada (60 s) do arquivo EMITIDO (ou do PDF já assinado). Autorização
 * pela RLS (o contrato precisa ser visível ao usuário); o caminho é o gravado
 * pelo servidor na emissão, dentro da pasta da organização.
 */
export default async function handler(req: VercelRequest, res: VercelResponse) {
  try {
    if (req.method !== 'GET') return void res.status(405).json({ erro: 'Método não permitido.' });
    const token = bearer(req);
    if (!token) return void res.status(401).json({ erro: 'Não autenticado.' });
    const id = typeof req.query.id === 'string' ? req.query.id : '';
    const formato = req.query.formato === 'docx' ? 'docx' : 'pdf';
    if (!id) return void res.status(400).json({ erro: 'Informe o contrato.' });

    const sb = userClient(token);
    const { data } = await sb.from('contratos').select('id, org_id, numero, status, docx_path, pdf_path, categoria').eq('id', id).is('deleted_at', null).maybeSingle();
    const c = data as { id: string; org_id: string; numero: string | null; status: string; docx_path: string | null; pdf_path: string | null; categoria: string } | null;
    if (!c) return void res.status(404).json({ erro: 'Contrato não encontrado.' });
    if (!['emitido', 'enviado', 'assinado', 'cancelado'].includes(c.status)) return void res.status(409).json({ erro: 'Contrato ainda não emitido: baixe a minuta.' });
    const path = formato === 'docx' ? c.docx_path : c.pdf_path;
    if (!path || !path.startsWith(`${c.org_id}/`) || path.includes('..')) return void res.status(404).json({ erro: 'Arquivo emitido não encontrado.' });

    let svc;
    try {
      svc = serviceClient();
    } catch (e) {
      if (e instanceof MissingEnvError) return void res.status(503).json({ erro: 'Download não configurado no servidor.' });
      throw e;
    }
    const nome = `${c.numero ?? 'Contrato'} - ${c.categoria}.${formato}`.replace(/[\\/:*?"<>|]+/g, '-');
    const { data: signed, error } = await svc.storage.from('contratos').createSignedUrl(path, 60, { download: nome });
    if (error || !signed) return void res.status(502).json({ erro: 'Não foi possível gerar o link de download.' });
    res.setHeader('Cache-Control', 'no-store');
    res.status(200).json({ url: signed.signedUrl, nome });
  } catch (e) {
    console.error('contracts/download crash:', e);
    if (!res.headersSent) res.status(502).json({ erro: 'Não foi possível baixar o arquivo.' });
  }
}
