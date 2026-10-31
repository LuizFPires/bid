import { unzipSync, strFromU8 } from 'fflate';

const MAX_CHARS = 120_000;

/** É um .docx? (zip com word/document.xml dentro) */
export function ehDocx(buf: Uint8Array): boolean {
  if (buf.length < 4 || buf[0] !== 0x50 || buf[1] !== 0x4b) return false; // "PK"
  try {
    const z = unzipSync(buf, { filter: (f) => f.name === 'word/document.xml' });
    return !!z['word/document.xml'];
  } catch {
    return false;
  }
}

/**
 * Texto de um .docx (Word), com parágrafos em linhas e células de tabela
 * separadas por " | " — suficiente para a IA ler fornecedor, valores, prazos
 * e condições. Formatação, imagens e cabeçalhos/rodapés ficam de fora.
 */
export function textoDeDocx(buf: Uint8Array): string {
  const z = unzipSync(buf, { filter: (f) => f.name === 'word/document.xml' || f.name.startsWith('word/footnotes') });
  const xml = z['word/document.xml'] ? strFromU8(z['word/document.xml']) : '';
  const texto = xml
    .replace(/<w:tab\b[^>]*\/>/g, '\t')
    .replace(/<w:br\b[^>]*\/>/g, '\n')
    .replace(/<\/w:p>\s*<\/w:tc>/g, ' | ')
    .replace(/<\/w:tc>/g, ' | ')
    .replace(/<\/w:tr>/g, '\n')
    .replace(/<\/w:p>/g, '\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&#(\d+);/g, (_, n: string) => String.fromCodePoint(Number(n)))
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
  return texto.length > MAX_CHARS ? texto.slice(0, MAX_CHARS) + '\n[… documento truncado …]' : texto;
}
