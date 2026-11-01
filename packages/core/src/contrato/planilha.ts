import type { ItemExtraido } from '../extracao';

/**
 * Planilha de preços do Anexo I: código, grupos (sem valor), quantidade,
 * preço unitário com até 4 casas e total da linha arredondado a 2 casas
 * (HALF_UP em centavos). O valor do contrato é a soma das linhas (RC-03).
 */
export interface LinhaPlanilha {
  codigo: string | null;
  grupo: boolean;
  descricao: string;
  unidade: string | null;
  quantidade: number | null;
  preco_unitario: number | null;
}

/** round(qtd × unit, 2) com HALF_UP em centavos, sem ruído de ponto flutuante. */
export function totalLinha(qtd: number | null | undefined, unit: number | null | undefined): number | null {
  if (qtd == null || unit == null || !Number.isFinite(qtd) || !Number.isFinite(unit)) return null;
  // Trabalha em "décimos de milésimo" inteiros para evitar 0.1+0.2.
  const q = Math.round(qtd * 10000);
  const u = Math.round(unit * 10000);
  const centavosExatos = (q * u) / 1_000_000; // (qtd*1e4 * unit*1e4) / 1e8 * 100
  return Math.round(centavosExatos + 1e-9) / 100;
}

export function totalPlanilha(linhas: readonly LinhaPlanilha[]): number {
  let cents = 0;
  for (const l of linhas) {
    if (l.grupo) continue;
    const t = totalLinha(l.quantidade, l.preco_unitario);
    if (t != null) cents += Math.round(t * 100);
  }
  return cents / 100;
}

/** Até 4 casas, mínimo 2, padrão brasileiro: 152,4725 · 18.000,00 · 0,3333. */
export function fmtUnit(v: number | null | undefined): string {
  if (v == null || !Number.isFinite(v)) return '—';
  const casas = Math.max(2, Math.min(4, (v.toFixed(4).replace(/0+$/, '').split('.')[1] ?? '').length));
  return v.toLocaleString('pt-BR', { minimumFractionDigits: casas, maximumFractionDigits: casas });
}

export function fmtQtd(v: number | null | undefined): string {
  if (v == null || !Number.isFinite(v)) return '—';
  return v.toLocaleString('pt-BR', { minimumFractionDigits: 0, maximumFractionDigits: 4 });
}

/** Linhas iniciais a partir dos itens lidos pela IA (sem código/unidade: a IA não os lê ainda). */
export function linhasDaProposta(itens: readonly ItemExtraido[]): LinhaPlanilha[] {
  return itens
    .filter((i) => i.descricao && i.descricao.trim())
    .map((i, idx) => ({
      codigo: String(idx + 1),
      grupo: false,
      descricao: i.descricao.trim(),
      unidade: null,
      quantidade: i.qtd ?? null,
      preco_unitario: i.unit ?? (i.total != null && i.qtd ? Math.round((i.total / i.qtd) * 10000) / 10000 : null),
    }));
}

/** Número no padrão brasileiro ("1.800", "152,4725", "R$ 18.000,00") ou já numérico. */
export function numeroBR(v: unknown): number | null {
  if (typeof v === 'number') return Number.isFinite(v) ? v : null;
  if (typeof v !== 'string') return null;
  let s = v.replace(/R\$|\s/g, '').trim();
  if (!s) return null;
  if (/^-?\d{1,3}(\.\d{3})*(,\d+)?$/.test(s) || /^-?\d+,\d+$/.test(s)) s = s.replace(/\./g, '').replace(',', '.');
  else if (/^-?\d{1,3}(,\d{3})*(\.\d+)?$/.test(s) && s.includes(',')) s = s.replace(/,/g, '');
  const n = Number(s);
  return Number.isFinite(n) ? n : null;
}

const CABECALHOS: Record<keyof LinhaPlanilha, RegExp> = {
  codigo: /^(c[oó]d(igo)?|item|n[ºo°]?\.?)$/i,
  descricao: /descri|servi[cç]o|discrimina/i,
  unidade: /^(un(id(ade)?)?\.?|und\.?)$/i,
  quantidade: /quant|^qtd\.?$|^qde\.?$/i,
  preco_unitario: /unit[aá]rio|^p\.?\s*unit|pre[cç]o\s*unit|valor\s*unit/i,
  grupo: /^$/,
};

/**
 * Converte linhas de uma planilha (.xlsx/.csv já lidas como matriz) em linhas
 * do contrato: acha a linha de cabeçalho, mapeia colunas (código, descrição,
 * unidade, quantidade, unitário) e trata linha sem quantidade/unitário como
 * GRUPO. Colunas de total são ignoradas (o total é recalculado).
 */
export function importarXlsxLinhas(rows: readonly (readonly unknown[])[]): { linhas: LinhaPlanilha[]; avisos: string[] } {
  const avisos: string[] = [];
  const texto = (v: unknown) => (v == null ? '' : String(v).trim());
  let cab = -1;
  const col: Partial<Record<keyof LinhaPlanilha, number>> = {};
  for (let r = 0; r < Math.min(rows.length, 30); r++) {
    const linha = rows[r] ?? [];
    const achados: Partial<Record<keyof LinhaPlanilha, number>> = {};
    linha.forEach((c, i) => {
      const t = texto(c);
      if (!t) return;
      for (const k of ['codigo', 'descricao', 'unidade', 'quantidade', 'preco_unitario'] as const) {
        if (achados[k] == null && CABECALHOS[k].test(t)) achados[k] = i;
      }
    });
    if (achados.descricao != null && (achados.quantidade != null || achados.preco_unitario != null)) {
      cab = r;
      Object.assign(col, achados);
      break;
    }
  }
  if (cab < 0) {
    // Sem cabeçalho reconhecível: assume código, descrição, unidade, quantidade, unitário.
    avisos.push('Cabeçalho não reconhecido: assumi as colunas código, descrição, unidade, quantidade e preço unitário, nessa ordem.');
    Object.assign(col, { codigo: 0, descricao: 1, unidade: 2, quantidade: 3, preco_unitario: 4 });
  }
  const linhas: LinhaPlanilha[] = [];
  for (let r = cab + 1; r < rows.length; r++) {
    const linha = rows[r] ?? [];
    const descricao = texto(col.descricao != null ? linha[col.descricao] : '');
    if (!descricao) continue;
    if (/^total/i.test(descricao)) continue;
    const quantidade = col.quantidade != null ? numeroBR(linha[col.quantidade]) : null;
    const unit = col.preco_unitario != null ? numeroBR(linha[col.preco_unitario]) : null;
    const codigo = col.codigo != null ? texto(linha[col.codigo]) || null : null;
    const unidade = col.unidade != null ? texto(linha[col.unidade]) || null : null;
    const grupo = quantidade == null && unit == null;
    linhas.push({ codigo, grupo, descricao, unidade: grupo ? null : unidade, quantidade: grupo ? null : quantidade, preco_unitario: grupo ? null : unit });
  }
  if (!linhas.length) avisos.push('Nenhuma linha com descrição encontrada.');
  return { linhas, avisos };
}

/** Diferença entre a soma da planilha e o valor da proposta (para o aviso e a revisão). */
export function divergenciaValor(soma: number, valorProposta: number | null): { difere: boolean; diferenca: number } {
  if (valorProposta == null) return { difere: false, diferenca: 0 };
  const d = Math.round((soma - valorProposta) * 100) / 100;
  return { difere: Math.abs(d) >= 0.01, diferenca: d };
}
