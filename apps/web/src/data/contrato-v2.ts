import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { Achado, BlocoModelo, Dossie, ItemClausula, PartesContrato, SignatarioContrato, StatusContratoV2 } from '@bid/core';
import { supabase } from '../lib/supabase';

/**
 * Contrato v2 (minuta padrão): detalhe completo, dossiê, salvar em lote,
 * revisão por IA e resolução de achados. Telas não montam texto de contrato
 * (regra 15): só leem e gravam o estado.
 */
function db() {
  if (!supabase) throw new Error('Supabase não configurado.');
  return supabase;
}
async function token(): Promise<string> {
  const { data } = await db().auth.getSession();
  const t = data.session?.access_token;
  if (!t) throw new Error('Sessão inválida.');
  return t;
}
async function post<T>(url: string, body: unknown): Promise<T> {
  const resp = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${await token()}` }, body: JSON.stringify(body) });
  const corpo = (await resp.json().catch(() => null)) as (T & { erro?: string }) | null;
  if (!resp.ok) throw new Error(corpo?.erro ?? `Falha (HTTP ${resp.status}).`);
  return corpo as T;
}

export interface LinhaPlanilhaV2 {
  id?: string;
  ordem: number;
  codigo: string | null;
  grupo: boolean;
  descricao: string;
  unidade: string | null;
  quantidade: number | null;
  preco_unitario: number | null;
  total: number | null;
}

export interface AchadoV2 extends Achado {
  id: string;
  resolucao: 'corrigido' | 'aceito' | null;
  justificativa: string | null;
}

export interface RevisaoV2 {
  id: string;
  conteudoHash: string;
  modeloIa: string;
  resumo: string | null;
  status: 'processando' | 'concluida' | 'falhou';
  erro: string | null;
  criadaEm: string;
  achados: AchadoV2[];
}

export interface ContratoV2Detalhe {
  id: string;
  orgId: string;
  obraId: string;
  obraNome: string;
  propostaId: string;
  certameId: string;
  categoria: string;
  status: StatusContratoV2;
  valor: number | null;
  numero: string | null;
  modeloId: string;
  dossie: Dossie | null;
  dossieEm: string | null;
  parametros: Record<string, string>;
  partes: Partial<PartesContrato>;
  conteudoHash: string | null;
  itens: ItemClausula[];
  planilha: LinhaPlanilhaV2[];
  blocos: { chave: string; titulo: string; itens: string[]; parametros: Record<string, unknown> }[];
  signatarios: SignatarioContrato[];
  revisao: RevisaoV2 | null;
  /** Proposta hoje (para avisar "a proposta mudou depois do dossiê"). */
  propostaAtual: { versao: number | null; valor: number | null; prazoDias: number | null } | null;
}

export async function fetchContratoV2(id: string): Promise<ContratoV2Detalhe | null> {
  const { data, error } = await db()
    .from('contratos')
    .select(
      `id, org_id, obra_id, proposta_id, certame_id, categoria, status, valor, numero, modelo_id, dossie, dossie_em, parametros, partes, conteudo_hash,
       obras ( nome ), propostas ( versao_atual, valor_atual, prazo_atual ),
       contrato_itens_clausula ( numero, apos, texto, texto_padrao, origem, variante_chave, bloco_chave, suprimido, justificativa, reduz_protecao ),
       contrato_planilha ( id, ordem, codigo, grupo, descricao, unidade, quantidade, preco_unitario, total ),
       contrato_blocos ( ordem, bloco_chave, titulo, itens, parametros ),
       contrato_signatarios ( id, parte, nome, cpf, cargo, email, telefone, ordem, obrigatorio )`,
    )
    .eq('id', id)
    .is('deleted_at', null)
    .maybeSingle();
  if (error) throw error;
  if (!data) return null;
  const r = data as unknown as Record<string, unknown> & {
    obras: { nome: string } | { nome: string }[] | null;
    propostas: { versao_atual: number | null; valor_atual: number | null; prazo_atual: number | null } | null | { versao_atual: number | null; valor_atual: number | null; prazo_atual: number | null }[];
    contrato_itens_clausula: { numero: string; apos: string | null; texto: string; texto_padrao: string | null; origem: ItemClausula['origem']; variante_chave: string | null; bloco_chave: string | null; suprimido: boolean; justificativa: string | null; reduz_protecao: boolean }[] | null;
    contrato_planilha: LinhaPlanilhaV2[] | null;
    contrato_blocos: { ordem: number; bloco_chave: string; titulo: string; itens: string[]; parametros: Record<string, unknown> }[] | null;
    contrato_signatarios: (SignatarioContrato & { id: string })[] | null;
  };
  if (!r.modelo_id) return null; // legado
  const one = <T,>(v: T | T[] | null): T | null => (Array.isArray(v) ? (v[0] ?? null) : v);
  const prop = one(r.propostas);

  // Última revisão + achados
  const { data: revRows } = await db().rpc('ultima_revisao', { p_contrato: id });
  const rev = ((revRows ?? []) as { id: string; conteudo_hash: string; modelo_ia: string; resumo: string | null; status: RevisaoV2['status']; erro: string | null; created_at: string }[])[0] ?? null;
  let revisao: RevisaoV2 | null = null;
  if (rev) {
    // "processando" há mais de 10 min = a função morreu: tratar como falha (sem sondagem infinita).
    const velha = rev.status === 'processando' && Date.now() - new Date(rev.created_at).getTime() > 10 * 60_000;
    if (velha) {
      rev.status = 'falhou';
      rev.erro = rev.erro ?? 'tempo esgotado';
    }
    const { data: ach } = await db().from('contrato_achados').select('id, tipo, severidade, numero, titulo, explicacao, trecho_proposta, sugestao, resolucao, justificativa').eq('revisao_id', rev.id);
    const peso = { alta: 0, media: 1, baixa: 2 } as const;
    revisao = {
      id: rev.id,
      conteudoHash: rev.conteudo_hash,
      modeloIa: rev.modelo_ia,
      resumo: rev.resumo,
      status: rev.status,
      erro: rev.erro,
      criadaEm: rev.created_at,
      achados: ((ach ?? []) as { id: string; tipo: Achado['tipo']; severidade: Achado['severidade']; numero: string; titulo: string; explicacao: string; trecho_proposta: string | null; sugestao: string | null; resolucao: AchadoV2['resolucao']; justificativa: string | null }[])
        .map((a) => ({ id: a.id, tipo: a.tipo, severidade: a.severidade, numero: a.numero, titulo: a.titulo, explicacao: a.explicacao, trechoProposta: a.trecho_proposta, sugestao: a.sugestao, resolucao: a.resolucao, justificativa: a.justificativa }))
        .sort((a, b) => peso[a.severidade] - peso[b.severidade]),
    };
  }

  return {
    id: r.id as string,
    orgId: r.org_id as string,
    obraId: r.obra_id as string,
    obraNome: one(r.obras)?.nome ?? '',
    propostaId: r.proposta_id as string,
    certameId: r.certame_id as string,
    categoria: r.categoria as string,
    status: r.status as StatusContratoV2,
    valor: r.valor as number | null,
    numero: (r.numero as string | null) ?? null,
    modeloId: r.modelo_id as string,
    dossie: (r.dossie as Dossie | null) ?? null,
    dossieEm: (r.dossie_em as string | null) ?? null,
    parametros: (r.parametros as Record<string, string>) ?? {},
    partes: (r.partes as Partial<PartesContrato>) ?? {},
    conteudoHash: (r.conteudo_hash as string | null) ?? null,
    itens: (r.contrato_itens_clausula ?? []).map((i) => ({ numero: i.numero, apos: i.apos, texto: i.texto, textoPadrao: i.texto_padrao, origem: i.origem, varianteChave: i.variante_chave, blocoChave: i.bloco_chave, suprimido: i.suprimido, justificativa: i.justificativa, reduzProtecao: i.reduz_protecao })),
    planilha: [...(r.contrato_planilha ?? [])].sort((a, b) => a.ordem - b.ordem),
    blocos: [...(r.contrato_blocos ?? [])].sort((a, b) => a.ordem - b.ordem).map((b) => ({ chave: b.bloco_chave, titulo: b.titulo, itens: Array.isArray(b.itens) ? b.itens : [], parametros: b.parametros ?? {} })),
    signatarios: [...(r.contrato_signatarios ?? [])].sort((a, b) => a.ordem - b.ordem),
    revisao,
    propostaAtual: prop ? { versao: prop.versao_atual, valor: prop.valor_atual, prazoDias: prop.prazo_atual } : null,
  };
}

/* ---------- mutações ---------- */

/** Cria o contrato v2 (RPC) e monta o dossiê (rota). Lança se a org não tem modelo ativo. */
export async function criarContratoV2(propostaId: string): Promise<string> {
  const { data, error } = await db().rpc('criar_contrato_v2', { p_proposta: propostaId });
  if (error) throw error;
  const id = data as string;
  await montarDossieContrato(id, false);
  return id;
}

export async function montarDossieContrato(contratoId: string, refazer: boolean): Promise<{ semeado: boolean; faltam: { contratante: boolean; contratada: boolean; construtora: boolean } }> {
  return post('/api/contracts/dossie', { contratoId, refazer });
}

export type PatchContrato = {
  parametros?: Record<string, string>;
  partes?: Partial<PartesContrato>;
  itens?: ItemClausula[];
  planilha?: Omit<LinhaPlanilhaV2, 'id' | 'ordem' | 'total'>[];
  blocos?: { chave: string; titulo: string; itens: string[]; parametros?: Record<string, unknown> }[];
  signatarios?: Omit<SignatarioContrato, 'id' | 'ordem'>[];
};

export async function salvarContratoV2(contratoId: string, patch: PatchContrato): Promise<void> {
  const { error } = await db().rpc('salvar_contrato', { p_contrato: contratoId, p_patch: patch });
  if (error) throw error;
}

export async function revisarContratoIA(contratoId: string): Promise<{ revisaoId: string; achados: Achado[]; avisos: string[] }> {
  return post('/api/ai/revisar-contrato', { contratoId });
}

export async function resolverAchado(achadoId: string, resolucao: 'corrigido' | 'aceito', justificativa?: string): Promise<void> {
  const { error } = await db().rpc('resolver_achado', { p_achado: achadoId, p_resolucao: resolucao, p_justificativa: justificativa ?? null });
  if (error) throw error;
}

/* ---------- hooks ---------- */
export function useContratoV2(id: string | undefined, opts: { sondar?: boolean } = {}) {
  return useQuery({
    queryKey: ['contrato-v2', id],
    queryFn: () => fetchContratoV2(id as string),
    enabled: !!id,
    // Sonda enquanto a revisão roda nesta aba OU enquanto o banco diz "processando"
    // (o usuário pode ter saído e voltado: a mutação não existe mais, a linha sim).
    refetchInterval: (q) => (opts.sondar || q.state.data?.revisao?.status === 'processando' ? 4000 : false),
  });
}
export function useSalvarContratoV2(id: string | undefined) {
  const qc = useQueryClient();
  return useMutation({ mutationFn: (patch: PatchContrato) => salvarContratoV2(id as string, patch), onSuccess: () => qc.invalidateQueries({ queryKey: ['contrato-v2', id] }) });
}
export function useMontarDossie(id: string | undefined) {
  const qc = useQueryClient();
  return useMutation({ mutationFn: (refazer: boolean) => montarDossieContrato(id as string, refazer), onSuccess: () => qc.invalidateQueries({ queryKey: ['contrato-v2', id] }) });
}
export const CHAVE_REVISAO = 'revisar-contrato';
export function useRevisarContrato(id: string | undefined) {
  const qc = useQueryClient();
  return useMutation({
    mutationKey: [CHAVE_REVISAO],
    mutationFn: () => revisarContratoIA(id as string),
    onSettled: () => qc.invalidateQueries({ queryKey: ['contrato-v2', id] }),
  });
}
export function useResolverAchado(id: string | undefined) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (v: { achadoId: string; resolucao: 'corrigido' | 'aceito'; justificativa?: string }) => resolverAchado(v.achadoId, v.resolucao, v.justificativa),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['contrato-v2', id] }),
  });
}

/* ---------- biblioteca de blocos do modelo (M11) ---------- */
export async function fetchBlocosModelo(modeloId: string): Promise<BlocoModelo[]> {
  const { data, error } = await db()
    .from('modelo_blocos')
    .select('chave, titulo, categorias, quando, itens_anexo, altera_clausulas, parametros')
    .eq('modelo_id', modeloId)
    .order('titulo');
  if (error) throw error;
  return ((data ?? []) as Record<string, unknown>[]).map((b) => ({
    chave: String(b.chave),
    titulo: String(b.titulo),
    categorias: Array.isArray(b.categorias) ? (b.categorias as string[]) : [],
    quando: (b.quando as string | null) ?? null,
    itens_anexo: Array.isArray(b.itens_anexo) ? (b.itens_anexo as string[]) : [],
    altera_clausulas: Array.isArray(b.altera_clausulas) ? (b.altera_clausulas as BlocoModelo['altera_clausulas']) : [],
    parametros: Array.isArray(b.parametros) ? (b.parametros as BlocoModelo['parametros']) : [],
  }));
}
export function useBlocosModelo(modeloId: string | undefined) {
  return useQuery({ queryKey: ['modelo-blocos', modeloId], queryFn: () => fetchBlocosModelo(modeloId as string), enabled: !!modeloId, staleTime: 5 * 60_000 });
}
