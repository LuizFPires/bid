import type { VercelRequest, VercelResponse } from '@vercel/node';
import { MissingEnvError, bearer, carregarContratoV2, preencherDocx, renderContratoV2Pdf, requireMethod, resolverEHash, serviceClient, sha256Hex, userClient } from '@bid/server';

/**
 * POST /api/contracts/emitir { contratoId }
 * Emissão (RC-09/11/12/13): só dono/gestor (checado com o JWT do usuário), só
 * contrato `aprovado`; gera a versão FINAL (.docx sem destaques + PDF do mesmo
 * documento, com data e local de assinatura), grava em
 * contratos/{org}/{id}/emitido.docx|pdf, e chama `emitir_contrato`
 * (service_role), que confere a aprovação vigente do hash e atribui o número.
 * Marcador vazio → recusa (RC-09).
 */
export default async function handler(req: VercelRequest, res: VercelResponse) {
  try {
    await processar(req, res);
  } catch (e) {
    console.error('contracts/emitir crash:', e);
    if (!res.headersSent) res.status(502).json({ erro: 'Não foi possível emitir o contrato.' });
  }
}

async function processar(req: VercelRequest, res: VercelResponse) {
  if (!requireMethod(req, res, 'POST')) return;
  const token = bearer(req);
  if (!token) return void res.status(401).json({ erro: 'Não autenticado.' });
  const contratoId = (req.body as { contratoId?: unknown } | null)?.contratoId;
  if (typeof contratoId !== 'string' || !contratoId) return void res.status(400).json({ erro: 'Informe o contrato.' });

  const sb = userClient(token);
  const { data: userData } = await sb.auth.getUser();
  const userId = userData.user?.id ?? null;
  if (!userId) return void res.status(401).json({ erro: 'Sessão inválida.' });
  const { data: gerencia } = await sb.rpc('gerencia_contrato', { p_contrato: contratoId });
  if (gerencia !== true) return void res.status(403).json({ erro: 'Só o dono ou um gestor da obra pode emitir o contrato.' });

  const c = await carregarContratoV2(sb, contratoId);
  if (!c) return void res.status(404).json({ erro: 'Contrato não encontrado.' });
  if (c.status !== 'aprovado') return void res.status(409).json({ erro: 'Só contrato aprovado é emitido.' });
  if (!c.catalogo) return void res.status(409).json({ erro: 'O modelo da minuta não tem catálogo carregado.' });
  if (!c.docxPath.startsWith(`${c.orgId}/`) || c.docxPath.includes('..')) return void res.status(409).json({ erro: 'Modelo da minuta com caminho inválido.' });

  // Versão final: data de hoje e local = foro/cidade da obra; ass_* não entram no hash.
  const { doc, hash } = await resolverEHash(c, { final: true, emissao: { data: new Date(), local: c.parametros.obra_foro || c.obraCidade || null } });
  if (hash !== c.conteudoHash) return void res.status(409).json({ erro: 'O conteúdo mudou depois da aprovação. Gere a minuta e valide de novo.' });

  let svc;
  try {
    svc = serviceClient();
  } catch (e) {
    if (e instanceof MissingEnvError) return void res.status(503).json({ erro: 'Emissão não configurada no servidor.' });
    throw e;
  }
  const { data: modeloBlob } = await svc.storage.from('modelos').download(c.docxPath);
  if (!modeloBlob) return void res.status(503).json({ erro: 'Modelo da minuta não encontrado no servidor.' });
  const modelo = new Uint8Array(await modeloBlob.arrayBuffer());
  let logo: Uint8Array | null = null;
  if (c.partes.construtora?.marca === 'ampla') {
    const { data: l } = await svc.storage.from('modelos').download(`${c.orgId}/logo-ampla.png`);
    if (l) logo = new Uint8Array(await l.arrayBuffer());
  }

  const { docx, faltando } = preencherDocx(modelo, doc, { logo });
  if (faltando.length) return void res.status(409).json({ erro: `Não se emite com marcador vazio: ${faltando.slice(0, 6).join(', ')}${faltando.length > 6 ? '…' : ''}.`, faltando });
  const { buffer: pdf, paginas } = await renderContratoV2Pdf(doc, { catalogo: c.catalogo, logoPng: logo });
  const pdfBytes = new Uint8Array(pdf);

  // Caminhos por hash e sem sobrescrita: duas emissões concorrentes nunca trocam
  // os bytes de um arquivo cujo hash já foi gravado pela RPC.
  const base = `${c.orgId}/${c.id}`;
  const docxHash = sha256Hex(docx);
  const pdfHash = sha256Hex(pdfBytes);
  const docxPath = `${base}/emitido-${docxHash.slice(0, 16)}.docx`;
  const pdfPath = `${base}/emitido-${pdfHash.slice(0, 16)}.pdf`;
  const u1 = await svc.storage.from('contratos').upload(docxPath, docx, { upsert: false, contentType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' });
  if (u1.error) return void res.status(502).json({ erro: 'Não foi possível gravar o .docx emitido.' });
  const u2 = await svc.storage.from('contratos').upload(pdfPath, pdfBytes, { upsert: false, contentType: 'application/pdf' });
  if (u2.error) return void res.status(502).json({ erro: 'Não foi possível gravar o PDF emitido.' });

  const { data: numero, error: eErr } = await svc.rpc('emitir_contrato', {
    p_contrato: c.id,
    p_docx_path: docxPath,
    p_docx_hash: docxHash,
    p_pdf_path: pdfPath,
    p_pdf_hash: pdfHash,
    p_paginas: paginas,
    p_emitido_por: userId,
  });
  if (eErr) {
    console.error('emitir_contrato falhou', eErr);
    await svc.storage.from('contratos').remove([docxPath, pdfPath]);
    return void res.status(409).json({ erro: eErr.message.includes('aprovação') ? 'A aprovação não corresponde ao conteúdo atual: valide de novo.' : 'Não foi possível emitir o contrato.' });
  }
  res.status(200).json({ numero: numero as string, paginas });
}
