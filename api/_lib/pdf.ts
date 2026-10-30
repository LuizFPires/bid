import { createElement as h } from 'react';
import { Document, Page, StyleSheet, Text, View, renderToBuffer } from '@react-pdf/renderer';

export interface ContratoPdfDados {
  obra: string;
  categoria: string;
  contratada: string;
  valor: string;
  clausulas: { numero: number; titulo: string; texto: string }[];
}

const s = StyleSheet.create({
  page: { paddingTop: 54, paddingBottom: 54, paddingHorizontal: 48, fontSize: 11, lineHeight: 1.5, color: '#1a1a2e' },
  h1: { fontSize: 15, fontWeight: 700, textAlign: 'center', marginBottom: 4 },
  meta: { fontSize: 10, textAlign: 'center', color: '#555', marginBottom: 18 },
  cl: { marginBottom: 12 },
  clTitulo: { fontSize: 11, fontWeight: 700, marginBottom: 2 },
  clTexto: { textAlign: 'justify' },
  assinatura: { marginTop: 40, fontSize: 10 },
  linha: { marginTop: 28, borderTopWidth: 1, borderTopColor: '#1a1a2e', width: 240, paddingTop: 4 },
});

/** Renderiza o PDF do contrato (A4, paginação automática). Devolve bytes + nº de páginas. */
export async function renderContratoPdf(d: ContratoPdfDados): Promise<{ buffer: Buffer; paginas: number }> {
  const doc = h(
    Document,
    null,
    h(
      Page,
      { size: 'A4', style: s.page },
      h(Text, { style: s.h1 }, 'CONTRATO DE PRESTAÇÃO DE SERVIÇOS'),
      h(Text, { style: s.meta }, `${d.categoria} — ${d.obra} — ${d.valor}`),
      ...d.clausulas.map((c) =>
        h(
          View,
          { key: String(c.numero), style: s.cl, wrap: false },
          h(Text, { style: s.clTitulo }, `Cláusula ${c.numero}ª — ${c.titulo}`),
          h(Text, { style: s.clTexto }, c.texto),
        ),
      ),
      h(
        View,
        { style: s.assinatura },
        h(Text, {}, 'E, por estarem de acordo, as partes assinam o presente contrato.'),
        h(Text, { style: s.linha }, `CONTRATADA: ${d.contratada}`),
        h(Text, { style: s.linha }, 'CONTRATANTE'),
      ),
    ),
  );

  const buffer = await renderToBuffer(doc);
  // Detecta o nº de páginas contando objetos /Type /Page (não /Pages).
  const texto = buffer.toString('latin1');
  const m = texto.match(/\/Type\s*\/Page(?![s])/g);
  return { buffer, paginas: m ? m.length : 1 };
}
