import type { SupabaseClient } from '@supabase/supabase-js';
import { hashDocumento, resolverDocumento, type CatalogoModelo, type DocumentoResolvido, type Dossie, type EntradaResolver, type ItemClausula, type ParametroClausula, type PartesContrato, type SignatarioContrato } from '@bid/core';

/**
 * Carrega o contrato v2 completo no contexto do chamador (RLS) e resolve o
 * documento com o core. É o ÚNICO caminho para o hash do conteúdo: preview,
 * revisão por IA e emissão usam a mesma função, senão os hashes não batem e o
 * envio para validação é recusado.
 */
export interface ContratoV2Carregado {
  id: string;
  orgId: string;
  obraId: string;
  obraNome: string;
  obraCidade: string | null;
  categoria: string;
  status: string;
  valor: number | null;
  numero: string | null;
  modeloId: string;
  docxPath: string;
  catalogo: CatalogoModelo | null;
  parametrosModelo: ParametroClausula[];
  dossie: Dossie | null;
  parametros: Record<string, string>;
  partes: Partial<PartesContrato>;
  conteudoHash: string | null;
  conteudoVersao: number;
  faltandoServidor: string[] | null;
  itens: ItemClausula[];
  planilha: { ordem: number; codigo: string | null; grupo: boolean; descricao: string; unidade: string | null; quantidade: number | null; preco_unitario: number | null; total: number | null }[];
  blocos: { ordem: number; chave: string; titulo: string; itens: string[]; parametros: Record<string, unknown> }[];
  signatarios: SignatarioContrato[];
}

const one = <T,>(v: T | T[] | null | undefined): T | null => (Array.isArray(v) ? (v[0] ?? null) : (v ?? null));

export async function carregarContratoV2(sb: SupabaseClient, contratoId: string): Promise<ContratoV2Carregado | null> {
  const { data, error } = await sb
    .from('contratos')
    .select(
      `id, org_id, obra_id, categoria, status, valor, numero, modelo_id, dossie, parametros, partes, conteudo_hash, conteudo_versao, faltando,
       obras ( nome, cidade ), contrato_modelos ( catalogo, docx_path ),
       contrato_itens_clausula ( numero, apos, texto, texto_padrao, origem, variante_chave, bloco_chave, suprimido, justificativa, reduz_protecao ),
       contrato_planilha ( ordem, codigo, grupo, descricao, unidade, quantidade, preco_unitario, total ),
       contrato_blocos ( ordem, bloco_chave, titulo, itens, parametros ),
       contrato_signatarios ( id, parte, nome, cpf, cargo, email, telefone, ordem, obrigatorio )`,
    )
    .eq('id', contratoId)
    .is('deleted_at', null)
    .maybeSingle();
  if (error) throw error;
  if (!data) return null;
  const r = data as unknown as {
    id: string; org_id: string; obra_id: string; categoria: string; status: string; valor: number | null; numero: string | null; modelo_id: string | null;
    dossie: Dossie | null; parametros: Record<string, string> | null; partes: Partial<PartesContrato> | null; conteudo_hash: string | null; conteudo_versao: number | null; faltando: unknown;
    obras: { nome: string; cidade: string | null } | { nome: string; cidade: string | null }[] | null;
    contrato_modelos: { catalogo: CatalogoModelo | null; docx_path: string } | { catalogo: CatalogoModelo | null; docx_path: string }[] | null;
    contrato_itens_clausula: { numero: string; apos: string | null; texto: string; texto_padrao: string | null; origem: ItemClausula['origem']; variante_chave: string | null; bloco_chave: string | null; suprimido: boolean; justificativa: string | null; reduz_protecao: boolean }[] | null;
    contrato_planilha: ContratoV2Carregado['planilha'] | null;
    contrato_blocos: { ordem: number; bloco_chave: string; titulo: string; itens: unknown; parametros: Record<string, unknown> | null }[] | null;
    contrato_signatarios: (SignatarioContrato & { id: string })[] | null;
  };
  if (!r.modelo_id) return null; // legado
  const modelo = one(r.contrato_modelos);
  const obra = one(r.obras);
  const { data: pm } = await sb.from('modelo_parametros').select('numero, parametro, rotulo, tipo, texto').eq('modelo_id', r.modelo_id);
  return {
    id: r.id,
    orgId: r.org_id,
    obraId: r.obra_id,
    obraNome: obra?.nome ?? '',
    obraCidade: obra?.cidade ?? null,
    categoria: r.categoria,
    status: r.status,
    valor: r.valor,
    numero: r.numero,
    modeloId: r.modelo_id,
    docxPath: modelo?.docx_path ?? '',
    catalogo: modelo?.catalogo ?? null,
    parametrosModelo: ((pm ?? []) as ParametroClausula[]).map((p) => ({ numero: p.numero, parametro: p.parametro, rotulo: p.rotulo, tipo: p.tipo, texto: p.texto })),
    dossie: r.dossie ?? null,
    parametros: r.parametros ?? {},
    partes: r.partes ?? {},
    conteudoHash: r.conteudo_hash,
    conteudoVersao: r.conteudo_versao ?? 0,
    faltandoServidor: Array.isArray(r.faltando) ? (r.faltando as string[]) : null,
    itens: (r.contrato_itens_clausula ?? []).map((i) => ({ numero: i.numero, apos: i.apos, texto: i.texto, textoPadrao: i.texto_padrao, origem: i.origem, varianteChave: i.variante_chave, blocoChave: i.bloco_chave, suprimido: i.suprimido, justificativa: i.justificativa, reduzProtecao: i.reduz_protecao })),
    planilha: [...(r.contrato_planilha ?? [])].sort((a, b) => a.ordem - b.ordem),
    blocos: [...(r.contrato_blocos ?? [])].sort((a, b) => a.ordem - b.ordem).map((b) => ({ ordem: b.ordem, chave: b.bloco_chave, titulo: b.titulo, itens: Array.isArray(b.itens) ? (b.itens as string[]) : [], parametros: b.parametros ?? {} })),
    signatarios: [...(r.contrato_signatarios ?? [])].sort((a, b) => a.ordem - b.ordem),
  };
}

