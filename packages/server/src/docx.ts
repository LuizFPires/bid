import { unzipSync, strFromU8 } from 'fflate';

const MAX_CHARS = 120_000;
/** Teto do XML descomprimido (bomba de descompressão: 8 MB zipados podem virar GBs). */
const MAX_XML_BYTES = 10 * 1024 * 1024;
const MAX_XML_CHARS = 2_000_000;

/** Só entradas de interesse e dentro do teto declarado são infladas. */
function filtro(nomes: (n: string) => boolean) {
  return (f: { name: string; originalSize: number }) => nomes(f.name) && f.originalSize <= MAX_XML_BYTES;
}

/** É um .docx? (zip com word/document.xml dentro) */
export function ehDocx(buf: Uint8Array): boolean {
  if (buf.length < 4 || buf[0] !== 0x50 || buf[1] !== 0x4b) return false; // "PK"
  try {
    const z = unzipSync(buf, { filter: filtro((n) => n === 'word/document.xml') });
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
  const z = unzipSync(buf, { filter: filtro((n) => n === 'word/document.xml') });
  const xml = (z['word/document.xml'] ? strFromU8(z['word/document.xml']) : '').slice(0, MAX_XML_CHARS);
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
