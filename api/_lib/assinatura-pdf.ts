import { PDFDocument, StandardFonts, rgb } from 'pdf-lib';

export type Parte = 'contratante' | 'contratada';

/**
 * Carimba a assinatura (PNG) em TODAS as páginas do PDF, na posição da parte
 * (contratada à esquerda, contratante à direita), com o nome por baixo.
 * Devolve os bytes do PDF assinado.
 */
export async function aplicarAssinatura(
  pdfBytes: Uint8Array,
  pngBytes: Uint8Array,
  parte: Parte,
  nome: string,
): Promise<Uint8Array> {
  const doc = await PDFDocument.load(pdfBytes);
  const png = await doc.embedPng(pngBytes);
  const font = await doc.embedFont(StandardFonts.Helvetica);

  const largura = 150;
  const altura = Math.min(60, (png.height / png.width) * largura);

  for (const page of doc.getPages()) {
    const { width } = page.getSize();
    const x = parte === 'contratada' ? 48 : width - 48 - largura;
    const y = 54;
    page.drawImage(png, { x, y, width: largura, height: altura });
    page.drawText(`${nome || parte} — ${parte}`, {
      x,
      y: y - 11,
      size: 7,
      font,
      color: rgb(0.1, 0.1, 0.2),
    });
  }

  return doc.save();
}
