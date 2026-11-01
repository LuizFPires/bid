import { PDFDocument, StandardFonts, rgb } from 'pdf-lib';
import { detectarMidia } from './anthropic';

/**
 * Anexo III no PDF: depois da página de capa do Anexo III (texto resolvido),
 * entram as páginas da PROPOSTA VENCEDORA como arquivada no bid (PDF) ou a
 * imagem da proposta numa página A4. Word (.docx) não é incorporável: fica só
 * a capa, com nota. O .docx emitido continua com a capa do Anexo III apenas.
 */
const MAX_PROPOSTA = 12 * 1024 * 1024;
const MAX_PAGINAS = 300;
const MAX_PIXELS = 40_000_000;

/** Dimensões de PNG (IHDR) ou JPEG (SOFn) sem decodificar; null se não achar. */
function dimensoes(b: Uint8Array, tipo: 'image/png' | 'image/jpeg'): { w: number; h: number } | null {
  const dv = new DataView(b.buffer, b.byteOffset, b.byteLength);
  if (tipo === 'image/png') return b.length >= 24 ? { w: dv.getUint32(16), h: dv.getUint32(20) } : null;
  let i = 2;
  while (i + 9 < b.length) {
    if (b[i] !== 0xff) return null;
    const marker = b[i + 1]!;
    const len = dv.getUint16(i + 2);
    if (marker >= 0xc0 && marker <= 0xcf && marker !== 0xc4 && marker !== 0xc8 && marker !== 0xcc) return { h: dv.getUint16(i + 5), w: dv.getUint16(i + 7) };
    i += 2 + len;
  }
  return null;
}

export async function anexarPropostaAoPdf(pdfContrato: Uint8Array, proposta: { bytes: Uint8Array; nome: string }): Promise<{ pdf: Uint8Array; paginasAnexo: number; aviso: string | null }> {
  if (proposta.bytes.byteLength > MAX_PROPOSTA) return { pdf: pdfContrato, paginasAnexo: 0, aviso: 'A proposta não foi anexada ao PDF: arquivo acima de 12 MB.' };
  const tipo = detectarMidia(Buffer.from(proposta.bytes), proposta.nome);
  const doc = await PDFDocument.load(pdfContrato);
  if (tipo === 'application/pdf') {
    let origem: PDFDocument;
    try {
      origem = await PDFDocument.load(proposta.bytes, { ignoreEncryption: true });
    } catch {
      return { pdf: pdfContrato, paginasAnexo: 0, aviso: 'A proposta não foi anexada ao PDF: arquivo PDF ilegível.' };
    }
    if (origem.getPageCount() > MAX_PAGINAS) return { pdf: pdfContrato, paginasAnexo: 0, aviso: `A proposta não foi anexada ao PDF: mais de ${MAX_PAGINAS} páginas.` };
    const paginas = await doc.copyPages(origem, origem.getPageIndices());
    for (const p of paginas) doc.addPage(p);
    return { pdf: await doc.save(), paginasAnexo: paginas.length, aviso: null };
  }
  if (tipo === 'image/png' || tipo === 'image/jpeg') {
    const dim = dimensoes(proposta.bytes, tipo);
    if (!dim || dim.w * dim.h > MAX_PIXELS) return { pdf: pdfContrato, paginasAnexo: 0, aviso: 'A proposta não foi anexada ao PDF: imagem grande demais ou ilegível.' };
    const img = tipo === 'image/png' ? await doc.embedPng(proposta.bytes) : await doc.embedJpg(proposta.bytes);
    const page = doc.addPage([595.28, 841.89]);
    const margem = 36;
    const escala = Math.min((595.28 - 2 * margem) / img.width, (841.89 - 2 * margem) / img.height, 1);
    const w = img.width * escala;
    const h = img.height * escala;
    page.drawImage(img, { x: (595.28 - w) / 2, y: 841.89 - margem - h, width: w, height: h });
    return { pdf: await doc.save(), paginasAnexo: 1, aviso: null };
  }
  // .docx ou formato não incorporável: nota na página de capa
  const ultima = doc.getPage(doc.getPageCount() - 1);
  const font = await doc.embedFont(StandardFonts.Helvetica);
  ultima.drawText('A proposta comercial arquivada no bid (arquivo Word) acompanha este contrato em separado.', { x: 46, y: 80, size: 8, font, color: rgb(0.36, 0.38, 0.46) });
  return { pdf: await doc.save(), paginasAnexo: 0, aviso: 'Proposta em Word: não incorporada ao PDF (fica como anexo separado).' };
}

/**
 * Baixa o arquivo da proposta do dossiê (bucket `propostas`, no contexto do
 * usuário: a RLS decide) e devolve bytes + nome; null se não houver ou falhar.
 */
export async function arquivoDaProposta(sb: import('@supabase/supabase-js').SupabaseClient, path: string | null | undefined): Promise<{ bytes: Uint8Array; nome: string } | null> {
  if (!path) return null;
  try {
    const { data: signed } = await sb.storage.from('propostas').createSignedUrl(path, 60);
    if (!signed) return null;
    const resp = await fetch(signed.signedUrl);
    if (!resp.ok) return null;
    return { bytes: new Uint8Array(await resp.arrayBuffer()), nome: path.split('/').pop() ?? 'proposta' };
  } catch {
    return null;
  }
}
