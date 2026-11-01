import { createHash } from 'node:crypto';
import type { SupabaseClient } from '@supabase/supabase-js';
import { PDFDocument, StandardFonts, rgb } from 'pdf-lib';
import { PARTE_V2_LABEL, indiceDoSignatario, todasObrigatoriasAssinaram, type ParteV2, type SignatarioResumo } from '@bid/core';
export type { ParteV2 } from '@bid/core';

/**
 * Assinatura das três partes (M13): rubrica de cada signatário em TODAS as
 * páginas do PDF emitido, numa grade no rodapé (4 por linha), com nome, parte e
 * data. A posição é pelo índice estável do signatário (core.indiceDoSignatario)
 * — o @react-pdf não expõe as coordenadas das caixas do bloco de assinaturas
 * (desvio do SPEC §7 registrado em Decisões).
 */
export async function aplicarRubricaV2(pdfBytes: Uint8Array, pngBytes: Uint8Array, d: { nome: string; parte: ParteV2; indice: number; quando: Date }): Promise<Uint8Array> {
  const doc = await PDFDocument.load(pdfBytes);
  const png = await doc.embedPng(pngBytes);
  const font = await doc.embedFont(StandardFonts.Helvetica);
  const largura = 104;
  const altura = Math.min(34, (png.height / png.width) * largura);
  const col = d.indice % 4;
  const lin = Math.floor(d.indice / 4);
  const data = d.quando.toLocaleDateString('pt-BR', { timeZone: 'America/Sao_Paulo' });
  for (const page of doc.getPages()) {
    const { width } = page.getSize();
    const passo = (width - 80) / 4;
    const x = 40 + col * passo;
    const y = 14 + lin * 54 + 12;
    page.drawImage(png, { x, y, width: largura, height: altura });
    page.drawText(`${d.nome} · ${PARTE_V2_LABEL[d.parte]} · ${data}`.slice(0, 48), { x, y: y - 9, size: 6, font, color: rgb(0.08, 0.1, 0.3) });
  }
  return doc.save();
}

export interface DadosAssinaturaV2 {
  contratoId: string;
  orgId: string;
  pdfPath: string;
  /** Hash do PDF emitido (início da cadeia de integridade). */
  pdfHashEmissao: string | null;
  signatarioId: string;
  parte: ParteV2;
  nome: string;
  via: 'app' | 'link';
  coletadoPor: string | null;
  pngBase64: string;
  ip: string | null;
  userAgent: string | null;
}

/**
 * Registra a assinatura de UM signatário: confere a cadeia de hashes (o PDF
 * atual tem de bater com o `doc_hash` da assinatura anterior ou, na primeira,
 * com o `pdf_hash` da emissão — RC-13), carimba a rubrica, regrava o PDF,
 * guarda a imagem e a trilha (service_role) e, quando todos os obrigatórios
 * assinaram, leva o contrato a `assinado`.
 */
export async function registrarAssinaturaV2(sb: SupabaseClient, d: DadosAssinaturaV2): Promise<{ assinado: boolean }> {
  const { data: existente } = await sb.from('assinaturas').select('assinado_em').eq('contrato_id', d.contratoId).eq('signatario_id', d.signatarioId).maybeSingle();
  if ((existente as { assinado_em: string | null } | null)?.assinado_em) throw new Error('Este signatário já assinou.');

  const baixado = await sb.storage.from('contratos').download(d.pdfPath);
  if (baixado.error || !baixado.data) throw new Error('PDF emitido indisponível.');
  const pdfBytes = new Uint8Array(await baixado.data.arrayBuffer());
  const hashAtual = createHash('sha256').update(pdfBytes).digest('hex');

  const { data: ultima } = await sb.from('assinaturas').select('doc_hash').eq('contrato_id', d.contratoId).not('doc_hash', 'is', null).order('assinado_em', { ascending: false }).limit(1).maybeSingle();
  const esperado = (ultima as { doc_hash: string | null } | null)?.doc_hash ?? d.pdfHashEmissao;
  if (esperado && esperado !== hashAtual) throw new Error('O documento foi alterado desde a emissão ou a última assinatura.');

  const { data: sigRows } = await sb.from('contrato_signatarios').select('id, parte, nome, obrigatorio').eq('contrato_id', d.contratoId);
  const signatarios = ((sigRows ?? []) as { id: string; parte: ParteV2; nome: string; obrigatorio: boolean }[]).map<SignatarioResumo>((s) => ({ id: s.id, parte: s.parte, nome: s.nome, obrigatorio: s.obrigatorio }));
  const quando = new Date();
  const pngBytes = Uint8Array.from(Buffer.from(d.pngBase64, 'base64'));
  const assinado = await aplicarRubricaV2(pdfBytes, pngBytes, { nome: d.nome, parte: d.parte, indice: indiceDoSignatario(signatarios, d.signatarioId), quando });
  const docHash = createHash('sha256').update(assinado).digest('hex');

  const up = await sb.storage.from('contratos').upload(d.pdfPath, assinado, { upsert: true, contentType: 'application/pdf' });
  if (up.error) throw new Error('Falha ao salvar o PDF assinado.');
  const imgPath = `${d.orgId}/${d.contratoId}-${d.signatarioId}.png`;
  await sb.storage.from('assinaturas').upload(imgPath, pngBytes, { upsert: true, contentType: 'image/png' });

  const { error: tErr } = await sb.from('assinaturas').upsert(
    {
      org_id: d.orgId,
      contrato_id: d.contratoId,
      signatario_id: d.signatarioId,
      parte: d.parte,
      signatario_nome: d.nome || null,
      assinatura_img_path: imgPath,
      via: d.via,
      coletado_por: d.coletadoPor,
      assinado_em: quando.toISOString(),
      ip: d.ip,
      user_agent: d.userAgent,
      doc_hash: docHash,
      token_hash: null,
      token_expira: null,
    },
    { onConflict: 'contrato_id,signatario_id' },
  );
  if (tErr) throw new Error('Falha ao registrar a assinatura.');

  const { data: linhas } = await sb.from('assinaturas').select('signatario_id, assinado_em').eq('contrato_id', d.contratoId);
  const todas = todasObrigatoriasAssinaram(signatarios, ((linhas ?? []) as { signatario_id: string | null; assinado_em: string | null }[]).map((l) => ({ signatarioId: l.signatario_id, assinadoEm: l.assinado_em })));
  if (todas) {
    const { data: trans } = await sb.from('contratos').update({ status: 'assinado' }).eq('id', d.contratoId).in('status', ['emitido', 'enviado']).select('id').maybeSingle();
    if (trans) await sb.from('eventos').insert({ org_id: d.orgId, entidade: 'contrato', entidade_id: d.contratoId, tipo: 'contrato_assinado', payload: { ultimo: d.signatarioId, doc_hash: docHash } });
  } else {
    await sb.from('eventos').insert({ org_id: d.orgId, entidade: 'contrato', entidade_id: d.contratoId, tipo: 'assinatura_coletada', payload: { parte: d.parte, via: d.via, signatario: d.signatarioId } });
  }
  return { assinado: todas };
}

export function sha256Hex(bytes: Uint8Array): string {
  return createHash('sha256').update(bytes).digest('hex');
}
