import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { textoDoDocumento, type DocumentoResolvido } from '@bid/core';
import { documentXmlDoDocx, marcadoresSimples, preencherDocx, preencherXml } from './contrato-docx';
import { renderContratoV2Pdf } from './contrato-pdf';
import { textoDeDocx } from './docx';

/**
 * O modelo e o catálogo são PRIVADOS (docs/contratos/_privado, fora do git):
 * os testes que dependem deles rodam só quando a pasta existe (skipIf).
 */
const PRIV = resolve(__dirname, '../../../docs/contratos/_privado');
const MODELO = resolve(PRIV, 'modelo-empreitada-v1.docx');
const CATALOGO = resolve(PRIV, 'clausulas-v1.json');
const CASO = resolve(__dirname, '../../../docs/contratos/casos/caso-ficticio-01.json');
const temModelo = existsSync(MODELO) && existsSync(CATALOGO);

type Catalogo = { clausulas: { clausula: string; titulo: string; itens: { numero: string; texto: string }[] }[]; anexo_ii: { numero: string; titulo: string; texto: string }[] };

/** Monta o DocumentoResolvido do caso fictício como `ref/testar-motor.mjs` faz. */
function docDoCaso(catalogo: Catalogo, final: boolean): DocumentoResolvido {
  const caso = JSON.parse(readFileSync(CASO, 'utf8')) as Record<string, unknown> & { suprimidos?: string[] };
  const clausulas: Record<string, string | null> = {};
  for (const c of catalogo.clausulas) for (const i of c.itens) clausulas[i.numero] = i.texto;
  for (const n of caso.suprimidos ?? []) clausulas[n] = null;
  return { ...(caso as unknown as DocumentoResolvido), clausulas, declaracao: catalogo.anexo_ii, final, _origens: {} };
}

