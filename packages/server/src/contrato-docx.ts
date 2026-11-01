import { strFromU8, strToU8, unzipSync, zipSync } from 'fflate';
import type { DocumentoResolvido } from '@bid/core';

/**
 * Motor de preenchimento da minuta .docx — porta tipada de
 * docs/contratos/ref/motor-docx.mjs (a especificação executável; mesmos passos
 * 1–8). Função pura sobre `word/document.xml`; o zip é tratado em
 * `preencherDocx`. Nada aqui monta texto de contrato: tudo vem do
 * DocumentoResolvido (core.resolverDocumento).
 */
const MAX_MODELO = 2 * 1024 * 1024; // modelo .docx ≤ 2 MB
const MAX_XML = 10 * 1024 * 1024; // XML inflado ≤ 10 MB
const LOGO_PATH = 'word/media/image1.png';
const AVISO_MINUTA = 'MINUTA PARA CONFERÊNCIA — NÃO VÁLIDA PARA ASSINATURA';

const esc = (s: unknown) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
/** Valor vindo do usuário (nome, cargo, bloco, anexo) nunca vira marcador do modelo. */
const semMarcador = (s: unknown) => String(s ?? '').replace(/\{\{/g, '{ {').replace(/\}\}/g, '} }');
const NUMERO_ITEM = /^\d+(\.\d+)*$/;
const MAX_BLOCOS_SIG = 20;
const semIds = (p: string) => p.replace(/ w14:(paraId|textId)="[^"]*"/g, '');

/** texto com **negrito** e quebras de linha → runs, herdando o rPr do run-base */
function runs(texto: string, rPr: string): string {
  const base = (rPr || '').replace(/<w:b\/>|<w:bCs\/>/g, '');
  const negrito = base ? base.replace('<w:rPr>', '<w:rPr><w:b/><w:bCs/>') : '<w:rPr><w:b/><w:bCs/></w:rPr>';
  return String(texto)
    .split(/(\*\*[^*]+\*\*)/)
    .filter(Boolean)
    .map((parte) => {
      const b = /^\*\*[^*]+\*\*$/.test(parte);
      const t = esc(b ? parte.slice(2, -2) : parte)
        .split(/\r?\n/)
        .join('</w:t><w:br/><w:t xml:space="preserve">');
      return `<w:r>${b ? negrito : base}<w:t xml:space="preserve">${t}</w:t></w:r>`;
    })
    .join('');
}

/** substitui, dentro de um parágrafo, o run que contém `marcador` pelos runs de `texto` */
function trocarRun(p: string, marcador: string, texto: string): string {
  const i = p.indexOf(marcador);
  if (i < 0) return p;
  const ini = Math.max(p.lastIndexOf('<w:r>', i), p.lastIndexOf('<w:r ', i));
  const fim = p.indexOf('</w:r>', i) + 6;
  const r = p.slice(ini, fim);
  return p.slice(0, ini) + runs(texto, (r.match(/<w:rPr>[\s\S]*?<\/w:rPr>/) || [''])[0]) + p.slice(fim);
}

type Par = { 0: string; index: number };
function paragrafos(x: string): Par[] {
  return [...x.matchAll(/<w:p[ >][\s\S]*?<\/w:p>/g)].map((m) => ({ 0: m[0], index: m.index ?? 0 }));
}
function trocarParagrafo(x: string, marcador: string, fn: (p: string) => string): string {
  for (const m of paragrafos(x)) if (m[0].includes(marcador)) return x.slice(0, m.index) + fn(m[0]) + x.slice(m.index + m[0].length);
  return x;
}

/** Marcadores simples ({{campo}}) presentes no XML do modelo, em ordem. */
export function marcadoresSimples(xml: string): string[] {
  const out: string[] = [];
  for (const m of xml.matchAll(/\{\{([a-z_]+)\}\}/g)) {
    const k = m[1]!;
    if (/^(it_|qual_)/.test(k) || k === 'blocos_anexo_i' || k.startsWith('anexo_iii_')) continue; // tratados nos passos 1–6
    if (!out.includes(k)) out.push(k);
  }
  return out;
}

