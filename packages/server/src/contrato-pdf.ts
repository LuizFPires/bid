import { QUADRO, cmpNumeroItem, type DocumentoResolvido } from '@bid/core';
import { SORA } from './fontes-sora';
import { carregarReactPdf } from './react-pdf';

/**
 * PDF do contrato v2 a partir do MESMO DocumentoResolvido do .docx (SPEC §5.2,
 * decisão D3-técnica: a Vercel não converte .docx→PDF; renderizamos com
 * @react-pdf imitando a minuta). Conteúdo textual idêntico ao .docx: título,
 * quadro-resumo, partes, cláusulas numeradas, fecho e assinaturas, Anexo I
 * (quadro complementar, planilha, condições específicas), Anexo II, Anexo III.
 */
export interface CatalogoTitulos {
  clausulas: { clausula: string; titulo: string; itens: { numero: string }[] }[];
}
export interface ContratoV2PdfOpts {
  catalogo: CatalogoTitulos;
  /** Logo PNG da construtora (cabeçalho); sem logo, só o texto. */
  logoPng?: Uint8Array | null;
}

const AVISO_MINUTA = 'MINUTA PARA CONFERÊNCIA — NÃO VÁLIDA PARA ASSINATURA';
const INK = '#141b50';
const MUTED = '#5b6075';
const LINE = '#d9dbe6';
const WARN = '#B42318';
const HIGHLIGHT = '#fff3b0';
const ROTULOS_EXTRA: Record<string, string> = { q_documentos_integrantes: 'Documentos integrantes', q_valor_extenso: 'Valor por extenso' };

let fontesRegistradas = false;

/** Marcadores {{x}} → campos; vazio vira [A PREENCHER]. */
function preencher(texto: string, campos: Record<string, string>): string {
  return texto.replace(/\{\{([a-z_]+)\}\}/g, (_, k: string) => (campos[k] ?? '').trim() || '[A PREENCHER]');
}

