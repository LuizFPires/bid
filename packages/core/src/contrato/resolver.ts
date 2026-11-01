import { formatBRL } from '../money';
import { derivarAnexos, textoAnexoIII } from './blocos';
import { aplicarParametrosClausula, cmpNumeroItem, type CatalogoModelo, type ParametroClausula } from './clausulas-v2';
import { valorExtenso } from './extenso';
import { fmtQtd, fmtUnit, totalLinha, totalPlanilha, type LinhaPlanilha } from './planilha';
import { formatarCnpj } from './qualificacao';
import type { ItemClausula, ParametrosContrato, PartesContrato, SignatarioContrato } from './tipos';

/**
 * Documento resolvido: exatamente o que o motor .docx (docs/contratos/ref/
 * motor-docx.mjs) e o PDF consomem. Montado SÓ aqui (regra 15: telas e rotas
 * não montam texto de contrato). O hash do contrato é o hash deste objeto sem
 * `final` (core.hashDocumento).
 */
export interface DocumentoResolvido {
  campos: Record<string, string>;
  /** número do item → texto; null = "Não se aplica." */
  clausulas: Record<string, string | null>;
  extras: { apos: string; numero: string; texto: string }[];
  qualificacao: { ct: string; cd: string; cs: string };
  declaracao: { numero: string; titulo: string; texto: string }[];
  signatarios: Record<'contratante' | 'contratada' | 'construtora' | 'declarante', { nome: string; cargo: string }[]>;
  razao: { contratante: string; contratada: string; construtora: string };
  itens: { grupo?: true; n: string; desc: string; und?: string; qtd?: string; unit?: string; total?: string }[];
  blocos: { titulo: string; itens: string[] }[];
  anexoIII: { titulo: string; texto: string } | null;
  final: boolean;
  /** Metadados para a UI/revisão (ignorados no hash por começarem com `_`). */
  _origens: Record<string, ItemClausula['origem']>;
}

export interface EntradaResolver {
  parametros: ParametrosContrato;
  partes: Partial<PartesContrato>;
  itens: readonly ItemClausula[];
  planilha: readonly LinhaPlanilha[];
  blocos: readonly { titulo: string; itens: string[] }[];
  signatarios: readonly SignatarioContrato[];
  catalogo: CatalogoModelo | null;
  parametrosModelo?: readonly ParametroClausula[];
  /** Dados da emissão (data e local de assinatura); ausentes na minuta. */
  emissao?: { data: Date | string; local?: string | null } | null;
  final?: boolean;
}

const MESES = ['janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho', 'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro'];

