import { createHash } from 'node:crypto';
import type { SupabaseClient } from '@supabase/supabase-js';
import { PDFDocument, StandardFonts, rgb } from 'pdf-lib';
import { PARTE_V2_LABEL, indiceDoSignatario, type ParteV2, type SignatarioResumo } from '@bid/core';
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
  /** Caminho ATUAL do PDF (emitido ou já com rubricas), gravado pelo servidor. */
  pdfPath: string;
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
 * Registra a assinatura de UM signatário: carimba a rubrica sobre o PDF atual,
 * grava o resultado num caminho NOVO (por hash) e chama `registrar_assinatura_v2`,
 * que — numa transação com a linha do contrato travada — confere a cadeia de
 * hashes (último doc_hash ou pdf_hash da emissão, RC-13), grava a trilha,
 * avança o ponteiro `pdf_path` e leva a `assinado` quando todos os obrigatórios
 * assinaram. Se a RPC recusar (cadeia avançou, já assinou…), o arquivo novo é
 * removido; o PDF anterior nunca é sobrescrito.
 */
export async function registrarAssinaturaV2(sb: SupabaseClient, d: DadosAssinaturaV2): Promise<{ assinado: boolean }> {
  if (!d.pdfPath.startsWith(`${d.orgId}/${d.contratoId}/`)) throw new Error('Caminho do PDF inválido.');
  const baixado = await sb.storage.from('contratos').download(d.pdfPath);
  if (baixado.error || !baixado.data) throw new Error('PDF emitido indisponível.');
  const pdfBytes = new Uint8Array(await baixado.data.arrayBuffer());
  const hashAnterior = sha256Hex(pdfBytes);

  const { data: sigRows } = await sb.from('contrato_signatarios').select('id, parte, nome, obrigatorio').eq('contrato_id', d.contratoId);
  const signatarios = ((sigRows ?? []) as { id: string; parte: ParteV2; nome: string; obrigatorio: boolean }[]).map<SignatarioResumo>((s) => ({ id: s.id, parte: s.parte, nome: s.nome, obrigatorio: s.obrigatorio }));
  const quando = new Date();
  const pngBytes = Uint8Array.from(Buffer.from(d.pngBase64, 'base64'));
  const assinado = await aplicarRubricaV2(pdfBytes, pngBytes, { nome: d.nome, parte: d.parte, indice: indiceDoSignatario(signatarios, d.signatarioId), quando });
  const docHash = sha256Hex(assinado);

  const novoPath = `${d.orgId}/${d.contratoId}/assinado-${docHash.slice(0, 16)}.pdf`;
  const up = await sb.storage.from('contratos').upload(novoPath, assinado, { upsert: false, contentType: 'application/pdf' });
  if (up.error) throw new Error('Falha ao salvar o PDF assinado.');
  const imgPath = `${d.orgId}/${d.contratoId}-${d.signatarioId}.png`;
  await sb.storage.from('assinaturas').upload(imgPath, pngBytes, { upsert: true, contentType: 'image/png' });

  const { data, error } = await sb.rpc('registrar_assinatura_v2', {
    p_contrato: d.contratoId,
    p_signatario: d.signatarioId,
    p_hash_anterior: hashAnterior,
    p_doc_hash: docHash,
    p_pdf_path: novoPath,
    p_img_path: imgPath,
    p_via: d.via,
    p_coletado_por: d.coletadoPor,
    p_ip: d.ip,
    p_user_agent: d.userAgent,
  });
  if (error) {
    await sb.storage.from('contratos').remove([novoPath]);
    throw new Error(error.message.replace(/^.*?: /, '') || 'Falha ao registrar a assinatura.');
  }
  return { assinado: data === true };
}

export function sha256Hex(bytes: Uint8Array): string {
  return createHash('sha256').update(bytes).digest('hex');
}
