import { justificativaValida } from './revisao';
import type { ItemClausula } from './tipos';

/** Catálogo da minuta como vem de `contrato_modelos.catalogo` (clausulas-v1.json). */
export interface CatalogoModelo {
  versao: string;
  clausulas: { clausula: string; titulo: string; itens: { numero: string; texto: string }[] }[];
  anexo_ii: { numero: string; titulo: string; texto: string }[];
}

/** Variante negociada do catálogo (`modelo_variantes`). */
export interface VarianteModelo {
  chave: string;
  numero: string;
  titulo: string;
  texto: string;
  reduz_protecao: boolean;
  explicacao: string;
}

/** Parâmetro de cláusula (`modelo_parametros`): texto alternativo quando o parâmetro é usado. */
export interface ParametroClausula {
  numero: string;
  parametro: string;
  rotulo: string;
  tipo: string;
  opcoes?: string[];
  texto: string;
}

const PADRAO = (numero: string, texto: string, apos: string | null = null): ItemClausula => ({
  numero,
  apos,
  texto,
  textoPadrao: texto,
  origem: 'padrao',
  varianteChave: null,
  blocoChave: null,
  suprimido: false,
  justificativa: null,
  reduzProtecao: false,
});

/** Itens iniciais de um contrato: todo o catálogo como padrão (+ Anexo II como `decl:N`). */
export function itensIniciais(catalogo: CatalogoModelo): ItemClausula[] {
  const out: ItemClausula[] = [];
  for (const cl of catalogo.clausulas) for (const it of cl.itens) out.push(PADRAO(it.numero, it.texto));
  for (const d of catalogo.anexo_ii) out.push(PADRAO(`decl:${d.numero}`, d.texto));
  return out;
}

/** Variante do catálogo sobre um item: origem 'variante', herda reduz_protecao, exige justificativa. */
export function aplicarVariante(item: ItemClausula, variante: VarianteModelo, justificativa: string): ItemClausula {
  if (variante.numero !== item.numero) throw new Error(`variante ${variante.chave} é do item ${variante.numero}, não de ${item.numero}`);
  if (!justificativaValida(justificativa)) throw new Error('Variante exige justificativa (mínimo 10 caracteres).');
  return { ...item, texto: variante.texto, origem: 'variante', varianteChave: variante.chave, blocoChave: null, suprimido: false, justificativa: justificativa.trim(), reduzProtecao: variante.reduz_protecao };
}

/** Edição livre do texto: vira variante sem chave (o app não sabe se reduz proteção; a IA avalia). */
export function editarTexto(item: ItemClausula, texto: string, justificativa: string): ItemClausula {
  const t = texto.trim();
  if (!t) throw new Error('O texto do item não pode ficar vazio (use suprimir).');
  if (item.textoPadrao != null && t === item.textoPadrao) return restaurarPadrao(item);
  if (!justificativaValida(justificativa)) throw new Error('Alterar um item exige justificativa (mínimo 10 caracteres).');
  return { ...item, texto: t, origem: item.textoPadrao == null ? item.origem : 'variante', varianteChave: null, blocoChave: null, suprimido: false, justificativa: justificativa.trim(), reduzProtecao: false };
}

/** Suprime o item ("Não se aplica." no documento, numeração mantida). */
export function suprimir(item: ItemClausula, justificativa: string): ItemClausula {
  if (!justificativaValida(justificativa)) throw new Error('Suprimir um item exige justificativa (mínimo 10 caracteres).');
  return { ...item, origem: 'variante', varianteChave: null, blocoChave: null, suprimido: true, justificativa: justificativa.trim(), reduzProtecao: false };
}

/** Volta ao texto do catálogo. Item extra (sem padrão) não tem para onde voltar. */
export function restaurarPadrao(item: ItemClausula): ItemClausula {
  if (item.textoPadrao == null) throw new Error('Item extra não tem texto padrão; remova-o.');
  return { ...item, texto: item.textoPadrao, origem: 'padrao', varianteChave: null, blocoChave: null, suprimido: false, justificativa: null, reduzProtecao: false };
}

