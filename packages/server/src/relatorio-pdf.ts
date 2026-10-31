import type { AnaliseEqualizacao } from '@bid/core';

/** Dados prontos para o PDF do relatório de equalização. */
export interface RelatorioPdfDados {
  categoria: string;
  obra: string | null;
  escopo: 'obra' | 'entre_obras';
  referencia: string | null;
  dataIso: string;
  /** Nome da organização / quem emite (rodapé). */
  emissor: string | null;
  propostas: {
    id: string;
    nome: string;
    valor: number | null;
    prazo: number | null;
    pagamento: string | null;
    garantia: string | null;
  }[];
  analise: AnaliseEqualizacao;
}

const NAVY = '#1c2150';
const GOLD = '#c9a24a';
const INK = '#191a22';
const MUTED = '#6b6f7e';
const LINE = '#e4e6ee';
const SOFT = '#f3f4f8';
const OK_BG = '#e7f3ec';
const OK = '#2e7d55';
const WARN_BG = '#fbf1e2';
const WARN = '#9a6412';
const BAD_BG = '#fbeaea';
const BAD = '#b3261e';

/** Helvetica não tem ≈ ✓ ✗ → etc.: troca por equivalentes antes de desenhar. */
function limparGlifos<T>(v: T): T {
  const mapa: Record<string, string> = { '≈': '~', '✓': 'sim', '✗': 'não', '→': '->', '←': '<-', '≥': '>=', '≤': '<=', '–': '-', '—': '-', '…': '...' };
  const re = new RegExp(Object.keys(mapa).join('|'), 'g');
  const fix = (x: unknown): unknown =>
    typeof x === 'string' ? x.replace(re, (m) => mapa[m] ?? m) : Array.isArray(x) ? x.map(fix) : x && typeof x === 'object' ? Object.fromEntries(Object.entries(x).map(([k, y]) => [k, fix(y)])) : x;
  return fix(v) as T;
}

function brl(v: number | null | undefined): string {
  if (v == null || !Number.isFinite(v)) return '—';
  return 'R$ ' + v.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}
function brlCurto(v: number | null | undefined): string {
  if (v == null || !Number.isFinite(v)) return '—';
  return 'R$ ' + Math.round(v).toLocaleString('pt-BR');
}
function dataBR(iso: string): string {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? '' : d.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric' });
}

/**
 * PDF do relatório de equalização, no padrão do relatório técnico-comercial de
 * referência: cabeçalho navy com kicker dourado, cartões apresentado ×
 * equalizado, caixa de leitura, seções numeradas (lado a lado, mesma régua,
 * divergências, forças e riscos, próximos passos) e conclusão.
 *
 * react e @react-pdf/renderer são carregados sob demanda e ficam externos ao
 * bundle (ver pdf.ts).
 */
