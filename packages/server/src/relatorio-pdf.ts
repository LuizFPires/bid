import { carregarReactPdf } from './react-pdf';
import { SORA } from './fontes-sora';
import { pendenciasDaAnalise, textoPendencias, type AnaliseEqualizacao } from '@bid/core';

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

// Paleta do relatório de referência: navy, dourado, vermelho; tinta e cinzas.
const NAVY = '#141a33';
const GOLD = '#b8923a';
const RED = '#9b1c1c';
const INK = '#1c1d26';
const TEXT = '#3a3d4a';
const MUTED = '#7b7f8e';
const LINE = '#e3e5ec';
const SOFT = '#f4f5f8';
const CREAM = '#fbf6e9';
const OK_BG = '#e3f1e8';
const OK = '#246b45';
const WARN_BG = '#fbf0d9';
const WARN = '#8a5a0c';
const BAD_BG = '#fbe4e4';
const BAD = '#a3231d';
/** Cor de identificação de cada proposta (borda dos cartões e do quadro de riscos). */
const CORES = [NAVY, GOLD, RED, '#246b45', '#5b4b8a', '#0e6f86', '#8a5a0c'];

/** Sora não tem ≈ ✓ ✗ → ←: troca por equivalentes antes de desenhar. */
function limparGlifos<T>(v: T): T {
  const mapa: Record<string, string> = { '≈': '~', '✓': 'sim', '✗': 'não', '→': '->', '←': '<-' };
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
function pct(df: number, base: number): string {
  return `${((df / base) * 100).toFixed(1).replace('.', ',')}%`;
}
const MESES = ['JAN', 'FEV', 'MAR', 'ABR', 'MAI', 'JUN', 'JUL', 'AGO', 'SET', 'OUT', 'NOV', 'DEZ'];
function mesAno(iso: string): string {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? '' : `${MESES[d.getMonth()]}/${d.getFullYear()}`;
}
function dataBR(iso: string): string {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? '' : d.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric' });
}
/** Nome curto para cabeçalhos de tabela: primeiro bloco antes de "·", sem sufixos societários. */
function nomeCurto(nome: string): string {
  const [base, opcao] = nome.split(' · ');
  const limpo = (base ?? nome)
    .replace(/\b(ltda\.?|s\/?a\.?|me|epp|eireli|cia\.?)\b/gi, '')
    .replace(/\(.*?\)/g, '')
    .replace(/\s{2,}/g, ' ')
    .trim();
  const curto = limpo.length > 26 ? limpo.split(' ').slice(0, 2).join(' ') : limpo;
  const op = opcao?.replace(/\(.*?\)/g, '').replace(/\s{2,}/g, ' ').trim().slice(0, 22);
  return op ? `${curto} · ${op}` : curto || nome;
}

let fontesRegistradas = false;

/**
 * PDF do relatório de equalização no padrão do relatório técnico-comercial de
 * referência (Análise de Propostas ACM): cabeçalho corrido, seções numeradas
 * com kicker e manchete, cartões apresentado × equalizado, caixa "Leitura",
 * pontos que pesam na decisão, matriz lado a lado com selos, equalização na
 * mesma régua, forças e riscos por proposta, próximos passos e conclusão.
 * Retrato até 3 propostas; paisagem a partir de 4 (as tabelas precisam de largura).
 */
export async function renderRelatorioEqualizacaoPdf(d: RelatorioPdfDados): Promise<Buffer> {
  const { h, Document, Page, StyleSheet, Text, View, Font, renderToBuffer } = await carregarReactPdf();
  type El = ReturnType<typeof h>;

  if (!fontesRegistradas) {
    Font.register({ family: 'Sora', fonts: SORA.map((f) => ({ src: f.src, fontWeight: f.peso })) });
    Font.registerHyphenationCallback((w: string) => [w]);
    fontesRegistradas = true;
  }

  const a = limparGlifos(d.analise);
  const n = d.propostas.length;
  const paisagem = n >= 4;
  const PAD = 48;
  const nome = (pid: string) => d.propostas.find((p) => p.id === pid)?.nome ?? '—';
  const cor = (pid: string) => CORES[d.propostas.findIndex((p) => p.id === pid) % CORES.length] ?? NAVY;
  const ranking = [...d.propostas]
    .map((p) => ({ id: p.id, t: a.cards.find((c) => c.proposta_id === p.id)?.equalizado ?? a.equalizacao.totais.find((t) => t.proposta_id === p.id)?.total ?? p.valor ?? Infinity }))
    .sort((x, y) => x.t - y.t)
    .map((x) => x.id);
  const totais = new Map(a.equalizacao.totais.map((t) => [t.proposta_id, t.total] as const));
  const menorTotal = Math.min(...a.equalizacao.totais.map((t) => t.total ?? Infinity));
  const idMenor = a.equalizacao.totais.find((t) => t.total === menorTotal)?.proposta_id ?? null;
  const temEqualizado = a.cards.some((c) => c.equalizado != null);
  const rec = d.propostas.find((p) => p.id === a.recomendacao.proposta_id) ?? null;
  const pendencias = pendenciasDaAnalise(a, d.propostas.map((p) => ({ id: p.id, nome: p.nome, valor: p.valor })));

  const s = StyleSheet.create({
    page: { paddingTop: 64, paddingBottom: 56, paddingHorizontal: PAD, fontFamily: 'Sora', fontWeight: 400, fontSize: 9.5, color: TEXT },
    // cabeçalho e rodapé corridos
    topo: { position: 'absolute', top: 26, left: PAD, right: PAD, flexDirection: 'row', justifyContent: 'space-between', fontSize: 6.8, letterSpacing: 1.6, color: MUTED, fontWeight: 500 },
    foot: { position: 'absolute', left: PAD, right: PAD, bottom: 24, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', fontSize: 7.5, color: MUTED, borderTopWidth: 0.6, borderTopColor: LINE, paddingTop: 8 },
    footN: { fontWeight: 700, color: INK },
    // seções
    kicker: { fontSize: 7, letterSpacing: 2.2, color: RED, fontWeight: 700, marginBottom: 6 },
    h1: { fontSize: 20, fontWeight: 700, color: INK, lineHeight: 1.2, marginBottom: 6 },
    h2: { fontSize: 17, fontWeight: 700, color: INK, lineHeight: 1.2, marginBottom: 4 },
    lead: { fontSize: 10.5, color: TEXT, lineHeight: 1.5 },
    sec: { marginTop: 26, marginBottom: 12 },
    h3: { fontSize: 11.5, fontWeight: 700, color: INK, marginTop: 20, marginBottom: 10 },
    // cartões
    grid: { flexDirection: 'row', flexWrap: 'wrap', marginTop: 14, marginHorizontal: -4 },
    cardWrap: { paddingHorizontal: 4, marginBottom: 8 },
    card: { backgroundColor: SOFT, borderRadius: 7, borderTopWidth: 3, paddingHorizontal: 12, paddingTop: 10, paddingBottom: 10, minHeight: 64 },
    cardK: { fontSize: 6.6, letterSpacing: 1.4, color: TEXT, fontWeight: 600, lineHeight: 1.35 },
    cardV: { fontSize: 16, fontWeight: 700, color: INK, marginTop: 4, lineHeight: 1.15 },
    cardS: { fontSize: 7.4, color: MUTED, marginTop: 3, lineHeight: 1.35 },
    // caixa navy
    box: { backgroundColor: NAVY, borderRadius: 9, paddingHorizontal: 20, paddingVertical: 16, marginTop: 10 },
    boxK: { fontSize: 6.8, letterSpacing: 2.2, color: GOLD, fontWeight: 700, marginBottom: 7 },
    boxT: { fontSize: 10.5, color: '#fff', lineHeight: 1.55 },
    boxB: { fontWeight: 700 },
    // listas numeradas
    li: { flexDirection: 'row', alignItems: 'flex-start', marginBottom: 9 },
    num: { width: 20, height: 20, borderRadius: 10, marginRight: 10, alignItems: 'center', justifyContent: 'center', marginTop: 1 },
    numT: { color: '#fff', fontSize: 8.5, fontWeight: 700, lineHeight: 1, paddingTop: 1 },
    liT: { flex: 1, fontSize: 9.5, lineHeight: 1.5, color: TEXT },
    liB: { fontWeight: 700, color: INK },
    // tabelas
    table: { marginTop: 4 },
    tr: { flexDirection: 'row', borderBottomWidth: 0.6, borderBottomColor: LINE },
    trHead: { backgroundColor: NAVY, borderBottomWidth: 0 },
    th: { paddingVertical: 7, paddingHorizontal: 8, color: '#fff', fontSize: 7.6, fontWeight: 600, lineHeight: 1.3 },
    thSub: { color: '#b9bed4', fontWeight: 400, fontSize: 6.6 },
    td: { paddingVertical: 6, paddingHorizontal: 8, fontSize: 8, lineHeight: 1.4, color: TEXT },
    tdK: { fontWeight: 700, color: INK },
    trTotal: { backgroundColor: SOFT },
    tdTotal: { fontWeight: 700, color: INK, fontSize: 8.4 },
    cell: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'flex-start' },
    badge: { fontSize: 6.4, fontWeight: 700, letterSpacing: 0.5, paddingVertical: 2, paddingHorizontal: 5, borderRadius: 3, marginRight: 4, marginBottom: 2, lineHeight: 1.1 },
    ref: { fontSize: 6.6, color: MUTED, lineHeight: 1.3 },
    best: { color: OK, fontWeight: 700 },
    high: { color: BAD, fontWeight: 700 },
    // notas tingidas (borda esquerda)
    nota: { borderLeftWidth: 3, borderRadius: 4, paddingVertical: 10, paddingHorizontal: 14, marginTop: 10 },
    notaT: { fontSize: 9.3, lineHeight: 1.5, color: TEXT },
    // forças e riscos
    frGrid: { flexDirection: 'row', flexWrap: 'wrap', marginHorizontal: -4 },
    frWrap: { paddingHorizontal: 4, marginBottom: 8 },
    fr: { borderWidth: 0.6, borderColor: LINE, borderLeftWidth: 3, borderRadius: 6, paddingVertical: 10, paddingHorizontal: 12, minHeight: 60 },
    frHead: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 5 },
    frN: { fontSize: 10, fontWeight: 700, color: INK, flex: 1, paddingRight: 8 },
    frV: { fontSize: 8.6, fontWeight: 600, color: MUTED },
    frR: { fontSize: 7.6, color: MUTED, marginBottom: 6, lineHeight: 1.4 },
    frItem: { flexDirection: 'row', marginBottom: 2.5 },
    dot: { width: 4, height: 4, borderRadius: 2, marginTop: 4.5, marginRight: 6 },
    frT: { flex: 1, fontSize: 8.2, lineHeight: 1.45, color: TEXT },
    small: { fontSize: 7.2, color: MUTED, marginTop: 14, lineHeight: 1.45 },
  });

  // Largura das colunas: a primeira fixa, as demais dividem o resto.
  const firstPct = n >= 5 ? 16 : n === 4 ? 18 : 22;
  const firstW = { width: `${firstPct}%` };
  const colW = { width: `${(100 - firstPct) / n}%` };
  const porLinha = paisagem ? Math.min(n, 5) : Math.min(n, 3);
  const cardW = { width: `${100 / porLinha}%` };
  const frPorLinha = paisagem ? 3 : 2;
  const frW = { width: `${100 / frPorLinha}%` };

  function Kicker(n: string, t: string): El {
    return h(Text, { style: s.kicker }, `${n} · ${t.toUpperCase()}`);
  }
  function Sec(n: string, kicker: string, titulo: string, sub?: string | null): El {
    return h(
      View,
      { style: s.sec, wrap: false, minPresenceAhead: 140 },
      Kicker(n, kicker),
      h(Text, { style: s.h2 }, titulo),
      sub ? h(Text, { style: s.lead }, sub) : null,
    );
  }
  function Pill(texto: string, bg: string, fg: string): El {
    return h(Text, { style: [s.badge, { backgroundColor: bg, color: fg }] }, texto.toUpperCase());
  }
  /** Célula da matriz: selo colorido (ou o próprio texto curto como selo) + texto. */
  function Celula(cel: { texto: string | null; status: 'ok' | 'alerta' | 'falta' | 'neutro' } | undefined): El {
    if (!cel || (cel.status === 'neutro' && !cel.texto)) return h(Text, { style: { color: MUTED } }, '—');
    if (cel.status === 'neutro') return h(Text, null, cel.texto);
    const [bg, fg] = cel.status === 'ok' ? [OK_BG, OK] : cel.status === 'alerta' ? [WARN_BG, WARN] : [BAD_BG, BAD];
    const rotulo = cel.status === 'ok' ? 'OK' : cel.status === 'alerta' ? 'ATENÇÃO' : 'NÃO INFORMA';
    if (!cel.texto) return h(View, { style: s.cell }, Pill(rotulo, bg, fg));
    if (cel.texto.length <= 18) return h(View, { style: s.cell }, Pill(cel.texto, bg, fg));
    return h(View, { style: s.cell }, Pill(rotulo, bg, fg), h(Text, { style: { flex: 1, minWidth: 40 } }, cel.texto));
  }
  function headRow(primeira: string, sub?: (pid: string) => string | null): El {
    return h(
      View,
      { style: [s.tr, s.trHead], fixed: true },
      h(Text, { style: [s.th, firstW] }, primeira),
      ...d.propostas.map((p) => {
        const extra = sub?.(p.id) ?? null;
        return h(View, { key: p.id, style: [s.th, colW] }, h(Text, null, nomeCurto(p.nome)), extra ? h(Text, { style: s.thSub }, extra) : null);
      }),
    );
  }
  function Numerado(i: number, corCirculo: string, titulo: string, texto: string): El {
    return h(
      View,
      { key: `n${i}`, style: s.li, wrap: false },
      h(View, { style: [s.num, { backgroundColor: corCirculo }] }, h(Text, { style: s.numT }, String(i + 1))),
      h(Text, { style: s.liT }, [h(Text, { key: 't', style: s.liB }, `${titulo}. `), texto]),
    );
  }
  function Card(pid: string, rotulo: string, valor: number | null, sub: string | null, destaque: boolean): El {
    return h(
      View,
      { key: `${rotulo}-${pid}`, style: [s.cardWrap, cardW] },
      h(
        View,
        { style: [s.card, { borderTopColor: cor(pid) }, destaque ? { backgroundColor: CREAM } : {}] },
        h(Text, { style: s.cardK }, rotulo.toUpperCase()),
        h(Text, { style: s.cardV }, brlCurto(valor)),
        sub ? h(Text, { style: s.cardS }, sub) : null,
      ),
    );
  }

  const blocos: El[] = [];
  const secoes: number[] = [];
  const num2 = () => String(secoes.push(secoes.length + 1)).padStart(2, '0');

  // ---- 01 Sumário executivo ----
  blocos.push(
    h(
      View,
      { wrap: false },
      Kicker(num2(), 'Sumário executivo'),
      h(Text, { style: s.h1 }, a.titulo ?? `${n} propostas na mesma régua`),
      a.veredito ? h(Text, { style: s.lead }, a.veredito) : null,
    ),
  );
  // Cartões: apresentado (sempre) e equalizado (quando a IA calculou).
  blocos.push(
    h(
      View,
      { style: s.grid, wrap: false },
      ...d.propostas.map((p) => {
        const c = a.cards.find((x) => x.proposta_id === p.id);
        const ap = c?.apresentado ?? p.valor;
        const sub = ['apresentado', c?.base].filter(Boolean).join(' · ');
        return Card(p.id, nomeCurto(p.nome), ap, sub, false);
      }),
    ),
  );
  if (temEqualizado) {
    blocos.push(
      h(
        View,
        { style: [s.grid, { marginTop: 2 }], wrap: false },
        ...d.propostas.map((p) => {
          const c = a.cards.find((x) => x.proposta_id === p.id);
          return Card(p.id, `${nomeCurto(p.nome)} · equalizado`, c?.equalizado ?? totais.get(p.id) ?? null, c?.nota ?? null, ranking[0] === p.id);
        }),
      ),
    );
  }
  const leitura = a.conclusao ?? (rec ? a.recomendacao.justificativa : null);
  if (leitura) {
    blocos.push(h(View, { style: s.box, wrap: false }, h(Text, { style: s.boxK }, 'LEITURA'), h(Text, { style: s.boxT }, leitura)));
  }
  if (a.divergencias.length) {
    blocos.push(h(Text, { style: s.h3, minPresenceAhead: 80 }, 'O que mais pesa na decisão'));
    a.divergencias.forEach((x, i) => blocos.push(Numerado(i, [RED, NAVY, GOLD, NAVY][i % 4]!, x.titulo, x.texto)));
  }

  // ---- Lado a lado ----
  if (a.matriz.criterios.length || a.escopo.itens.length) {
    blocos.push(Sec(num2(), 'Lado a lado', 'O que cada proposta realmente inclui', 'A matriz separa o que está escrito do que está implícito. Onde a proposta é omissa, o risco fica com quem contrata.'));
    const linhas: El[] = [];
    a.matriz.criterios.forEach((crit, i) => {
      linhas.push(
        h(
          View,
          { key: `c${i}`, style: s.tr, wrap: false },
          h(Text, { style: [s.td, s.tdK, firstW] }, crit),
          ...d.propostas.map((p) => h(View, { key: p.id, style: [s.td, colW] }, Celula(a.matriz.porProposta.find((x) => x.proposta_id === p.id)?.celulas[i]))),
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
            const m = st === 'incluido' ? ['Incluído', OK_BG, OK] : st === 'parcial' ? ['Parcial', WARN_BG, WARN] : st === 'ausente' ? ['Ausente', BAD_BG, BAD] : null;
            return h(View, { key: p.id, style: [s.td, colW] }, m ? h(View, { style: s.cell }, Pill(m[0]!, m[1]!, m[2]!)) : h(Text, { style: { color: MUTED } }, '—'));
          }),
        ),
      );
    });
    linhas.push(
      h(
        View,
        { style: [s.tr, s.trTotal], wrap: false },
        h(Text, { style: [s.td, s.tdTotal, firstW] }, 'Valor apresentado'),
        ...d.propostas.map((p) => h(Text, { key: p.id, style: [s.td, s.tdTotal, colW] }, brl(a.cards.find((c) => c.proposta_id === p.id)?.apresentado ?? p.valor))),
      ),
    );
    blocos.push(h(View, { style: s.table }, headRow('Critério', (pid) => { const p = d.propostas.find((x) => x.id === pid); return p?.prazo != null ? `prazo ${p.prazo} dias` : null; }), ...linhas));
  }

  // ---- Equalização ----
  if (a.equalizacao.linhas.length || a.equalizacao.totais.some((t) => t.total != null)) {
    blocos.push(Sec(num2(), 'Equalização', rec && idMenor === rec.id ? 'Na mesma régua, a ordem se confirma' : 'Na mesma régua', a.equalizacao.base ? `Base comum: ${a.equalizacao.base}` : 'Mesmo escopo e mesma quantidade para todas as propostas.'));
    const linhas: El[] = a.equalizacao.linhas.map((l, i) =>
      h(
        View,
        { key: `l${i}`, style: s.tr, wrap: false },
        h(Text, { style: [s.td, s.tdK, firstW] }, l.item),
        ...d.propostas.map((p) => {
          const v = l.valores.find((x) => x.proposta_id === p.id);
          const semValor = v?.valor == null;
          return h(
            View,
            { key: p.id, style: [s.td, colW] },
            h(Text, { style: semValor && v?.nota ? { color: WARN, fontWeight: 600 } : undefined }, !semValor ? brl(v!.valor) : (v?.nota ?? '—')),
            !semValor && (v!.referencia || v!.nota) ? h(Text, { style: s.ref }, [v!.referencia ? 'ref. de mercado' : null, v!.nota].filter(Boolean).join(' · ')) : null,
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
          const t = totais.get(p.id) ?? null;
          return h(Text, { key: p.id, style: [s.td, s.tdTotal, colW, t != null && t === menorTotal ? s.best : {}] }, brl(t));
        }),
      ),
    );
    if (Number.isFinite(menorTotal) && idMenor) {
      linhas.push(
        h(
          View,
          { style: s.tr, wrap: false },
          h(Text, { style: [s.td, s.tdK, firstW] }, `Diferença para a ${nomeCurto(nome(idMenor))}`),
          ...d.propostas.map((p) => {
            const t = totais.get(p.id) ?? null;
            if (t == null) return h(Text, { key: p.id, style: [s.td, colW, { color: MUTED }] }, '—');
            const df = t - menorTotal;
            return h(Text, { key: p.id, style: [s.td, colW, df > 0 ? s.high : s.best] }, df > 0 ? `+${brlCurto(df)} (+${pct(df, menorTotal)})` : '—');
          }),
        ),
      );
    }
    blocos.push(h(View, { style: s.table }, headRow('Composição'), ...linhas));
  }

  // ---- Forças e riscos ----
  if (a.forcas_riscos.length) {
    blocos.push(Sec(num2(), 'Pontos de atenção', 'O que cada proposta esconde ou deixa de fora'));
    blocos.push(
      h(
        View,
        { style: s.frGrid },
        ...ranking
          .map((pid) => a.forcas_riscos.find((f) => f.proposta_id === pid))
          .filter((f): f is NonNullable<typeof f> => !!f)
          .map((f) => {
            const p = d.propostas.find((x) => x.id === f.proposta_id);
            const valor = a.cards.find((c) => c.proposta_id === f.proposta_id)?.equalizado ?? totais.get(f.proposta_id) ?? p?.valor ?? null;
            return h(
              View,
              { key: f.proposta_id, style: [s.frWrap, frW], wrap: false },
              h(
                View,
                { style: [s.fr, { borderLeftColor: cor(f.proposta_id) }] },
                h(View, { style: s.frHead }, h(Text, { style: s.frN }, nome(f.proposta_id)), h(Text, { style: s.frV }, brlCurto(valor))),
                f.resumo ? h(Text, { style: s.frR }, f.resumo) : null,
                ...f.a_favor.map((t, i) => h(View, { key: `a${i}`, style: s.frItem }, h(View, { style: [s.dot, { backgroundColor: OK }] }), h(Text, { style: s.frT }, t))),
                ...f.riscos.map((t, i) => h(View, { key: `r${i}`, style: s.frItem }, h(View, { style: [s.dot, { backgroundColor: BAD }] }), h(Text, { style: s.frT }, t))),
              ),
            );
          }),
      ),
    );
  } else if (a.achados.length) {
    blocos.push(Sec(num2(), 'Pontos de atenção', 'Achados por proposta'));
    a.achados.forEach((x, i) =>
      blocos.push(h(View, { key: i, style: [s.nota, { backgroundColor: CREAM, borderLeftColor: GOLD }], wrap: false }, h(Text, { style: s.notaT }, [h(Text, { key: 'f', style: s.liB }, `${x.fornecedor}. `), x.pontos.join(' · ')]))),
    );
  }

  // ---- Próximos passos ----
  if (a.proximos_passos.length) {
    blocos.push(Sec(num2(), 'Próximos passos', 'O que pedir a quem antes de fechar'));
    a.proximos_passos.forEach((x, i) => blocos.push(Numerado(i, i === 0 ? GOLD : NAVY, x.titulo, x.texto)));
  }

  // ---- Conclusão ----
  const semRec = a.recomendacao.justificativa ?? textoPendencias(pendencias) ?? a.conclusao ?? 'A IA não indicou uma vencedora com os dados disponíveis.';
  blocos.push(
    h(
      View,
      { style: [s.box, { marginTop: 22 }], wrap: false },
      h(Text, { style: s.boxK }, 'CONCLUSÃO'),
      rec
        ? h(Text, { style: s.boxT }, [h(Text, { key: 'r', style: s.boxB }, `${rec.nome} é a recomendação da análise. `), a.recomendacao.justificativa ?? ''])
        : h(Text, { style: s.boxT }, [h(Text, { key: 'r', style: s.boxB }, 'Sem vencedora indicada pela análise. '), semRec]),
    ),
  );
  if (!rec && pendencias.length && a.recomendacao.justificativa) {
    blocos.push(
      h(
        View,
        { style: [s.nota, { backgroundColor: CREAM, borderLeftColor: GOLD }], wrap: false },
        h(Text, { style: s.notaT }, [h(Text, { key: 'k', style: s.liB }, 'Onde atuar. '), pendencias.map((p) => `${p.nome}: ${p.faltas.map((f) => f.toLocaleLowerCase('pt-BR')).join(', ')}`).join(' · ')]),
      ),
    );
  }
  blocos.push(
    h(
      Text,
      { style: s.small },
      [
        `Propostas: ${d.propostas.map((p) => p.nome).join(' · ')}.`,
        d.referencia ? `Régua do projeto informada pelo usuário: ${d.referencia}.` : null,
        'Valores marcados "ref. de mercado" foram emprestados de outra proposta para equalizar. Relatório gerado com apoio de IA a partir das propostas arquivadas no bid; a recomendação é apoio — a decisão é do contratante.',
      ]
        .filter(Boolean)
        .join(' '),
    ),
  );

  const topoEsq = [d.obra, d.categoria, 'análise de propostas'].filter(Boolean).join(' · ').toUpperCase();
  const doc = h(
    Document,
    { title: `Equalização · ${d.categoria}`, author: d.emissor ?? 'bid', subject: d.obra ?? undefined },
    h(
      Page,
      { size: 'A4', orientation: paisagem ? 'landscape' : 'portrait', style: s.page },
      h(View, { style: s.topo, fixed: true }, h(Text, { style: { flex: 1, paddingRight: 24 } }, topoEsq), h(Text, null, mesAno(d.dataIso))),
      h(
        View,
        { style: s.foot, fixed: true },
        h(Text, { style: { flex: 1 } }, `${d.emissor ?? 'bid'} · Relatório técnico-comercial · ${dataBR(d.dataIso)}`),
        h(Text, { style: s.footN, render: ({ pageNumber }: { pageNumber: number }) => String(pageNumber).padStart(2, '0'), fixed: true }),
      ),
      ...blocos,
    ),
  );

  return renderToBuffer(doc);
}