/** Passos 1–8 do motor sobre o XML de word/document.xml. */
export function preencherXml(xml: string, doc: DocumentoResolvido): { xml: string; faltando: string[] } {
  let x = xml;
  const faltando: string[] = [];

  // 1. planilha: clona a linha-modelo por item; grupo em negrito, sem valores
  const i = x.indexOf('{{it_desc}}');
  if (i >= 0) {
    const rs = Math.max(x.lastIndexOf('<w:tr ', i), x.lastIndexOf('<w:tr>', i));
    const re = x.indexOf('</w:tr>', i) + 7;
    const linha = semIds(x.slice(rs, re));
    const linhas = (doc.itens || [])
      .map((it) => {
        const rec = it as unknown as Record<string, string | boolean | undefined>;
        let l = linha.replace(/\{\{it_(\w+)\}\}/g, (_, k: string) => esc(it.grupo && k !== 'desc' && k !== 'n' ? '' : (rec[k] as string | undefined) ?? ''));
        if (it.grupo) l = l.replace(/<w:rPr>/g, '<w:rPr><w:b/>').replace(/R\$ (<\/w:t>)/g, '$1');
        return l;
      })
      .join('');
    x = x.slice(0, rs) + linhas + x.slice(re);
  }

  // 2. itens das cláusulas (+ extras depois do item indicado, com o mesmo estilo)
  for (const m of paragrafos(x).reverse()) {
    const k = m[0].match(/\{\{cl:([\d.]+)\}\}/);
    if (!k) continue;
    const num = k[1]!;
    const texto = doc.clausulas?.[num];
    let p = trocarRun(m[0], k[0], texto == null ? 'Não se aplica.' : texto);
    for (const e of (doc.extras || []).filter((e) => e.apos === num && NUMERO_ITEM.test(e.numero)).reverse()) {
      const n = esc(e.numero);
      p += semIds(trocarRun(m[0].replace(`${num}. `, () => `${n}. `).replace(`${num}.<`, () => `${n}.<`), k[0], semMarcador(e.texto)));
    }
    x = x.slice(0, m.index) + p + x.slice(m.index + m[0].length);
  }

  // 3. qualificação das partes e declaração (Anexo II)
  for (const k of ['ct', 'cd', 'cs'] as const) {
    x = trocarParagrafo(x, `{{qual_${k}}}`, (p) => trocarRun(p, `{{qual_${k}}}`, doc.qualificacao?.[k] ? semMarcador(doc.qualificacao[k]) : `{{qual_${k}}}`));
  }
  for (const d of doc.declaracao || []) {
    x = trocarParagrafo(x, `{{decl:${d.numero}}}`, (p) => trocarRun(trocarRun(p, `{{decl_t:${d.numero}}}`, `**${semMarcador(d.titulo)}** `), `{{decl:${d.numero}}}`, semMarcador(d.texto)));
  }

  // 4. assinaturas: um bloco por signatário (linha, nome — cargo, razão — PARTE)
  for (const parte of ['contratante', 'contratada', 'construtora', 'declarante'] as const) {
    let m: Par | undefined;
    let voltas = 0;
    while (voltas++ < MAX_BLOCOS_SIG && (m = paragrafos(x).find((q) => q[0].includes(`{{sig:${parte}}}`)))) {
      const lista = doc.signatarios?.[parte] || [];
      const rotulo = parte === 'declarante' ? '' : ` — ${parte.toUpperCase()}`;
      const razao = parte === 'declarante' ? doc.razao?.contratada : doc.razao?.[parte];
      const linhaAss = parte === 'declarante' ? '' : '_________________________________\n';
      const alvo = m;
      const blocos = (lista.length ? lista : [{ nome: '', cargo: '' }]).map((s, j) =>
        semIds(trocarRun(alvo[0], `{{sig:${parte}}}`, semMarcador(`${j ? '\n' : ''}${linhaAss}${s.nome || '[A PREENCHER]'}${s.cargo ? ', ' + s.cargo : ''}\n**${razao || '[A PREENCHER]'}${rotulo}**`))),
      );
      if (!lista.length) faltando.push(`sig:${parte}`);
      x = x.slice(0, alvo.index) + blocos.join('') + x.slice(alvo.index + alvo[0].length);
    }
  }

  // 5. Anexo I – condições específicas (blocos). Sem blocos: some o título e o marcador.
  {
    const ps = paragrafos(x);
    const alvo = ps.findIndex((m) => m[0].includes('{{blocos_anexo_i}}'));
    if (alvo >= 1) {
      const cab = ps[alvo - 1]!;
      const corpo = ps[alvo]!;
      const novo = (doc.blocos || [])
        .map((b, bi) => semIds(trocarRun(corpo[0], '{{blocos_anexo_i}}', `**${bi + 1}. ${semMarcador(b.titulo)}**`)) + b.itens.map((t, ti) => semIds(trocarRun(corpo[0], '{{blocos_anexo_i}}', `${bi + 1}.${ti + 1}. ${semMarcador(t)}`))).join(''))
        .join('');
      x = x.slice(0, cab.index) + (novo ? cab[0] + novo : '') + x.slice(corpo.index + corpo[0].length);
    }
  }

  // 6. Anexo III (proposta). Sem anexo: remove a quebra de página, o título e o texto.
  {
    const ps = paragrafos(x);
    const t = ps.findIndex((m) => m[0].includes('{{anexo_iii_titulo}}'));
    if (t >= 1 && t + 1 < ps.length) {
      if (doc.anexoIII) {
        const a = doc.anexoIII;
        x = trocarParagrafo(x, '{{anexo_iii_texto}}', (p) => trocarRun(p, '{{anexo_iii_texto}}', semMarcador(a.texto)));
        x = trocarParagrafo(x, '{{anexo_iii_titulo}}', (p) => trocarRun(p, '{{anexo_iii_titulo}}', semMarcador(a.titulo)));
      } else {
        const ini = ps[t - 1]!.index;
        const fim = ps[t + 1]!.index + ps[t + 1]![0].length;
        x = x.slice(0, ini) + x.slice(fim);
      }
    }
  }

  // 7. marcadores simples (inclusive os que vieram dentro dos textos das cláusulas)
  x = x.replace(/\{\{([a-z_]+)\}\}/g, (_, k: string) => {
    const v = doc.campos?.[k];
    if (v == null || String(v).trim() === '') {
      faltando.push(k);
      return '[A PREENCHER]';
    }
    return esc(v).split(/\r?\n/).join('</w:t><w:br/><w:t xml:space="preserve">');
  });
  const sobra = x.match(/\{\{[^}]+\}\}/g);
  if (sobra) faltando.push(...sobra);

  // 8. versão final x minuta
  if (doc.final) x = x.replace(/<w:highlight w:val="yellow"\/>/g, '');
  else {
    x = x.replace(
      /<w:body>/,
      `<w:body><w:p><w:pPr><w:spacing w:after="160"/><w:jc w:val="center"/></w:pPr><w:r><w:rPr><w:b/><w:color w:val="B42318"/><w:sz w:val="22"/></w:rPr><w:t xml:space="preserve">${AVISO_MINUTA}</w:t></w:r></w:p>`,
    );
  }

  return { xml: x, faltando: [...new Set(faltando)] };
}