export async function renderRelatorioEqualizacaoPdf(d: RelatorioPdfDados): Promise<Buffer> {
  const { createElement: h } = await import('react');
  const { Document, Page, StyleSheet, Text, View, renderToBuffer } = await import('@react-pdf/renderer');
  type El = ReturnType<typeof h>;

  const a = limparGlifos(d.analise);
  const nome = (pid: string) => d.propostas.find((p) => p.id === pid)?.nome ?? '—';
  const ranking = [...d.propostas]
    .map((p) => ({ id: p.id, t: a.cards.find((c) => c.proposta_id === p.id)?.equalizado ?? p.valor ?? Infinity }))
    .sort((x, y) => x.t - y.t)
    .map((x) => x.id);
  const pos = (pid: string) => ranking.indexOf(pid) + 1;
  const menorTotal = Math.min(...a.equalizacao.totais.map((t) => t.total ?? Infinity));

  const s = StyleSheet.create({
    page: { paddingTop: 44, paddingBottom: 54, paddingHorizontal: 44, fontFamily: 'Helvetica', fontSize: 9.5, color: INK, lineHeight: 1.4 },
    // cabeçalho
    head: { backgroundColor: NAVY, marginHorizontal: -44, marginTop: -44, paddingHorizontal: 44, paddingTop: 30, paddingBottom: 24, color: '#fff' },
    kicker: { fontSize: 7.5, letterSpacing: 2, color: GOLD, marginBottom: 8, fontFamily: 'Helvetica-Bold' },
    h1: { fontSize: 20, fontFamily: 'Helvetica-Bold', lineHeight: 1.15 },
    h1sub: { fontSize: 13, color: GOLD, marginTop: 4 },
    headMeta: { fontSize: 8.5, color: '#c9ccdf', marginTop: 10, lineHeight: 1.4 },
    // seções
    sec: { marginTop: 22, marginBottom: 8, flexDirection: 'row', alignItems: 'flex-start' },
    secN: { fontSize: 7.5, letterSpacing: 2, color: BAD, fontFamily: 'Helvetica-Bold', width: 26, marginTop: 4 },
    secT: { fontSize: 15, fontFamily: 'Helvetica-Bold' },
    secS: { fontSize: 9, color: MUTED, marginTop: 2 },
    lead: { fontSize: 10, color: '#3a3d4a', marginTop: 10, lineHeight: 1.5 },
    // cartões
    cards: { flexDirection: 'row', gap: 8, marginTop: 14 },
    card: { flex: 1, backgroundColor: SOFT, borderRadius: 8, padding: 10, borderTopWidth: 3, borderTopColor: LINE },
    cardLider: { borderTopColor: GOLD },
    cardNome: { fontSize: 8, fontFamily: 'Helvetica-Bold', letterSpacing: 1 },
    cardPos: { fontSize: 7.5, color: MUTED },
    cardK: { fontSize: 6.5, letterSpacing: 1.2, color: MUTED, marginTop: 6 },
    cardV: { fontSize: 15, fontFamily: 'Helvetica-Bold', marginTop: 1 },
    cardRow: { flexDirection: 'row', justifyContent: 'space-between', marginTop: 5, borderTopWidth: 0.5, borderTopColor: LINE, paddingTop: 4, fontSize: 8 },
    cardRowK: { color: MUTED },
    cardRowV: { fontFamily: 'Helvetica-Bold', maxWidth: 110, textAlign: 'right' },
    // caixa de leitura / conclusão
    box: { backgroundColor: NAVY, color: '#fff', borderRadius: 10, padding: 14, marginTop: 14 },
    boxK: { fontSize: 7, letterSpacing: 2, color: GOLD, fontFamily: 'Helvetica-Bold', marginBottom: 6 },
    boxT: { fontSize: 10, lineHeight: 1.5 },
    // tabelas
    table: { marginTop: 4, borderWidth: 0.5, borderColor: LINE, borderRadius: 6 },
    tr: { flexDirection: 'row', borderTopWidth: 0.5, borderTopColor: LINE },
    trHead: { backgroundColor: NAVY, borderTopWidth: 0 },
    th: { padding: 6, color: '#fff', fontSize: 7.5, fontFamily: 'Helvetica-Bold' },
    td: { padding: 6, fontSize: 8, lineHeight: 1.35 },
    tdK: { fontFamily: 'Helvetica-Bold', color: '#3a3d4a' },
    trTotal: { backgroundColor: SOFT },
    tdTotal: { fontFamily: 'Helvetica-Bold', fontSize: 8.5 },
    badge: { alignSelf: 'flex-start', fontSize: 6.5, fontFamily: 'Helvetica-Bold', letterSpacing: 0.6, paddingVertical: 2, paddingHorizontal: 5, borderRadius: 3, marginBottom: 2 },
    ref: { fontSize: 6.5, color: MUTED },
    best: { color: OK, fontFamily: 'Helvetica-Bold' },
    high: { color: BAD, fontFamily: 'Helvetica-Bold' },
    // listas numeradas
    li: { flexDirection: 'row', marginBottom: 7 },
    num: { width: 16, height: 16, borderRadius: 8, backgroundColor: NAVY, marginRight: 8, alignItems: 'center', justifyContent: 'center' },
    numT: { color: '#fff', fontSize: 8, fontFamily: 'Helvetica-Bold', lineHeight: 1 },
    liT: { flex: 1, fontSize: 9, lineHeight: 1.45 },
    // forças e riscos
    fr: { borderWidth: 0.5, borderColor: LINE, borderRadius: 8, padding: 10, marginBottom: 8 },
    frN: { fontSize: 11, fontFamily: 'Helvetica-Bold' },
    frR: { fontSize: 7, letterSpacing: 1, color: MUTED, marginTop: 1, marginBottom: 6 },
    frCols: { flexDirection: 'row', gap: 14 },
    frK: { fontSize: 7, letterSpacing: 1.2, fontFamily: 'Helvetica-Bold', marginBottom: 3 },
    frItem: { fontSize: 8.5, lineHeight: 1.4, marginBottom: 2 },
    // rodapé
    foot: { position: 'absolute', left: 44, right: 44, bottom: 24, flexDirection: 'row', justifyContent: 'space-between', fontSize: 7.5, color: MUTED, borderTopWidth: 0.5, borderTopColor: LINE, paddingTop: 6 },
    small: { fontSize: 7.5, color: MUTED, marginTop: 10, lineHeight: 1.4 },
  });

  const colW = (n: number) => ({ width: `${Math.max(18, (100 - 24) / n)}%` });
  const firstW = { width: '24%' };

  function Sec(n: string, t: string, sub?: string | null): El {
    return h(
      View,
      { style: s.sec, wrap: false },
      h(Text, { style: s.secN }, n),
      h(View, { style: { flex: 1 } }, h(Text, { style: s.secT }, t), sub ? h(Text, { style: s.secS }, sub) : null),
    );
  }
  function badge(status: 'ok' | 'alerta' | 'falta' | 'neutro'): El | null {
    if (status === 'neutro') return null;
    const cor = status === 'ok' ? [OK_BG, OK] : status === 'alerta' ? [WARN_BG, WARN] : [BAD_BG, BAD];
    const txt = status === 'ok' ? 'OK' : status === 'alerta' ? 'ATENÇÃO' : 'NÃO INFORMA';
    return h(Text, { style: [s.badge, { backgroundColor: cor[0], color: cor[1] }] }, txt);
  }
  function headRow(primeira: string): El {
    return h(
      View,
      { style: [s.tr, s.trHead], fixed: true },
      h(Text, { style: [s.th, firstW] }, primeira),
      ...d.propostas.map((p) => h(Text, { key: p.id, style: [s.th, colW(d.propostas.length)] }, p.nome)),
    );
  }

  const n = d.propostas.length;
  const blocos: El[] = [];

  // Cabeçalho
  blocos.push(
    h(
      View,
      { style: s.head },
      h(Text, { style: s.kicker }, `RELATÓRIO DE EQUALIZAÇÃO · ${d.categoria.toUpperCase()} · ${dataBR(d.dataIso)}`),
      h(Text, { style: s.h1 }, d.obra ? `${d.obra}` : 'Entre obras'),
      h(Text, { style: s.h1sub }, a.titulo ?? `${n} propostas na mesma régua`),
      h(
        Text,
        { style: s.headMeta },
        [d.referencia ? `Régua do projeto: ${d.referencia}` : null, `Propostas: ${d.propostas.map((p) => p.nome).join(' · ')}`]
          .filter(Boolean)
          .join('\n'),
      ),
    ),
  );

  // Sumário
  if (a.veredito) blocos.push(h(Text, { style: s.lead }, a.veredito));
  if (a.cards.length) {
    blocos.push(
      h(
        View,
        { style: s.cards, wrap: false },
        ...ranking.map((pid) => {
          const p = d.propostas.find((x) => x.id === pid)!;
          const c = a.cards.find((x) => x.proposta_id === pid);
          const eq = c?.equalizado ?? null;
          const ap = c?.apresentado ?? p.valor;
          return h(
            View,
            { key: pid, style: [s.card, pos(pid) === 1 ? s.cardLider : {}] },
            h(View, { style: { flexDirection: 'row', justifyContent: 'space-between' } }, h(Text, { style: s.cardNome }, p.nome.toUpperCase()), h(Text, { style: s.cardPos }, `${pos(pid)}º`)),
            h(Text, { style: s.cardK }, eq != null ? 'EQUALIZADO' : 'APRESENTADO'),
            h(Text, { style: s.cardV }, brlCurto(eq ?? ap)),
            eq != null ? h(View, { style: s.cardRow }, h(Text, { style: s.cardRowK }, 'Apresentado'), h(Text, { style: s.cardRowV }, brlCurto(ap))) : null,
            c?.base ? h(View, { style: s.cardRow }, h(Text, { style: s.cardRowK }, 'Base cotada'), h(Text, { style: s.cardRowV }, c.base)) : null,
            p.prazo != null ? h(View, { style: s.cardRow }, h(Text, { style: s.cardRowK }, 'Prazo'), h(Text, { style: s.cardRowV }, `${p.prazo} dias`)) : null,
            c?.nota ? h(View, { style: s.cardRow }, h(Text, { style: s.cardRowK }, 'Obs.'), h(Text, { style: [s.cardRowV, { color: WARN }] }, c.nota)) : null,
          );
        }),
      ),
    );
  }
  if (a.conclusao) {
    blocos.push(h(View, { style: s.box, wrap: false }, h(Text, { style: s.boxK }, 'LEITURA'), h(Text, { style: s.boxT }, a.conclusao)));
  }

  // 01 Lado a lado
  if (a.matriz.criterios.length || a.escopo.itens.length) {
    blocos.push(Sec('01', 'Lado a lado', 'O que cada proposta realmente inclui — e onde é omissa.'));
    const linhas: El[] = [];
    a.matriz.criterios.forEach((crit, i) => {
      linhas.push(
        h(
          View,
          { key: `c${i}`, style: s.tr, wrap: false },
          h(Text, { style: [s.td, s.tdK, firstW] }, crit),
          ...d.propostas.map((p) => {
            const cel = a.matriz.porProposta.find((x) => x.proposta_id === p.id)?.celulas[i];
            return h(View, { key: p.id, style: [s.td, colW(n)] }, cel ? badge(cel.status) : null, h(Text, null, cel?.texto ?? '—'));
          }),
        ),
      );
    });
    a.escopo.itens.forEach((item, i) => {
      linhas.push(
        h(
          View,
          { key: `e${i}`, style: s.tr, wrap: false },
          h(Text, { style: [s.td, s.tdK, firstW] }, item),
          ...d.propostas.map((p) => {
            const st = a.escopo.porProposta.find((x) => x.proposta_id === p.id)?.status[i] ?? 'na';
            const m = st === 'incluido' ? ['INCLUÍDO', OK_BG, OK] : st === 'parcial' ? ['PARCIAL', WARN_BG, WARN] : st === 'ausente' ? ['AUSENTE', BAD_BG, BAD] : ['—', SOFT, MUTED];
            return h(View, { key: p.id, style: [s.td, colW(n)] }, h(Text, { style: [s.badge, { backgroundColor: m[1], color: m[2] }] }, m[0]));
          }),
        ),
      );
    });
    linhas.push(
      h(
        View,
        { style: [s.tr, s.trTotal], wrap: false },
        h(Text, { style: [s.td, s.tdTotal, firstW] }, 'Apresentado'),
        ...d.propostas.map((p) => h(Text, { key: p.id, style: [s.td, s.tdTotal, colW(n)] }, brl(p.valor))),
      ),
    );
    blocos.push(h(View, { style: s.table }, headRow('Critério'), ...linhas));
  }

  // 02 Mesma régua
  if (a.equalizacao.linhas.length) {
    blocos.push(Sec('02', 'Na mesma régua', a.equalizacao.base ?? 'Mesmo escopo e mesma quantidade para todas.'));
    const linhas: El[] = a.equalizacao.linhas.map((l, i) =>
      h(
        View,
        { key: `l${i}`, style: s.tr, wrap: false },
        h(Text, { style: [s.td, s.tdK, firstW] }, l.item),
        ...d.propostas.map((p) => {
          const v = l.valores.find((x) => x.proposta_id === p.id);
          return h(
            View,
            { key: p.id, style: [s.td, colW(n)] },
            h(Text, null, v?.valor != null ? brl(v.valor) : (v?.nota ?? '—')),
            v?.valor != null && (v.referencia || v.nota) ? h(Text, { style: s.ref }, [v.referencia ? 'ref.' : null, v.nota].filter(Boolean).join(' · ')) : null,
          );
        }),
      ),
    );
    linhas.push(
      h(
        View,
        { style: [s.tr, s.trTotal], wrap: false },
        h(Text, { style: [s.td, s.tdTotal, firstW] }, 'Total equalizado'),
        ...d.propostas.map((p) => {
          const t = a.equalizacao.totais.find((x) => x.proposta_id === p.id)?.total ?? null;
          return h(Text, { key: p.id, style: [s.td, s.tdTotal, colW(n), t != null && t === menorTotal ? s.best : {}] }, brl(t));
        }),
      ),
    );
    if (Number.isFinite(menorTotal)) {
      linhas.push(
        h(
          View,
          { style: s.tr, wrap: false },
          h(Text, { style: [s.td, s.tdK, firstW] }, 'Diferença para a menor'),
          ...d.propostas.map((p) => {
            const t = a.equalizacao.totais.find((x) => x.proposta_id === p.id)?.total ?? null;
            if (t == null) return h(Text, { key: p.id, style: [s.td, colW(n)] }, '—');
            const df = t - menorTotal;
            return h(Text, { key: p.id, style: [s.td, colW(n), df > 0 ? s.high : s.best] }, df > 0 ? `+${brl(df)} (+${((df / menorTotal) * 100).toFixed(1).replace('.', ',')}%)` : '—');
          }),
        ),
      );
    }
    blocos.push(h(View, { style: s.table }, headRow('Composição'), ...linhas));
  }

  // 03 Divergências
  if (a.divergencias.length) {
    blocos.push(Sec('03', 'Divergências que mudam a decisão'));
    a.divergencias.forEach((x, i) =>
      blocos.push(h(View, { key: `d${i}`, style: s.li, wrap: false }, h(View, { style: s.num }, h(Text, { style: s.numT }, String(i + 1))), h(Text, { style: s.liT }, [h(Text, { key: 't', style: { fontFamily: 'Helvetica-Bold' } }, `${x.titulo}. `), x.texto]))),
    );
  }

  // 04 Forças e riscos
  if (a.forcas_riscos.length) {
    blocos.push(Sec('04', 'Forças e riscos de cada proposta'));
    ranking
      .map((pid) => a.forcas_riscos.find((f) => f.proposta_id === pid))
      .filter((f): f is NonNullable<typeof f> => !!f)
      .forEach((f) =>
        blocos.push(
          h(
            View,
            { key: f.proposta_id, style: s.fr, wrap: false },
            h(Text, { style: s.frN }, nome(f.proposta_id)),
            f.resumo ? h(Text, { style: s.frR }, f.resumo.toUpperCase()) : null,
            h(
              View,
              { style: s.frCols },
              h(View, { style: { flex: 1 } }, h(Text, { style: [s.frK, { color: OK }] }, 'A FAVOR'), ...f.a_favor.map((t, i) => h(Text, { key: i, style: s.frItem }, `• ${t}`))),
              h(View, { style: { flex: 1 } }, h(Text, { style: [s.frK, { color: BAD }] }, 'RISCOS'), ...f.riscos.map((t, i) => h(Text, { key: i, style: s.frItem }, `• ${t}`))),
            ),
          ),
        ),
      );
  } else if (a.achados.length) {
    blocos.push(Sec('04', 'Achados'));
    a.achados.forEach((x, i) => blocos.push(h(Text, { key: i, style: s.liT }, [h(Text, { key: 'f', style: { fontFamily: 'Helvetica-Bold' } }, `${x.fornecedor}: `), x.pontos.join(' · ')])));
  }

  // 05 Próximos passos
  if (a.proximos_passos.length) {
    blocos.push(Sec('05', 'Próximos passos recomendados'));
    a.proximos_passos.forEach((x, i) =>
      blocos.push(h(View, { key: `p${i}`, style: s.li, wrap: false }, h(View, { style: [s.num, i === 0 ? { backgroundColor: GOLD } : {}] }, h(Text, { style: s.numT }, String(i + 1))), h(Text, { style: s.liT }, [h(Text, { key: 't', style: { fontFamily: 'Helvetica-Bold' } }, `${x.titulo}. `), x.texto]))),
    );
  }

  // Recomendação / conclusão
  const rec = d.propostas.find((p) => p.id === a.recomendacao.proposta_id);
  blocos.push(
    h(
      View,
      { style: s.box, wrap: false },
      h(Text, { style: s.boxK }, 'CONCLUSÃO'),
      h(Text, { style: s.boxT }, rec ? `${rec.nome}. ${a.recomendacao.justificativa ?? ''}` : (a.recomendacao.justificativa ?? a.conclusao ?? 'Sem recomendação conclusiva.')),
    ),
  );
  blocos.push(
    h(
      Text,
      { style: s.small },
      'Relatório gerado com apoio de IA (Claude) a partir das propostas arquivadas no bid; valores marcados "ref." foram emprestados de outra proposta para equalizar. A recomendação é apoio — a decisão é do contratante.',
    ),
  );

  const doc = h(
    Document,
    { title: `Equalização · ${d.categoria}`, author: d.emissor ?? 'bid' },
    h(
      Page,
      { size: 'A4', style: s.page },
      ...blocos,
      h(
        View,
        { style: s.foot, fixed: true },
        h(Text, null, `${d.emissor ?? 'bid'} · Relatório de equalização · ${d.categoria}`),
        h(Text, { render: ({ pageNumber, totalPages }: { pageNumber: number; totalPages: number }) => `${pageNumber} / ${totalPages}` }),
      ),
    ),
  );

  return renderToBuffer(doc);
}
