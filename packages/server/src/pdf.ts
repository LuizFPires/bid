import { carregarReactPdf } from './react-pdf';
export interface ContratoPdfDados {
  obra: string;
  categoria: string;
  contratada: string;
  valor: string;
  clausulas: { numero: number; titulo: string; texto: string }[];
  /** Anexo I (proposta vencedora) e Anexo II (equalização do certame), quando existirem. */
  anexos?: {
    vencedora: { fornecedor: string; opcao: string | null; valor: string; prazo: string; pagamento: string; garantia: string } | null;
    equalizacao: {
      titulo: string | null;
      conclusao: string | null;
      referencia: string | null;
      propostas: { nome: string; apresentado: string; equalizado: string; prazo: string; vencedora: boolean }[];
    } | null;
  };
}

/** Helvetica não tem ≈ ✓ ✗ → ←: troca por equivalentes. */
function glifos(t: string): string {
  return t.replace(/≈/g, '~').replace(/✓/g, 'sim').replace(/✗/g, 'não').replace(/→/g, '->').replace(/←/g, '<-');
}

/**
 * Renderiza o PDF do contrato (A4, paginação automática). Devolve bytes + nº de
 * páginas.
 *
 * react e @react-pdf/renderer são carregados SOB DEMANDA (import dinâmico) e
 * ficam EXTERNOS ao bundle: o react-pdf usa subpaths `#standard-fonts/*` do
 * pdfkit que não sobrevivem ao empacotamento. Assim, importar `@bid/server`
 * (extração/IA/assinatura) não carrega o react-pdf — só esta função o faz.
 */
export async function renderContratoPdf(d: ContratoPdfDados): Promise<{ buffer: Buffer; paginas: number }> {
  const { h, Document, Page, StyleSheet, Text, View, renderToBuffer } = await carregarReactPdf();

  const s = StyleSheet.create({
    page: { paddingTop: 54, paddingBottom: 54, paddingHorizontal: 48, fontSize: 11, lineHeight: 1.5, color: '#1a1a2e' },
    h1: { fontSize: 15, fontWeight: 700, textAlign: 'center', marginBottom: 4 },
    meta: { fontSize: 10, textAlign: 'center', color: '#555', marginBottom: 18 },
    cl: { marginBottom: 12 },
    clTitulo: { fontSize: 11, fontWeight: 700, marginBottom: 2 },
    clTexto: { textAlign: 'justify' },
    assinatura: { marginTop: 40, fontSize: 10 },
    linha: { marginTop: 28, borderTopWidth: 1, borderTopColor: '#1a1a2e', width: 240, paddingTop: 4 },
    // anexos
    anexoT: { fontSize: 13, fontWeight: 700, textAlign: 'center', marginBottom: 2 },
    anexoS: { fontSize: 9.5, textAlign: 'center', color: '#555', marginBottom: 16 },
    kv: { flexDirection: 'row', borderBottomWidth: 0.5, borderBottomColor: '#d8d8e0', paddingVertical: 5 },
    k: { width: 150, fontSize: 10, color: '#555' },
    v: { flex: 1, fontSize: 10.5, fontWeight: 700 },
    tr: { flexDirection: 'row', borderBottomWidth: 0.5, borderBottomColor: '#d8d8e0' },
    th: { backgroundColor: '#1a1a2e', color: '#fff', fontSize: 9, fontWeight: 700, paddingVertical: 6, paddingHorizontal: 6 },
    td: { fontSize: 9.5, paddingVertical: 6, paddingHorizontal: 6 },
    venc: { fontWeight: 700 },
    nota: { fontSize: 9.5, color: '#333', marginTop: 14, lineHeight: 1.5, textAlign: 'justify' },
    rodapeAnexo: { fontSize: 8.5, color: '#777', marginTop: 18 },
  });

  const a = d.anexos;
  const paginasAnexo: ReturnType<typeof h>[] = [];
  if (a?.vencedora) {
    const v = a.vencedora;
    const kv = (k: string, val: string) => h(View, { key: k, style: s.kv }, h(Text, { style: s.k }, k), h(Text, { style: s.v }, glifos(val)));
    paginasAnexo.push(
      h(
        Page,
        { key: 'anexo1', size: 'A4', style: s.page },
        h(Text, { style: s.anexoT }, 'ANEXO I — PROPOSTA VENCEDORA'),
        h(Text, { style: s.anexoS }, `${d.categoria} — ${d.obra}`),
        kv('Fornecedor', v.fornecedor + (v.opcao ? ` · ${v.opcao}` : '')),
        kv('Valor', v.valor),
        kv('Prazo', v.prazo),
        kv('Condição de pagamento', v.pagamento),
        kv('Garantia', v.garantia),
        h(Text, { style: s.nota }, 'A proposta comercial do fornecedor, na versão arquivada no bid na data da adjudicação, integra este contrato como Anexo I e é a fonte das cláusulas da minuta. Em caso de divergência entre a minuta e a proposta, prevalece a minuta.'),
      ),
    );
  }
  if (a?.equalizacao && a.equalizacao.propostas.length) {
    const e = a.equalizacao;
    const cw = { c1: { width: '37%' }, c2: { width: '18%' }, c3: { width: '18%' }, c4: { width: '12%' }, c5: { width: '15%' } };
    paginasAnexo.push(
      h(
        Page,
        { key: 'anexo2', size: 'A4', style: s.page },
        h(Text, { style: s.anexoT }, 'ANEXO II — EQUALIZAÇÃO DAS PROPOSTAS'),
        h(Text, { style: s.anexoS }, `${d.categoria} — ${d.obra}${e.referencia ? ` — base: ${glifos(e.referencia)}` : ''}`),
        e.titulo ? h(Text, { style: [s.nota, { marginTop: 0, marginBottom: 12, fontWeight: 700 }] }, glifos(e.titulo)) : null,
        h(
          View,
          { style: s.tr },
          h(Text, { style: [s.th, cw.c1] }, 'Proposta'),
          h(Text, { style: [s.th, cw.c2] }, 'Apresentado'),
          h(Text, { style: [s.th, cw.c3] }, 'Equalizado'),
          h(Text, { style: [s.th, cw.c4] }, 'Prazo'),
          h(Text, { style: [s.th, cw.c5] }, 'Situação'),
        ),
        ...e.propostas.map((p, i) =>
          h(
            View,
            { key: i, style: s.tr, wrap: false },
            h(Text, { style: [s.td, cw.c1, p.vencedora ? s.venc : {}] }, glifos(p.nome)),
            h(Text, { style: [s.td, cw.c2] }, p.apresentado),
            h(Text, { style: [s.td, cw.c3, p.vencedora ? s.venc : {}] }, p.equalizado),
            h(Text, { style: [s.td, cw.c4] }, p.prazo),
            h(Text, { style: [s.td, cw.c5, p.vencedora ? s.venc : {}] }, p.vencedora ? 'Vencedora' : '—'),
          ),
        ),
        e.conclusao ? h(Text, { style: s.nota }, glifos(e.conclusao)) : null,
        h(Text, { style: s.rodapeAnexo }, 'Comparativo gerado no bid com apoio de IA a partir das propostas arquivadas; a escolha da vencedora é do contratante. O relatório completo de equalização pode ser exportado em PDF no aplicativo.'),
      ),
    );
  }

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
    ...paginasAnexo,
  );

  const buffer = await renderToBuffer(doc);
  // Detecta o nº de páginas contando objetos /Type /Page (não /Pages).
  const texto = buffer.toString('latin1');
  const m = texto.match(/\/Type\s*\/Page(?![s])/g);
  return { buffer, paginas: m ? m.length : 1 };
}