function fmt2(v: number | null): string {
  return v == null ? '' : v.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

/** Chaves internas que não viram marcador do documento. */
function campoDoDocumento(k: string): boolean {
  return !k.startsWith('_') && !/^(anexo_iii_|prop_)/.test(k);
}

export function resolverDocumento(e: EntradaResolver): DocumentoResolvido {
  const p = e.parametros;
  const soma = totalPlanilha(e.planilha);
  const anexoIIIIncluir = p.anexo_iii_incluir === 'sim';
  const campos: Record<string, string> = {};
  for (const [k, v] of Object.entries(p)) if (campoDoDocumento(k) && (v ?? '').trim()) campos[k] = v.trim();

  // Valor: sempre a soma da planilha (RC-03); o modelo já tem "R$ " antes.
  campos.q_valor = fmt2(soma);
  campos.total = fmt2(soma);
  campos.q_valor_extenso = valorExtenso(soma);
  // Contratada (abertura e fecho)
  const cd = e.partes.contratada ?? null;
  if (cd) {
    campos.cd_razao = cd.razao_social;
    campos.cd_cnpj = formatarCnpj(cd.cnpj);
    campos.cd_sede = [cd.endereco, cd.cep ? `CEP ${cd.cep}` : null].filter(Boolean).join(', ');
  }
  // Anexos presentes (derivados, nunca à mão)
  Object.assign(campos, derivarAnexos({ anexoIII: anexoIIIIncluir }));
  // Data e local da assinatura: só na emissão
  if (e.emissao) {
    const d = typeof e.emissao.data === 'string' ? new Date(e.emissao.data) : e.emissao.data;
    campos.ass_dia = String(d.getDate());
    campos.ass_mes = MESES[d.getMonth()]!;
    campos.ass_ano = String(d.getFullYear());
    if (e.emissao.local) campos.ass_local = e.emissao.local;
  }
  if (!campos.ass_local && p.obra_foro) campos.ass_local = p.obra_foro;

  // Itens de cláusula: parâmetros de cláusula aplicados na resolução; suprimido → null.
  const itens = aplicarParametrosClausula(e.itens, e.parametrosModelo ?? [], p);
  const clausulas: Record<string, string | null> = {};
  const extras: DocumentoResolvido['extras'] = [];
  const origens: Record<string, ItemClausula['origem']> = {};
  const noCatalogo = new Set<string>();
  for (const c of e.catalogo?.clausulas ?? []) for (const it of c.itens) noCatalogo.add(it.numero);
  for (const it of [...itens].sort((a, b) => cmpNumeroItem(a.numero, b.numero))) {
    if (it.numero.startsWith('decl:')) continue;
    origens[it.numero] = it.origem;
    if (it.apos && !noCatalogo.has(it.numero)) {
      if (!it.suprimido) extras.push({ apos: it.apos, numero: it.numero, texto: it.texto });
      continue;
    }
    clausulas[it.numero] = it.suprimido ? null : it.texto;
  }

  // Anexo II: título do catálogo + texto do item decl:N (suprimido → "Não se aplica.")
  const declaracao = (e.catalogo?.anexo_ii ?? []).map((d) => {
    const it = itens.find((i) => i.numero === `decl:${d.numero}`);
    if (it) origens[it.numero] = it.origem;
    return { numero: d.numero, titulo: d.titulo, texto: it ? (it.suprimido ? 'Não se aplica.' : it.texto) : d.texto };
  });

  const q = (s: string | null | undefined) => (s ?? '').trim();
  const qualificacao = { ct: q(e.partes.contratante?.qualificacao), cd: q(cd?.qualificacao), cs: q(e.partes.construtora?.qualificacao) };
  const razao = { contratante: q(e.partes.contratante?.razao_social), contratada: q(cd?.razao_social), construtora: q(e.partes.construtora?.razao_social) };

  const sig = (parte: SignatarioContrato['parte']) =>
    [...e.signatarios]
      .filter((s) => s.parte === parte)
      .sort((a, b) => a.ordem - b.ordem)
      .map((s) => ({ nome: s.nome.trim(), cargo: (s.cargo ?? '').trim() }));
  const signatarios: DocumentoResolvido['signatarios'] = {
    contratante: sig('contratante'),
    contratada: sig('contratada'),
    construtora: sig('construtora'),
    declarante: p.decl_nome ? [{ nome: p.decl_nome.trim(), cargo: (p.decl_cargo ?? '').trim() }] : sig('contratada').slice(0, 1),
  };

  const linhas: DocumentoResolvido['itens'] = e.planilha.map((l, i) =>
    l.grupo
      ? { grupo: true as const, n: l.codigo ?? String(i + 1), desc: l.descricao }
      : { n: l.codigo ?? String(i + 1), desc: l.descricao, und: l.unidade ?? '', qtd: l.quantidade == null ? '' : fmtQtd(l.quantidade), unit: l.preco_unitario == null ? '' : fmtUnit(l.preco_unitario), total: fmt2(totalLinha(l.quantidade, l.preco_unitario)) },
  );

  const anexoIII = anexoIIIIncluir
    ? p.anexo_iii_texto && p.anexo_iii_titulo
      ? { titulo: p.anexo_iii_titulo, texto: p.anexo_iii_texto }
      : textoAnexoIII({ fornecedor: razao.contratada, numero: p.prop_numero || null, data: p.prop_data || null, destinatario: p.prop_destinatario || null })
    : null;

  return {
    campos,
    clausulas,
    extras,
    qualificacao,
    declaracao,
    signatarios,
    razao,
    itens: linhas,
    blocos: e.blocos.map((b) => ({ titulo: b.titulo, itens: [...b.itens] })),
    anexoIII,
    final: !!e.final,
    _origens: origens,
  };
}

/** Marcadores simples que o documento vai pedir e estão vazios (sem os de emissão). */
export function camposVaziosDoDocumento(doc: DocumentoResolvido, marcadoresDoModelo: readonly string[]): string[] {
  return marcadoresDoModelo.filter((k) => !/^ass_/.test(k) && !(doc.campos[k] ?? '').trim());
}

/** Texto corrido do documento (mesma ordem no .docx e no PDF) — base do teste de paridade. */
export function textoDoDocumento(doc: DocumentoResolvido): string {
  const out: string[] = [];
  for (const [k, v] of Object.entries(doc.campos).sort(([a], [b]) => a.localeCompare(b))) out.push(`${k}: ${v}`);
  out.push(doc.qualificacao.ct, doc.qualificacao.cd, doc.qualificacao.cs);
  for (const n of Object.keys(doc.clausulas).sort(cmpNumeroItem)) {
    out.push(`${n}. ${doc.clausulas[n] ?? 'Não se aplica.'}`);
    for (const ex of doc.extras.filter((x) => x.apos === n)) out.push(`${ex.numero}. ${ex.texto}`);
  }
  for (const it of doc.itens) out.push(it.grupo ? `${it.n} ${it.desc}` : `${it.n} ${it.desc} ${it.und} ${it.qtd} ${it.unit} ${it.total}`);
  doc.blocos.forEach((b, bi) => {
    out.push(`${bi + 1}. ${b.titulo}`);
    b.itens.forEach((t, ti) => out.push(`${bi + 1}.${ti + 1}. ${t}`));
  });
  for (const d of doc.declaracao) out.push(`${d.numero}. ${d.titulo} ${d.texto}`);
  if (doc.anexoIII) out.push(doc.anexoIII.titulo, doc.anexoIII.texto);
  for (const parte of ['contratante', 'contratada', 'construtora', 'declarante'] as const) for (const s of doc.signatarios[parte]) out.push(`${s.nome}${s.cargo ? `, ${s.cargo}` : ''}`);
  return out.join('\n').replace(/\*\*/g, '');
}

/** Formata o valor para exibição (reaproveita o padrão BRL do app). */
export const valorBRL = formatBRL;