export function entradaDoContrato(c: ContratoV2Carregado, opts: { emissao?: EntradaResolver['emissao']; final?: boolean } = {}): EntradaResolver {
  return {
    parametros: c.parametros,
    partes: c.partes,
    itens: c.itens,
    planilha: c.planilha.map((l) => ({ codigo: l.codigo, grupo: l.grupo, descricao: l.descricao, unidade: l.unidade, quantidade: l.quantidade == null ? null : Number(l.quantidade), preco_unitario: l.preco_unitario == null ? null : Number(l.preco_unitario) })),
    blocos: c.blocos.map((b) => ({ titulo: b.titulo, itens: b.itens })),
    signatarios: c.signatarios,
    catalogo: c.catalogo,
    parametrosModelo: c.parametrosModelo,
    emissao: opts.emissao ?? null,
    final: !!opts.final,
  };
}

/** Documento resolvido + hash do conteúdo (o mesmo em preview, revisão e emissão). */
export async function resolverEHash(c: ContratoV2Carregado, opts: { emissao?: EntradaResolver['emissao']; final?: boolean } = {}): Promise<{ doc: DocumentoResolvido; hash: string }> {
  const doc = resolverDocumento(entradaDoContrato(c, opts));
  // Hash sem os dados de emissão (ass_*) para que a minuta e a versão final do mesmo conteúdo batam.
  const semEmissao = { ...doc, campos: Object.fromEntries(Object.entries(doc.campos).filter(([k]) => !k.startsWith('ass_'))) };
  const hash = await hashDocumento(semEmissao);
  return { doc, hash };
}

/**
 * Grava hash (e pendências) do conteúdo SÓ se o conteúdo não mudou desde a
 * leitura (`conteudo_versao`); devolve false quando mudou (o chamador refaz
 * ou avisa). Evita hash de uma versão sobre o conteúdo de outra (TOCTOU).
 */
export async function gravarHashConteudo(svc: SupabaseClient, c: ContratoV2Carregado, hash: string, faltando: string[] | null): Promise<boolean> {
  const patch: Record<string, unknown> = { conteudo_hash: hash };
  if (faltando) patch.faltando = faltando;
  const { data, error } = await svc.from('contratos').update(patch).eq('id', c.id).eq('conteudo_versao', c.conteudoVersao).select('id');
  if (error) throw error;
  return (data ?? []).length === 1;
}
