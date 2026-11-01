import { strFromU8, unzipSync } from 'fflate';

/**
 * Leitor mínimo de .xlsx (primeira planilha → matriz de células) com fflate,
 * sem biblioteca pesada: só o que a importação da planilha de preços precisa
 * (texto, números, strings compartilhadas, células inline). Fórmulas vêm pelo
 * valor cacheado. Limites para não inflar arquivo malicioso.
 */
const MAX_XML = 20 * 1024 * 1024;
const MAX_LINHAS = 5000;
const MAX_ARQUIVO = 10 * 1024 * 1024;
const MAX_COLUNAS = 64; // planilha de preços nunca passa disso; evita linha esparsa gigante (ex.: XFD1)

function decodeEntities(s: string): string {
  return s.replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&#(\d+);/g, (_, n: string) => String.fromCodePoint(Number(n)));
}

function colParaIndice(ref: string): number {
  const letras = ref.replace(/\d+/g, '');
  let n = 0;
  for (const ch of letras) n = n * 26 + (ch.charCodeAt(0) - 64);
  return n - 1;
}

export function lerXlsx(bytes: Uint8Array): unknown[][] {
  const z = unzipSync(bytes, { filter: (f) => (f.name === 'xl/sharedStrings.xml' || /^xl\/worksheets\/sheet\d+\.xml$/.test(f.name) || f.name === 'xl/workbook.xml') && f.originalSize <= MAX_XML });
  // originalSize vem do cabeçalho do zip (não confiável): confere o tamanho real inflado.
  for (const [nome, bytesXml] of Object.entries(z)) if (bytesXml.length > MAX_XML) throw new Error(`Planilha grande demais (${nome}).`);
  const shared: string[] = [];
  if (z['xl/sharedStrings.xml']) {
    const xml = strFromU8(z['xl/sharedStrings.xml']);
    for (const si of xml.matchAll(/<si>([\s\S]*?)<\/si>/g)) {
      const texto = [...si[1]!.matchAll(/<t[^>]*>([\s\S]*?)<\/t>/g)].map((m) => decodeEntities(m[1]!)).join('');
      shared.push(texto);
    }
  }
  // Primeira planilha pela ordem do workbook (sheet1.xml é o padrão).
  const nomes = Object.keys(z).filter((k) => /^xl\/worksheets\/sheet\d+\.xml$/.test(k)).sort((a, b) => Number(a.match(/\d+/)![0]) - Number(b.match(/\d+/)![0]));
  const primeira = nomes[0];
  if (!primeira) return [];
  const xml = strFromU8(z[primeira]!);
  const rows: unknown[][] = [];
  // <row .../> auto-fechada (linha vazia) não pode engolir a linha seguinte.
  for (const row of xml.matchAll(/<row\b(?:[^>\/]|\/(?!>))*>([\s\S]*?)<\/row>/g)) {
    if (rows.length >= MAX_LINHAS) break;
    const linha: unknown[] = [];
    for (const c of row[1]!.matchAll(/<c\b([^>]*?)(?:\/>|>([\s\S]*?)<\/c>)/g)) {
      const attrs = c[1] ?? '';
      const ref = /r="([A-Z]{1,3})\d+"/.exec(attrs)?.[1] ?? '';
      const tipo = /t="(\w+)"/.exec(attrs)?.[1] ?? '';
      const corpo = c[2] ?? '';
      const idx = ref ? colParaIndice(ref) : linha.length;
      if (idx < 0 || idx >= MAX_COLUNAS) continue;
      let valor: unknown = null;
      if (tipo === 's') {
        const i = Number(/<v>([^<]*)<\/v>/.exec(corpo)?.[1] ?? '-1');
        valor = shared[i] ?? '';
      } else if (tipo === 'inlineStr') {
        valor = [...corpo.matchAll(/<t[^>]*>([\s\S]*?)<\/t>/g)].map((m) => decodeEntities(m[1]!)).join('');
      } else if (tipo === 'str') {
        valor = decodeEntities(/<v>([^<]*)<\/v>/.exec(corpo)?.[1] ?? '');
      } else if (tipo === 'b') {
        valor = /<v>1<\/v>/.test(corpo);
      } else {
        const v = /<v>([^<]*)<\/v>/.exec(corpo)?.[1];
        valor = v == null || v === '' ? null : Number(v);
        if (typeof valor === 'number' && !Number.isFinite(valor)) valor = v;
      }
      while (linha.length < idx) linha.push(null);
      linha[idx] = valor;
    }
    rows.push(linha);
  }
  return rows;
}

/** CSV simples (; ou , como separador; aspas) → matriz. */
export function lerCsv(texto: string): unknown[][] {
  // Ponto e vírgula vence sempre que aparece (decimal brasileiro usa vírgula).
  const primeira = texto.split(/\r?\n/).find((l) => l.trim()) ?? '';
  const sep = primeira.includes(';') ? ';' : primeira.includes('\t') ? '\t' : ',';
  return texto
    .split(/\r?\n/)
    .filter((l) => l.trim())
    .slice(0, MAX_LINHAS)
    .map((l) => {
      const out: string[] = [];
      let cur = '';
      let aspas = false;
      for (let i = 0; i < l.length; i++) {
        const ch = l[i]!;
        if (ch === '"') {
          if (aspas && l[i + 1] === '"') {
            cur += '"';
            i++;
          } else aspas = !aspas;
        } else if (ch === sep && !aspas) {
          out.push(cur);
          cur = '';
        } else cur += ch;
      }
      out.push(cur);
      return out;
    });
}

export async function lerPlanilhaArquivo(file: File): Promise<unknown[][]> {
  if (file.size > MAX_ARQUIVO) throw new Error('Arquivo acima de 10 MB.');
  const nome = file.name.toLowerCase();
  if (nome.endsWith('.csv')) return lerCsv(await file.text());
  const buf = new Uint8Array(await file.arrayBuffer());
  if (buf[0] !== 0x50 || buf[1] !== 0x4b) throw new Error('Arquivo não é .xlsx (envie .xlsx ou .csv).');
  return lerXlsx(buf);
}
