// node testar-motor.mjs <modelo.docx> <clausulas.json> <caso.json> <saida.docx> [final]
import fs from 'node:fs';
import { createRequire } from 'node:module';
import { preencher } from './motor-docx.mjs';
const require = createRequire(process.env.NODE_MODULES_HINT || import.meta.url);
const JSZip = require('jszip');
const [modelo, cat, casoF, saida, final] = process.argv.slice(2);
const catalogo = JSON.parse(fs.readFileSync(cat, 'utf8'));
const caso = JSON.parse(fs.readFileSync(casoF, 'utf8'));
const clausulas = {};
for (const c of catalogo.clausulas) for (const i of c.itens) clausulas[i.numero] = i.texto;
for (const n of caso.suprimidos || []) clausulas[n] = null;
const doc = { ...caso, clausulas, declaracao: catalogo.anexo_ii, final: final === 'final' };
const zip = await JSZip.loadAsync(fs.readFileSync(modelo));
const { xml, faltando } = preencher(await zip.file('word/document.xml').async('string'), doc);
zip.file('word/document.xml', xml);
fs.writeFileSync(saida, await zip.generateAsync({ type: 'nodebuffer', compression: 'DEFLATE' }));
console.log('faltando:', faltando);
