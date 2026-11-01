import type { VercelRequest, VercelResponse } from '@vercel/node';
import { camposVaziosDoDocumento } from '@bid/core';
import { MissingEnvError, anexarPropostaAoPdf, bearer, hashDaPropostaSeAnexo, carregarContratoV2, documentXmlDoDocx, gravarHashConteudo, marcadoresSimples, preencherDocx, renderContratoV2Pdf, requireMethod, resolverEHash, serviceClient, userClient } from '@bid/server';

/**
 * POST /api/contracts/preview  { contratoId, formato: 'docx' | 'pdf' | 'hash' }
 * Resolve o contrato v2 (core), calcula o hash do conteúdo e gera a MINUTA
 * (.docx preenchido pelo motor ou PDF do mesmo documento) com aviso vermelho e
 * destaques. Grava `conteudo_hash` e a coluna `faltando` (service_role) —
 * o envio para validação compara com esse hash e recusa marcador vazio (RC-09).
 * `formato: 'hash'` só calcula e grava (sem arquivo). Nada é gravado em storage.
 */
export default async function handler(req: VercelRequest, res: VercelResponse) {
  try {
    await processar(req, res);
  } catch (e) {
    console.error('contracts/preview crash:', e);
    if (!res.headersSent) res.status(502).json({ erro: 'Não foi possível gerar a minuta.' });
  }
}

const EDITAVEIS = new Set(['rascunho', 'devolvido', 'aprovado']);

async function processar(req: VercelRequest, res: VercelResponse) {
  if (!requireMethod(req, res, 'POST')) return;
  const token = bearer(req);
  if (!token) return void res.status(401).json({ erro: 'Não autenticado.' });
  const body = (req.body ?? {}) as { contratoId?: unknown; formato?: unknown };
  const contratoId = typeof body.contratoId === 'string' ? body.contratoId : '';
  const formato = body.formato === 'docx' || body.formato === 'pdf' ? body.formato : 'hash';
  if (!contratoId) return void res.status(400).json({ erro: 'Informe o contrato.' });

  const sb = userClient(token);
  const c = await carregarContratoV2(sb, contratoId);
  if (!c) return void res.status(404).json({ erro: 'Contrato não encontrado.' });
  if (!c.catalogo) return void res.status(409).json({ erro: 'O modelo da minuta não tem catálogo carregado.' });
  if (['emitido', 'enviado', 'assinado', 'cancelado'].includes(c.status)) return void res.status(409).json({ erro: 'Contrato emitido: baixe a versão final.' });

  const anexo = await hashDaPropostaSeAnexo(sb, c);
  const { doc, hash } = await resolverEHash(c, { final: false, hashProposta: anexo.hash });

  let svc;
  try {
    svc = serviceClient();
  } catch (e) {
    if (e instanceof MissingEnvError) return void res.status(503).json({ erro: 'Minuta não configurada no servidor.' });
    throw e;
  }
  // Modelo .docx (bucket privado, só o servidor lê): o caminho tem de estar na
  // pasta da organização do contrato (service_role ignora RLS no storage).
  if (!c.docxPath.startsWith(`${c.orgId}/`) || c.docxPath.includes('..')) return void res.status(409).json({ erro: 'Modelo da minuta com caminho inválido.' });
  const { data: modeloBlob, error: mErr } = await svc.storage.from('modelos').download(c.docxPath);
  if (mErr || !modeloBlob) return void res.status(503).json({ erro: 'Modelo da minuta não encontrado no servidor. Peça ao gestor para carregar o modelo.' });
  const modelo = new Uint8Array(await modeloBlob.arrayBuffer());
  let logo: Uint8Array | null = null;
  if (c.partes.construtora?.marca === 'ampla') {
    const { data: l } = await svc.storage.from('modelos').download(`${c.orgId}/logo-ampla.png`);
    if (l) logo = new Uint8Array(await l.arrayBuffer());
  }

  // Marcadores vazios: SEMPRE pelo preenchimento real do modelo (mesmo cálculo
  // para docx, pdf e hash), sem os de emissão, preenchidos ao emitir.
  const preenchido = preencherDocx(modelo, doc, { logo });
  const faltando = [...new Set([...camposVaziosDoDocumento(doc, marcadoresSimples(documentXmlDoDocx(modelo))), ...preenchido.faltando.filter((k) => !/^ass_/.test(k)), ...(doc.anexoIII && anexo.faltou ? ['anexo_iii_arquivo'] : [])])];

  let arquivo: { bytes: Uint8Array; tipo: string; ext: string } | null = null;
  let paginasPdf = 0;
  if (formato === 'docx') {
    arquivo = { bytes: preenchido.docx, tipo: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', ext: 'docx' };
  } else if (formato === 'pdf') {
    const { buffer, paginas } = await renderContratoV2Pdf(doc, { catalogo: c.catalogo, logoPng: logo });
    let bytes: Uint8Array = new Uint8Array(buffer);
    paginasPdf = paginas;
    // Anexo III: a proposta vencedora, como arquivada no bid, entra depois da capa do anexo.
    if (doc.anexoIII && anexo.arquivo) {
      const r = await anexarPropostaAoPdf(bytes, anexo.arquivo);
      bytes = r.pdf;
      paginasPdf += r.paginasAnexo;
    }
    arquivo = { bytes, tipo: 'application/pdf', ext: 'pdf' };
  }

  // Grava hash e pendências de marcador quando o contrato está em edição
  // (em validação o conteúdo é imutável e o hash já é o do envio).
  if (EDITAVEIS.has(c.status) && (c.conteudoHash !== hash || JSON.stringify(c.faltandoServidor ?? null) !== JSON.stringify(faltando))) {
    const ok = await gravarHashConteudo(svc, c, hash, faltando);
    if (!ok) return void res.status(409).json({ erro: 'O contrato mudou enquanto a minuta era gerada. Tente de novo.' });
  }

  if (!arquivo) return void res.status(200).json({ hash, faltando });
  const base = `Minuta - ${c.categoria} - ${c.obraNome}`.replace(/[\\/:*?"<>|]+/g, '-').trim();
  const ascii = base.normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^\x20-\x7E]/g, '_');
  res.setHeader('Content-Type', arquivo.tipo);
  res.setHeader('Content-Disposition', `attachment; filename="${ascii}.${arquivo.ext}"; filename*=UTF-8''${encodeURIComponent(base)}.${arquivo.ext}`);
  res.setHeader('Cache-Control', 'no-store');
  res.setHeader('X-Bid-Hash', hash);
  res.setHeader('X-Bid-Faltando', String(faltando.length));
  if (paginasPdf) res.setHeader('X-Bid-Paginas', String(paginasPdf));
  res.status(200).send(Buffer.from(arquivo.bytes));
}