export async function renderContratoV2Pdf(doc: DocumentoResolvido, opts: ContratoV2PdfOpts): Promise<{ buffer: Buffer; paginas: number }> {
  const { h, Document, Page, StyleSheet, Text, View, Image, Font, renderToBuffer } = await carregarReactPdf();
  type El = ReturnType<typeof h>;
  type Estilo = Parameters<typeof StyleSheet.create>[0][string];
  if (!fontesRegistradas) {
    Font.register({ family: 'Sora', fonts: SORA.map((f) => ({ src: f.src, fontWeight: f.peso })) });
    Font.registerHyphenationCallback((w: string) => [w]);
    fontesRegistradas = true;
  }
  const minuta = !doc.final;
  const c = doc.campos;
  const campo = (k: string) => (c[k] ?? '').trim() || '[A PREENCHER]';

  const s = StyleSheet.create({
    page: { paddingTop: minuta ? 84 : 66, paddingBottom: 60, paddingHorizontal: 52, fontFamily: 'Sora', fontWeight: 400, fontSize: 9.5, color: INK },
    cab: { position: 'absolute', top: 22, left: 52, right: 52, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
    cabTxt: { fontSize: 8, color: MUTED, fontWeight: 600, letterSpacing: 0.4 },
    logo: { height: 22, width: 90, objectFit: 'contain', objectPosition: 'left' },
    aviso: { position: 'absolute', top: 50, left: 52, right: 52, textAlign: 'center', color: WARN, fontWeight: 700, fontSize: 9.5 },
    rod: { position: 'absolute', bottom: 26, left: 52, right: 52, flexDirection: 'row', justifyContent: 'space-between', fontSize: 7.5, color: MUTED },
    h1: { fontSize: 13, fontWeight: 700, textAlign: 'center', marginBottom: 14, letterSpacing: 0.3 },
    h2: { fontSize: 10.5, fontWeight: 700, marginTop: 14, marginBottom: 6, letterSpacing: 0.3 },
    clH: { fontSize: 9.5, fontWeight: 700, marginTop: 12, marginBottom: 4, textTransform: 'uppercase' },
    p: { textAlign: 'justify', lineHeight: 1.45, marginBottom: 4 },
    item: { flexDirection: 'row', marginBottom: 4 },
    itemN: { width: 36, fontWeight: 700 },
    itemT: { flex: 1, textAlign: 'justify', lineHeight: 1.45 },
    tbl: { borderWidth: 0.6, borderColor: LINE, marginBottom: 8 },
    tr: { flexDirection: 'row', borderBottomWidth: 0.6, borderBottomColor: LINE },
    th: { backgroundColor: '#eef0f8', fontWeight: 700, fontSize: 8, padding: 5 },
    td: { padding: 5, fontSize: 8.8, lineHeight: 1.35 },
    k: { width: 160, fontWeight: 600, color: MUTED, fontSize: 8.3 },
    v: { flex: 1 },
    hl: { backgroundColor: HIGHLIGHT },
    r: { textAlign: 'right' },
    assBloco: { width: '46%', marginTop: 26 },
    assLinha: { borderTopWidth: 0.8, borderTopColor: INK, paddingTop: 4, fontSize: 8.5 },
    assGrid: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between' },
    small: { fontSize: 8, color: MUTED },
    anexoT: { fontSize: 11.5, fontWeight: 700, textAlign: 'center', marginBottom: 12, letterSpacing: 0.3 },
  });

  /** Texto com **negrito** → runs; destaque amarelo em campos preenchidos na minuta. */
  const rico = (texto: string, style?: Estilo | Estilo[]): El =>
    h(
      Text,
      { style },
      ...texto.split(/(\*\*[^*]+\*\*)/).filter(Boolean).map((parte, i) => (/^\*\*[^*]+\*\*$/.test(parte) ? h(Text, { key: i, style: { fontWeight: 700 } }, parte.slice(2, -2)) : parte)),
    );
  const valor = (k: string): El => h(Text, { style: minuta && c[k] ? s.hl : undefined }, campo(k));

  const linhaKV = (k: string, rotulo: string, numero: string | null): El =>
    h(View, { key: k, style: s.tr, wrap: false }, h(Text, { style: [s.td, s.k] }, `${numero ? `${numero} — ` : ''}${rotulo}`), h(View, { style: [s.td, s.v] }, valor(k)));

  const quadro = (chaves: string[]): El =>
    h(
      View,
      { style: s.tbl },
      h(View, { style: s.tr }, h(Text, { style: [s.th, { width: 160 }] }, 'ITEM / IDENTIFICAÇÃO'), h(Text, { style: [s.th, { flex: 1 }] }, 'INFORMAÇÃO')),
      ...chaves.map((k) => {
        const q = QUADRO.find((x) => x.chave === k);
        return linhaKV(k, q?.rotulo ?? ROTULOS_EXTRA[k] ?? k, q?.numero ?? null);
      }),
    );

  const cabecalho = (): El[] => [
    h(
      View,
      { style: s.cab, fixed: true },
      opts.logoPng ? h(Image, { style: s.logo, src: Buffer.from(opts.logoPng) }) : h(Text, { style: s.cabTxt }, (doc.razao.construtora || '').toUpperCase()),
      h(Text, { style: s.cabTxt }, `CONTRATO DE EMPREITADA · ${(c.obra_nome ?? '').toUpperCase()}`),
    ),
    ...(minuta ? [h(Text, { style: s.aviso, fixed: true }, AVISO_MINUTA)] : []),
    h(
      View,
      { style: s.rod, fixed: true },
      h(Text, null, 'CONTRATO DE EMPREITADA'),
      h(Text, { render: ({ pageNumber, totalPages }: { pageNumber: number; totalPages: number }) => `Página ${pageNumber} de ${totalPages}` }),
    ),
  ];

  const assinaturas = (partes: ('contratante' | 'contratada' | 'construtora')[]): El =>
    h(
      View,
      { style: s.assGrid },
      ...partes.flatMap((parte) => {
        const lista = doc.signatarios[parte].length ? doc.signatarios[parte] : [{ nome: '[A PREENCHER]', cargo: '' }];
        return lista.map((sg, i) =>
          h(
            View,
            { key: `${parte}${i}`, style: s.assBloco, wrap: false },
            h(Text, { style: s.assLinha }, `${sg.nome}${sg.cargo ? `, ${sg.cargo}` : ''}`),
            h(Text, { style: { fontWeight: 700, fontSize: 8.5 } }, `${doc.razao[parte] || '[A PREENCHER]'} — ${parte.toUpperCase()}`),
          ),
        );
      }),
    );

  // ---- corpo do contrato
  const clausulas: El[] = [];
  for (const cl of opts.catalogo.clausulas) {
    clausulas.push(h(Text, { key: `h${cl.clausula}`, style: s.clH, minPresenceAhead: 60 }, `CLÁUSULA ${cl.clausula} — ${cl.titulo}`));
    for (const it of cl.itens) {
      const texto = doc.clausulas[it.numero];
      clausulas.push(h(View, { key: it.numero, style: s.item }, h(Text, { style: s.itemN }, `${it.numero}.`), rico(texto == null ? 'Não se aplica.' : preencher(texto, c), s.itemT)));
      for (const ex of doc.extras.filter((x) => x.apos === it.numero).sort((a, b) => cmpNumeroItem(a.numero, b.numero))) {
        clausulas.push(h(View, { key: ex.numero, style: s.item }, h(Text, { style: s.itemN }, `${ex.numero}.`), rico(preencher(ex.texto, c), s.itemT)));
      }
    }
  }

  const corpo = h(
    Page,
    { size: 'A4', style: s.page },
    ...cabecalho(),
    h(Text, { style: s.h1 }, 'CONTRATO PARTICULAR DE EMPREITADA DE SERVIÇOS'),
    h(Text, { style: s.h2 }, 'QUADRO-RESUMO DO CONTRATO'),
    quadro(['obra_nome', 'obra_endereco', 'obra_cno', 'escopo_resumo', 'q_documentos_integrantes']),
    h(Text, { style: s.h2 }, 'QUALIFICAÇÃO DAS PARTES'),
    rico(`**I. CONTRATANTE:** ${doc.qualificacao.ct || '[A PREENCHER]'}`, s.p),
    rico(`**II. CONTRATADA:** ${doc.qualificacao.cd || '[A PREENCHER]'}`, s.p),
    rico(`**III. CONSTRUTORA:** ${doc.qualificacao.cs || '[A PREENCHER]'}`, s.p),
    rico(`As partes acima qualificadas têm entre si justo e contratado o presente CONTRATO PARTICULAR DE EMPREITADA DE SERVIÇOS para a ${campo('empreitada_desc')}, que se regerá pelas cláusulas seguintes e pelos ${campo('anexos_lista')}, que o integram.`, s.p),
    ...clausulas,
    rico(`E, por estarem justas e contratadas, as partes assinam o presente instrumento, com os ${campo('anexos_lista')}, em ${campo('ass_local')}, ${campo('ass_dia')} de ${campo('ass_mes')} de ${campo('ass_ano')}.`, { ...s.p, marginTop: 12 }),
    assinaturas(['contratante', 'contratada', 'construtora']),
    h(Text, { style: [s.h2, { marginTop: 24 }] }, 'TESTEMUNHAS'),
    h(View, { style: s.assGrid }, ...[1, 2].map((i) => h(View, { key: i, style: s.assBloco }, h(Text, { style: s.assLinha }, 'NOME:'), h(Text, { style: s.small }, 'CPF:')))),
  );

  // ---- Anexo I
  const planilha = h(
    View,
    { style: s.tbl },
    h(
      View,
      { style: s.tr },
      ...[
        ['ITEM', 40],
        ['SERVIÇO / DESCRIÇÃO', 0],
        ['UND', 32],
        ['QUANT.', 52],
        ['PREÇO UNIT.', 78],
        ['TOTAL', 84],
      ].map(([t, w]) => h(Text, { key: String(t), style: [s.th, w ? { width: w } : { flex: 1 }, w && t !== 'ITEM' && t !== 'UND' ? s.r : {}] }, String(t))),
    ),
    ...doc.itens.map((it, i) =>
      it.grupo
        ? h(View, { key: i, style: s.tr, wrap: false }, h(Text, { style: [s.td, { width: 40, fontWeight: 700 }] }, it.n), h(Text, { style: [s.td, { flex: 1, fontWeight: 700 }] }, it.desc))
        : h(
            View,
            { key: i, style: s.tr, wrap: false },
            h(Text, { style: [s.td, { width: 40 }] }, it.n),
            h(Text, { style: [s.td, { flex: 1 }] }, it.desc),
            h(Text, { style: [s.td, { width: 32 }] }, it.und ?? ''),
            h(Text, { style: [s.td, { width: 52 }, s.r] }, it.qtd ?? ''),
            h(Text, { style: [s.td, { width: 78 }, s.r] }, it.unit ? `R$ ${it.unit}` : ''),
            h(Text, { style: [s.td, { width: 84 }, s.r] }, it.total ? `R$ ${it.total}` : ''),
          ),
    ),
    h(View, { style: s.tr }, h(Text, { style: [s.td, { flex: 1, fontWeight: 700 }] }, 'TOTAL CONTRATADO'), h(Text, { style: [s.td, { width: 84, fontWeight: 700 }, s.r] }, `R$ ${campo('total')}`)),
  );
  const condicoes: El[] = doc.blocos.length
    ? [
        h(Text, { style: s.h2 }, 'CONDIÇÕES ESPECÍFICAS'),
        ...doc.blocos.flatMap((b, bi) => [
          h(Text, { key: `b${bi}`, style: { fontWeight: 700, marginTop: 6, marginBottom: 3 } }, `${bi + 1}. ${b.titulo}`),
          ...b.itens.map((t, ti) => h(View, { key: `b${bi}.${ti}`, style: s.item }, h(Text, { style: s.itemN }, `${bi + 1}.${ti + 1}.`), rico(preencher(t, c), s.itemT))),
        ]),
      ]
    : [];
  const anexoI = h(
    Page,
    { size: 'A4', style: s.page },
    ...cabecalho(),
    h(Text, { style: s.anexoT }, 'ANEXO I — CONDIÇÕES PARTICULARES, PLANILHA DE PREÇOS E ESCOPO'),
    h(Text, { style: s.h2 }, 'QUADRO COMPLEMENTAR — ITENS 05 A 20'),
    quadro(['q_regime', 'q_valor', 'q_valor_extenso', 'q_inicio', 'q_liberacao', 'q_prazo', 'q_marcos', 'q_docs', 'q_criterio', 'q_periodicidade', 'q_antecipacao', 'q_retencao', 'q_garantia', 'q_seguros', 'q_mat_contratante', 'q_mat_contratada', 'q_fat_direto', 'q_representante', 'ct_email', 'cd_email', 'cs_email']),
    h(Text, { style: s.h2 }, 'ESCOPO, PREÇOS E INTERFACES'),
    planilha,
    ...condicoes,
    assinaturas(['contratante', 'contratada', 'construtora']),
  );

  // ---- Anexo II
  const decl = doc.signatarios.declarante[0];
  const anexoII = h(
    Page,
    { size: 'A4', style: s.page },
    ...cabecalho(),
    h(Text, { style: s.anexoT }, 'ANEXO II — DECLARAÇÃO DE CAPACIDADE E REGULARIDADE DA CONTRATADA'),
    rico(`${campo('decl_nome')}, ${campo('decl_cargo')}, CPF ${campo('decl_cpf')}, representante legal de **${campo('cd_razao')}**, CNPJ ${campo('cd_cnpj')}, com sede em ${campo('cd_sede')}, declara, sob as penas da lei, para os fins do contrato de empreitada relativo à obra ${campo('obra_nome')}, que a CONTRATADA:`, s.p),
    ...doc.declaracao.map((d) => h(View, { key: d.numero, style: s.item }, h(Text, { style: s.itemN }, `${d.numero}.`), rico(`**${d.titulo}** ${preencher(d.texto, c)}`, s.itemT))),
    h(View, { style: [s.assBloco, { marginTop: 30 }] }, h(Text, { style: s.assLinha }, decl ? `${decl.nome}${decl.cargo ? `, ${decl.cargo}` : ''}` : '[A PREENCHER]'), h(Text, { style: { fontWeight: 700, fontSize: 8.5 } }, doc.razao.contratada || '[A PREENCHER]')),
  );

  const paginas: El[] = [corpo, anexoI, anexoII];
  if (doc.anexoIII) {
    paginas.push(h(Page, { size: 'A4', style: s.page }, ...cabecalho(), h(Text, { style: s.anexoT }, doc.anexoIII.titulo), rico(doc.anexoIII.texto, s.p)));
  }

  const buffer = await renderToBuffer(h(Document, { title: 'Contrato de empreitada', author: 'bid' }, ...paginas));
  const m = buffer.toString('latin1').match(/\/Type\s*\/Page(?![s])/g);
  return { buffer, paginas: m ? m.length : paginas.length };
}