export interface PreencherDocxOpts {
  /** Logo PNG da construtora quando a marca pede outra (ex.: AMPLA); substitui word/media/image1.png. */
  logo?: Uint8Array | null;
}

/**
 * Abre o modelo .docx (zip), preenche word/document.xml, troca a logo quando
 * houver e devolve o novo .docx. Limites contra arquivo malicioso: modelo ≤ 2 MB,
 * XML inflado ≤ 10 MB (conferido no tamanho real, não no cabeçalho).
 */
export function preencherDocx(modelo: Uint8Array, doc: DocumentoResolvido, opts: PreencherDocxOpts = {}): { docx: Uint8Array; faltando: string[] } {
  if (modelo.byteLength > MAX_MODELO) throw new Error('Modelo .docx acima de 2 MB.');
  const z = unzipSync(modelo, { filter: (f) => f.originalSize <= MAX_XML });
  const docXml = z['word/document.xml'];
  if (!docXml) throw new Error('Modelo .docx sem word/document.xml.');
  for (const [nome, bytes] of Object.entries(z)) if (bytes.length > MAX_XML) throw new Error(`Entrada ${nome} grande demais no modelo.`);
  const { xml, faltando } = preencherXml(strFromU8(docXml), doc);
  const saida: Record<string, Uint8Array> = { ...z, 'word/document.xml': strToU8(xml) };
  if (opts.logo && z[LOGO_PATH]) saida[LOGO_PATH] = opts.logo;
  // Entradas de zip precisam ir como [dados, opções]; compressão padrão (DEFLATE)
  const entradas: Record<string, [Uint8Array, { level: 0 | 6 }]> = {};
  for (const [nome, bytes] of Object.entries(saida)) entradas[nome] = [bytes, { level: /\.(png|jpe?g)$/i.test(nome) ? 0 : 6 }];
  // [Content_Types].xml deve ser a primeira entrada (Word é tolerante, mas o validador reclama)
  const ordenado: Record<string, [Uint8Array, { level: 0 | 6 }]> = {};
  if (entradas['[Content_Types].xml']) ordenado['[Content_Types].xml'] = entradas['[Content_Types].xml'];
  for (const [n, v] of Object.entries(entradas)) if (n !== '[Content_Types].xml') ordenado[n] = v;
  return { docx: zipSync(ordenado), faltando };
}

/** XML de word/document.xml de um .docx (para listar marcadores do modelo). */
export function documentXmlDoDocx(docx: Uint8Array): string {
  const z = unzipSync(docx, { filter: (f) => f.name === 'word/document.xml' && f.originalSize <= MAX_XML });
  const d = z['word/document.xml'];
  if (!d) throw new Error('.docx sem word/document.xml');
  return strFromU8(d);
}
