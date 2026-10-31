#!/usr/bin/env node
// Carga do MODELO DA MINUTA numa organização (M9). Roda na máquina do usuário,
// com a service_role no ambiente — nunca commitar a chave nem o texto da minuta.
//
// Uso:
//   SUPABASE_URL=https://xxx.supabase.co SUPABASE_SERVICE_ROLE_KEY=... \
//   node scripts/seed-modelo-contrato.mjs --org <uuid-da-organizacao> [--versao 1.0] [--inativo] [--logo-ampla caminho.png]
//
// Lê docs/contratos/_privado/{modelo-empreitada-v1.docx, clausulas-v1.json, biblioteca-v1.json},
// sobe o .docx ao bucket privado `modelos` ({org}/empreitada-{versao}.docx), e faz upsert em
// contrato_modelos (catalogo), modelo_blocos, modelo_variantes e modelo_parametros.
// Idempotente: repetir atualiza (codigo+versao; modelo+chave).
import { readFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { createClient } from '@supabase/supabase-js';

const args = Object.fromEntries(
  process.argv.slice(2).reduce((acc, a, i, arr) => {
    if (a.startsWith('--')) acc.push([a.slice(2), arr[i + 1]?.startsWith('--') || arr[i + 1] === undefined ? true : arr[i + 1]]);
    return acc;
  }, []),
);
const org = args.org;
const versao = typeof args.versao === 'string' ? args.versao : '1.0';
const ativo = !args.inativo;
const url = process.env.SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!org || !url || !key) {
  console.error('Faltam --org, SUPABASE_URL ou SUPABASE_SERVICE_ROLE_KEY.');
  process.exit(1);
}

const priv = resolve(import.meta.dirname, '../docs/contratos/_privado');
const docxPath = resolve(priv, 'modelo-empreitada-v1.docx');
const catPath = resolve(priv, 'clausulas-v1.json');
const bibPath = resolve(priv, 'biblioteca-v1.json');
for (const p of [docxPath, catPath, bibPath]) {
  if (!existsSync(p)) {
    console.error(`Arquivo privado não encontrado: ${p}`);
    process.exit(1);
  }
}
const catalogo = JSON.parse(readFileSync(catPath, 'utf8'));
const bib = JSON.parse(readFileSync(bibPath, 'utf8'));

const sb = createClient(url, key, { auth: { persistSession: false } });

// 1) .docx no bucket privado
const docxObj = `${org}/empreitada-${versao}.docx`;
{
  const { error } = await sb.storage.from('modelos').upload(docxObj, readFileSync(docxPath), {
    upsert: true,
    contentType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  });
  if (error) throw new Error(`upload do modelo: ${error.message}`);
  console.log('modelo .docx:', docxObj);
}
if (typeof args['logo-ampla'] === 'string') {
  const { error } = await sb.storage.from('modelos').upload(`${org}/logo-ampla.png`, readFileSync(resolve(args['logo-ampla'])), { upsert: true, contentType: 'image/png' });
  if (error) throw new Error(`upload da logo AMPLA: ${error.message}`);
  console.log('logo AMPLA enviada');
}

// 2) modelo (desativa outras versões se esta for ativa)
if (ativo) {
  const { error } = await sb.from('contrato_modelos').update({ ativo: false }).eq('org_id', org).eq('codigo', 'empreitada').neq('versao', versao);
  if (error) throw new Error(`desativar versões: ${error.message}`);
}
const { data: modelo, error: mErr } = await sb
  .from('contrato_modelos')
  .upsert({ org_id: org, codigo: 'empreitada', versao, docx_path: docxObj, catalogo, ativo }, { onConflict: 'org_id,codigo,versao' })
  .select('id')
  .single();
if (mErr) throw new Error(`contrato_modelos: ${mErr.message}`);
console.log('contrato_modelos:', modelo.id, ativo ? '(ativo)' : '(inativo)');

// 3) biblioteca: blocos, variantes, parâmetros
const blocos = (bib.blocos ?? []).map((b) => ({
  org_id: org,
  modelo_id: modelo.id,
  chave: b.chave,
  titulo: b.titulo,
  categorias: b.categorias ?? [],
  quando: b.quando ?? null,
  itens_anexo: b.itens_anexo ?? [],
  altera_clausulas: b.altera_clausulas ?? [],
  parametros: b.parametros ?? [],
}));
if (blocos.length) {
  const { error } = await sb.from('modelo_blocos').upsert(blocos, { onConflict: 'modelo_id,chave' });
  if (error) throw new Error(`modelo_blocos: ${error.message}`);
}
const variantes = (bib.variantes ?? []).map((v) => ({
  org_id: org,
  modelo_id: modelo.id,
  chave: v.chave,
  numero: v.numero,
  titulo: v.titulo,
  texto: v.texto,
  reduz_protecao: !!v.reduz_protecao,
  explicacao: v.explicacao ?? '',
}));
if (variantes.length) {
  const { error } = await sb.from('modelo_variantes').upsert(variantes, { onConflict: 'modelo_id,chave' });
  if (error) throw new Error(`modelo_variantes: ${error.message}`);
}
const parametros = (bib.parametros_clausula ?? []).map((p) => ({
  org_id: org,
  modelo_id: modelo.id,
  numero: p.numero,
  parametro: p.parametro,
  rotulo: p.rotulo,
  tipo: p.tipo ?? 'texto',
  texto: p.texto,
}));
if (parametros.length) {
  const { error } = await sb.from('modelo_parametros').upsert(parametros, { onConflict: 'modelo_id,parametro' });
  if (error) throw new Error(`modelo_parametros: ${error.message}`);
}
console.log(`biblioteca: ${blocos.length} blocos, ${variantes.length} variantes, ${parametros.length} parâmetros de cláusula`);
console.log('ok');
