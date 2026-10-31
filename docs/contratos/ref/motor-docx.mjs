// Motor de REFERÊNCIA do preenchimento da minuta (word/document.xml).
// É a especificação executável de SPEC-contratos.md §7. Em produção vira
// packages/server/src/contrato-docx.ts (mesma lógica, tipada; zip com fflate).
// Função pura: recebe o XML do modelo + o "documento resolvido" e devolve o XML.
//
// documento resolvido (montado por packages/core a partir do contrato):
// {
//   campos:     { q_valor: '1.234,56', obra_nome: '…', … }          // marcadores simples {{x}}
//   clausulas:  { '3.1': 'texto com **negrito** e {{q_inicio}}', … } // {{cl:N.N}}; null = "Não se aplica."
//   extras:     [{ apos: '3.6', numero: '3.7', texto: '…' }]         // itens incluídos por bloco
//   qualificacao: { ct: '…', cd: '…', cs: '…' }                       // {{qual_ct}} …
//   declaracao: [{ numero: '1', titulo: '…', texto: '…' }]            // {{decl_t:N}} {{decl:N}}
//   signatarios: { contratante: [{ nome, cargo }], contratada: [...], construtora: [...], declarante: [...] }
//   razao:      { contratante: '…', contratada: '…', construtora: '…' }
//   itens:      [{ grupo?: true, n, desc, und, qtd, unit, total }]  // já formatados pt-BR
//   blocos:     [{ titulo: '…', itens: ['…', '…'] }]                  // Anexo I – Condições específicas
//   anexoIII:   null | { titulo: 'ANEXO III – PROPOSTA COMERCIAL', texto: '…' }
//   final:      boolean   // true = emissão (remove destaque amarelo); false = minuta com aviso
// }
// Retorno: { xml, faltando: string[] }  — faltando = marcadores sem valor (bloqueia emissão).

const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const T = /<w:t(?: [^>]*)?>[^<]*<\/w:t>/g;
const semIds = (p) => p.replace(/ w14:(paraId|textId)="[^"]*"/g, '');

// texto com **negrito** e quebras de linha → sequência de runs, herdando o rPr do run-base
function runs(texto, rPr) {
  const base = (rPr || '').replace(/<w:b\/>|<w:bCs\/>/g, '');
  const negrito = base ? base.replace('<w:rPr>', '<w:rPr><w:b/><w:bCs/>') : '<w:rPr><w:b/><w:bCs/></w:rPr>';
  return String(texto).split(/(\*\*[^*]+\*\*)/).filter(Boolean).map((parte) => {
    const b = /^\*\*[^*]+\*\*$/.test(parte);
    const t = esc(b ? parte.slice(2, -2) : parte).split(/\r?\n/).join('</w:t><w:br/><w:t xml:space="preserve">');
    return `<w:r>${b ? negrito : base}<w:t xml:space="preserve">${t}</w:t></w:r>`;
  }).join('');
}

// substitui, dentro de um parágrafo, o run que contém `marcador` pelos runs de `texto`
function trocarRun(p, marcador, texto) {
  const i = p.indexOf(marcador);
  if (i < 0) return p;
  const ini = Math.max(p.lastIndexOf('<w:r>', i), p.lastIndexOf('<w:r ', i));
  const fim = p.indexOf('</w:r>', i) + 6;
  const r = p.slice(ini, fim);
  return p.slice(0, ini) + runs(texto, (r.match(/<w:rPr>.*?<\/w:rPr>/s) || [''])[0]) + p.slice(fim);
}

function paragrafos(x) { return [...x.matchAll(/<w:p[ >].*?<\/w:p>/gs)]; }
function trocarParagrafo(x, marcador, fn) {
  for (const m of paragrafos(x)) if (m[0].includes(marcador)) return x.slice(0, m.index) + fn(m[0]) + x.slice(m.index + m[0].length);
  return x;
}