/** Próximo número livre depois de `apos` na mesma cláusula: 3.6 → 3.7 (ou 3.8 se 3.7 já existe). */
export function proximoNumero(itens: readonly ItemClausula[], apos: string): string {
  const usados = new Set(itens.map((i) => i.numero));
  const partes = apos.split('.');
  const base = partes.slice(0, -1).join('.');
  let n = Number(partes[partes.length - 1]) + 1;
  while (usados.has(base ? `${base}.${n}` : String(n))) n++;
  return base ? `${base}.${n}` : String(n);
}

/** Item extra incluído depois de `apos` (origem 'variante' com justificativa: é texto novo). */
export function itemExtra(itens: readonly ItemClausula[], apos: string, texto: string, justificativa: string): ItemClausula {
  if (!itens.some((i) => i.numero === apos)) throw new Error(`item ${apos} não existe`);
  if (!texto.trim()) throw new Error('Texto do item extra vazio.');
  if (!justificativaValida(justificativa)) throw new Error('Item extra exige justificativa (mínimo 10 caracteres).');
  return { numero: proximoNumero(itens, apos), apos, texto: texto.trim(), textoPadrao: null, origem: 'variante', varianteChave: null, blocoChave: null, suprimido: false, justificativa: justificativa.trim(), reduzProtecao: false };
}

/**
 * Parâmetros de cláusula (MODELO-MINUTA §3): quando `valores[parametro]` está
 * preenchido, o item recebe o texto alternativo com os `{{marcadores}}` do
 * próprio parâmetro trocados; origem 'parametro' (não exige justificativa).
 * Só sobre itens que ainda estão no padrão — variante/bloco prevalecem.
 * Aplicado na resolução (não grava em `itens`).
 */
export function aplicarParametrosClausula(itens: readonly ItemClausula[], parametros: readonly ParametroClausula[], valores: Record<string, string>): ItemClausula[] {
  return itens.map((it) => {
    if (it.origem !== 'padrao' || it.suprimido) return it;
    const p = parametros.find((x) => x.numero === it.numero && (valores[x.parametro] ?? '').trim());
    if (!p) return it;
    const texto = p.texto.replace(/\{\{(\w+)\}\}/g, (m, k: string) => (valores[k] ?? '').trim() || m);
    return { ...it, texto, origem: 'parametro' };
  });
}

/** Ordena números de item: 1.1 < 1.2 < 1.10 < 2; `decl:N` ao fim. */
export function cmpNumeroItem(a: string, b: string): number {
  const da = a.startsWith('decl:');
  const db = b.startsWith('decl:');
  if (da !== db) return da ? 1 : -1;
  const pa = a.replace(/^decl:/, '').split('.').map(Number);
  const pb = b.replace(/^decl:/, '').split('.').map(Number);
  for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
    const x = pa[i] ?? -1;
    const y = pb[i] ?? -1;
    if (x !== y) return x - y;
  }
  return 0;
}

export interface ClausulaAgrupada {
  clausula: string;
  titulo: string;
  itens: ItemClausula[];
}

/** Itens agrupados por cláusula do catálogo, na ordem da minuta; extras entram depois do `apos`. */
export function agruparPorClausula(catalogo: CatalogoModelo, itens: readonly ItemClausula[]): ClausulaAgrupada[] {
  const porNumero = new Map(itens.map((i) => [i.numero, i]));
  const extras = itens.filter((i) => i.apos && !catalogo.clausulas.some((c) => c.itens.some((x) => x.numero === i.numero)));
  return catalogo.clausulas.map((c) => {
    const lista: ItemClausula[] = [];
    for (const it of c.itens) {
      const atual = porNumero.get(it.numero);
      if (atual) lista.push(atual);
      for (const e of extras.filter((e) => e.apos === it.numero).sort((x, y) => cmpNumeroItem(x.numero, y.numero))) lista.push(e);
    }
    return { clausula: c.clausula, titulo: c.titulo, itens: lista };
  });
}

/** Selo de origem para a UI (texto + tom), nunca só cor. */
export const ORIGEM_LABEL: Record<ItemClausula['origem'], { texto: string; tom: 'neutro' | 'indigo' | 'azul' | 'verde' | 'ambar' }> = {
  padrao: { texto: 'padrão', tom: 'neutro' },
  parametro: { texto: 'parâmetro', tom: 'indigo' },
  proposta: { texto: 'proposta', tom: 'azul' },
  bloco: { texto: 'bloco', tom: 'verde' },
  variante: { texto: 'variante', tom: 'ambar' },
};