describe('contrato-docx (motor)', () => {
  it('preencherXml: planilha, cláusula, suprimido, extra, assinaturas, blocos, anexo III, campos e aviso', () => {
    const xml = [
      '<w:document><w:body>',
      '<w:tbl><w:tr w14:paraId="1"><w:tc><w:p><w:r><w:t>{{it_n}}</w:t></w:r></w:p></w:tc><w:tc><w:p><w:r><w:t>{{it_desc}}</w:t></w:r></w:p></w:tc><w:tc><w:p><w:r><w:t>R$ {{it_total}}</w:t></w:r></w:p></w:tc></w:tr></w:tbl>',
      '<w:p><w:r><w:rPr><w:b/></w:rPr><w:t>3.6. </w:t></w:r><w:r><w:rPr><w:highlight w:val="yellow"/></w:rPr><w:t>{{cl:3.6}}</w:t></w:r></w:p>',
      '<w:p><w:r><w:t>6.3.1. </w:t></w:r><w:r><w:t>{{cl:6.3.1}}</w:t></w:r></w:p>',
      '<w:p><w:r><w:t>{{qual_ct}}</w:t></w:r></w:p>',
      '<w:p><w:r><w:t>{{sig:construtora}}</w:t></w:r></w:p>',
      '<w:p><w:r><w:t>CONDIÇÕES ESPECÍFICAS</w:t></w:r></w:p><w:p><w:r><w:t>{{blocos_anexo_i}}</w:t></w:r></w:p>',
      '<w:p><w:r><w:br w:type="page"/></w:r></w:p><w:p><w:r><w:t>{{anexo_iii_titulo}}</w:t></w:r></w:p><w:p><w:r><w:t>{{anexo_iii_texto}}</w:t></w:r></w:p>',
      '<w:p><w:r><w:t>Foro: {{obra_foro}} / {{q_seguros}}</w:t></w:r></w:p>',
      '</w:body></w:document>',
    ].join('');
    const doc: DocumentoResolvido = {
      campos: { obra_foro: 'Cidade Exemplo/MG' },
      clausulas: { '3.6': 'Texto **3.6** com {{obra_foro}}.', '6.3.1': null },
      extras: [{ apos: '3.6', numero: '3.7', texto: 'Extra.' }],
      qualificacao: { ct: 'CT qualificada', cd: '', cs: '' },
      declaracao: [],
      signatarios: { contratante: [], contratada: [], construtora: [{ nome: 'Diretor Um', cargo: 'Diretor' }, { nome: 'Diretor {{sig:construtora}} Dois', cargo: 'Diretor' }], declarante: [] },
      razao: { contratante: '', contratada: '', construtora: 'Construtora Exemplo S.A.' },
      itens: [{ grupo: true, n: '1', desc: 'GRUPO' }, { n: '1.1', desc: 'Item & cia', und: 'un', qtd: '1', unit: '2,00', total: '2,00' }],
      blocos: [{ titulo: 'Ensaios', itens: ['PIT em 10%.'] }],
      anexoIII: null,
      final: false,
      _origens: {},
    };
    const { xml: out, faltando } = preencherXml(xml, doc);
    expect(faltando).toEqual(['q_seguros']);
    expect(out).toContain('Item &amp; cia');
    expect((out.match(/<w:tr/g) ?? []).length).toBe(2); // linha-modelo clonada por item
    expect(out).toContain('<w:rPr><w:b/><w:rPr>'.slice(0, 0) + 'GRUPO'); // grupo presente
    expect(out).not.toMatch(/R\$ <\/w:t>[\s\S]*GRUPO/); // "R$ " removido na linha de grupo
    expect(out).toContain('Não se aplica.');
    expect(out.indexOf('3.7. ')).toBeGreaterThan(out.indexOf('3.6. '));
    expect(out).toMatch(/<w:rPr><w:b\/><w:bCs\/>[^<]*<w:highlight w:val="yellow"\/><\/w:rPr><w:t xml:space="preserve">3\.6<\/w:t>/); // negrito interno herda o rPr
    expect((out.match(/CONSTRUTORA<\/w:t>/g) ?? []).length).toBe(2); // 2 blocos de assinatura
    expect(out).toContain('Diretor { {sig:construtora} } Dois'); // valor do usuário não vira marcador
    expect(out).toContain('1. Ensaios');
    expect(out).toContain('1.1. PIT em 10%.');
    expect(out).not.toContain('anexo_iii'); // sem Anexo III: quebra + título + texto removidos
    expect(out).not.toContain('{{');
    expect(out).toContain('[A PREENCHER]');
    expect(out).toContain('MINUTA PARA CONFERÊNCIA');
    expect(out).toContain('<w:highlight w:val="yellow"/>');
    const final = preencherXml(xml, { ...doc, final: true, campos: { ...doc.campos, q_seguros: 'RC' } });
    expect(final.faltando).toEqual([]);
    expect(final.xml).not.toContain('<w:highlight w:val="yellow"/>');
    expect(final.xml).not.toContain('MINUTA PARA CONFERÊNCIA');
    expect(marcadoresSimples(xml)).toEqual(['obra_foro', 'q_seguros']);
  });

  it.skipIf(!temModelo)('caso fictício contra o modelo privado: faltando = [], sem {{, planilha, suprimido, extra, construtora 2x, texto paridade', () => {
    const catalogo = JSON.parse(readFileSync(CATALOGO, 'utf8')) as Catalogo;
    const modelo = new Uint8Array(readFileSync(MODELO));
    const doc = docDoCaso(catalogo, false);
    const { docx, faltando } = preencherDocx(modelo, doc);
    expect(faltando).toEqual([]);
    const xml = documentXmlDoDocx(docx);
    expect(xml).not.toContain('{{');
    expect((xml.match(/Estaca hélice contínua Ø40 cm/g) ?? []).length).toBeGreaterThanOrEqual(1);
    expect(xml).toContain('Não se aplica.');
    expect(xml.indexOf('3.7. ')).toBeGreaterThan(xml.indexOf('3.6. '));
    expect((xml.match(/Construtora Exemplo S\.A\. — CONSTRUTORA/g) ?? []).length).toBeGreaterThanOrEqual(2);
    expect(xml).toContain('MINUTA PARA CONFERÊNCIA');
    // paridade: tudo o que o documento resolvido diz está no texto do .docx
    const norm = (x: string) => x.replace(/ \| /g, ' ').replace(/R\$ /g, '').replace(/\s+/g, ' ');
    const texto = norm(textoDeDocx(docx));
    for (const linha of textoDoDocumento(doc).split('\n')) {
      const t = norm(linha.replace(/^\w+: /, '').replace(/\{\{[a-z_]+\}\}/g, '')).trim();
      if (t.length > 12 && !/^\d+(\.\d+)*\. /.test(t)) expect(texto).toContain(t.slice(0, 60));
    }
    // versão final: sem destaque amarelo e sem aviso
    const fin = preencherDocx(modelo, docDoCaso(catalogo, true));
    const xmlF = documentXmlDoDocx(fin.docx);
    expect(xmlF).not.toContain('<w:highlight w:val="yellow"/>');
    expect(xmlF).not.toContain('MINUTA PARA CONFERÊNCIA');
  });

  it.skipIf(!temModelo)('PDF do mesmo documento renderiza com todas as seções', { timeout: 60_000 }, async () => {
    const catalogo = JSON.parse(readFileSync(CATALOGO, 'utf8')) as Catalogo;
    const doc = docDoCaso(catalogo, false);
    const { buffer, paginas } = await renderContratoV2Pdf(doc, { catalogo });
    expect(buffer.subarray(0, 5).toString('latin1')).toBe('%PDF-');
    expect(paginas).toBeGreaterThanOrEqual(10);
  });
});