export function preencher(xml, doc) {
  let x = xml;
  const faltando = [];

  // 1. planilha: clona a linha-modelo por item; linha de grupo em negrito, sem valores
  const i = x.indexOf('{{it_desc}}');
  if (i >= 0) {
    const rs = Math.max(x.lastIndexOf('<w:tr ', i), x.lastIndexOf('<w:tr>', i));
    const re = x.indexOf('</w:tr>', i) + 7;
    const linha = semIds(x.slice(rs, re));
    const linhas = (doc.itens || []).map((it) => {
      let l = linha.replace(/\{\{it_(\w+)\}\}/g, (_, k) => esc(it.grupo && k !== 'desc' && k !== 'n' ? '' : it[k] ?? ''));
      if (it.grupo) l = l.replace(/<w:rPr>/g, '<w:rPr><w:b/>').replace(/R\$ (<\/w:t>)/g, '$1');
      return l;
    }).join('');
    x = x.slice(0, rs) + linhas + x.slice(re);
  }

  // 2. itens das cláusulas (+ extras inseridos depois do item indicado, com o mesmo estilo)
  for (const m of paragrafos(x).reverse()) {
    const k = m[0].match(/\{\{cl:([\d.]+)\}\}/);
    if (!k) continue;
    const num = k[1];
    const texto = doc.clausulas?.[num];
    let p = trocarRun(m[0], k[0], texto == null ? 'Não se aplica.' : texto);
    for (const e of (doc.extras || []).filter((e) => e.apos === num).reverse()) {
      p += semIds(trocarRun(m[0].replace(`${num}. `, `${e.numero}. `).replace(`${num}.<`, `${e.numero}.<`), k[0], e.texto));
    }
    x = x.slice(0, m.index) + p + x.slice(m.index + m[0].length);
  }

  // 3. qualificação das partes e declaração (Anexo II)
  for (const k of ['ct', 'cd', 'cs']) x = trocarParagrafo(x, `{{qual_${k}}}`, (p) => trocarRun(p, `{{qual_${k}}}`, doc.qualificacao?.[k] ?? '{{qual_' + k + '}}'));
  for (const d of doc.declaracao || []) {
    x = trocarParagrafo(x, `{{decl:${d.numero}}}`, (p) => trocarRun(trocarRun(p, `{{decl_t:${d.numero}}}`, `**${d.titulo}** `), `{{decl:${d.numero}}}`, d.texto));
  }

  // 4. assinaturas: um bloco por signatário (linha, nome — cargo, razão — PARTE)
  for (const parte of ['contratante', 'contratada', 'construtora', 'declarante']) {
    let m;
    while ((m = paragrafos(x).find((m) => m[0].includes(`{{sig:${parte}}}`)))) {
      const lista = doc.signatarios?.[parte] || [];
      const rotulo = parte === 'declarante' ? '' : ` — ${parte.toUpperCase()}`;
      const razao = parte === 'declarante' ? doc.razao?.contratada : doc.razao?.[parte];
      const linhaAss = parte === 'declarante' ? '' : '_________________________________\n';
      const blocos = (lista.length ? lista : [{ nome: '', cargo: '' }]).map((s, j) =>
        semIds(trocarRun(m[0], `{{sig:${parte}}}`, `${j ? '\n' : ''}${linhaAss}${s.nome || '[A PREENCHER]'}${s.cargo ? ', ' + s.cargo : ''}\n**${razao || '[A PREENCHER]'}${rotulo}**`)));
      if (!lista.length) faltando.push(`sig:${parte}`);
      x = x.slice(0, m.index) + blocos.join('') + x.slice(m.index + m[0].length);
    }
  }

  // 5. Anexo I – condições específicas (blocos). Sem blocos: some o título e o marcador.
  {
    const ps = paragrafos(x);
    const alvo = ps.findIndex((m) => m[0].includes('{{blocos_anexo_i}}'));
    if (alvo >= 0) {
      const cab = ps[alvo - 1], corpo = ps[alvo];
      const novo = (doc.blocos || []).map((b, bi) =>
        semIds(trocarRun(corpo[0], '{{blocos_anexo_i}}', `**${bi + 1}. ${b.titulo}**`)) +
        b.itens.map((t, ti) => semIds(trocarRun(corpo[0], '{{blocos_anexo_i}}', `${bi + 1}.${ti + 1}. ${t}`))).join('')).join('');
      x = x.slice(0, cab.index) + (novo ? cab[0] + novo : '') + x.slice(corpo.index + corpo[0].length);
    }
  }

  // 6. Anexo III (proposta). Sem anexo: remove a quebra de página, o título e o texto.
  {
    const ps = paragrafos(x);
    const t = ps.findIndex((m) => m[0].includes('{{anexo_iii_titulo}}'));
    if (t >= 0) {
      if (doc.anexoIII) {
        x = trocarParagrafo(x, '{{anexo_iii_texto}}', (p) => trocarRun(p, '{{anexo_iii_texto}}', doc.anexoIII.texto));
        x = trocarParagrafo(x, '{{anexo_iii_titulo}}', (p) => trocarRun(p, '{{anexo_iii_titulo}}', doc.anexoIII.titulo));
      } else {
        const ini = ps[t - 1].index, fim = ps[t + 1].index + ps[t + 1][0].length;
        x = x.slice(0, ini) + x.slice(fim);
      }
    }
  }

  // 7. marcadores simples (inclusive os que vieram dentro dos textos das cláusulas)
  x = x.replace(/\{\{([a-z_]+)\}\}/g, (_, k) => {
    const v = doc.campos?.[k];
    if (v == null || String(v).trim() === '') { faltando.push(k); return '[A PREENCHER]'; }
    return esc(v).split(/\r?\n/).join('</w:t><w:br/><w:t xml:space="preserve">');
  });
  const sobra = x.match(/\{\{[^}]+\}\}/g);
  if (sobra) faltando.push(...sobra);

  // 8. versão final x minuta
  if (doc.final) x = x.replace(/<w:highlight w:val="yellow"\/>/g, '');
  else x = x.replace(/<w:body>/, '<w:body><w:p><w:pPr><w:spacing w:after="160"/><w:jc w:val="center"/></w:pPr><w:r><w:rPr><w:b/><w:color w:val="B42318"/><w:sz w:val="22"/></w:rPr><w:t xml:space="preserve">MINUTA PARA CONFERÊNCIA — NÃO VÁLIDA PARA ASSINATURA</w:t></w:r></w:p>');

  return { xml: x, faltando: [...new Set(faltando)] };
}
