import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { Achado, BlocoModelo, CatalogoModelo, Dossie, ItemClausula, ParametroClausula, ParteV2, PartesContrato, SignatarioContrato, StatusContratoV2, VarianteModelo } from '@bid/core';
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
  /** Marcadores vazios conferidos pelo servidor na última minuta (null = minuta não gerada para esta versão). */
  faltandoServidor: string[] | null;
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
      `id, org_id, obra_id, proposta_id, certame_id, categoria, status, valor, numero, modelo_id, dossie, dossie_em, parametros, partes, conteudo_hash, faltando,
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
    faltandoServidor: Array.isArray(r.faltando) ? (r.faltando as string[]) : null,
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

/* ---------- M12: catálogo, variantes, parâmetros de cláusula, minuta e validação ---------- */
export interface AprovacaoV2 {
  id: string;
  acao: 'enviado' | 'aprovado' | 'devolvido';
  conteudoHash: string;
  comentario: string | null;
  autoaprovacao: boolean;
  autor: string;
  criadaEm: string;
}

export async function fetchAprovacaoVigente(contratoId: string): Promise<AprovacaoV2 | null> {
  const { data, error } = await db().rpc('aprovacao_vigente', { p_contrato: contratoId });
  if (error) throw error;
  const r = ((data ?? []) as { id: string; acao: AprovacaoV2['acao']; conteudo_hash: string; comentario: string | null; autoaprovacao: boolean; autor: string; created_at: string }[])[0];
  return r ? { id: r.id, acao: r.acao, conteudoHash: r.conteudo_hash, comentario: r.comentario, autoaprovacao: r.autoaprovacao, autor: r.autor, criadaEm: r.created_at } : null;
}

export async function fetchCatalogoModelo(modeloId: string): Promise<CatalogoModelo | null> {
  const { data, error } = await db().from('contrato_modelos').select('catalogo').eq('id', modeloId).maybeSingle();
  if (error) throw error;
  const c = (data as { catalogo: CatalogoModelo | null } | null)?.catalogo ?? null;
  return c && Array.isArray(c.clausulas) ? { versao: c.versao, clausulas: c.clausulas, anexo_ii: Array.isArray(c.anexo_ii) ? c.anexo_ii : [] } : null;
}

export async function fetchVariantesModelo(modeloId: string): Promise<VarianteModelo[]> {
  const { data, error } = await db().from('modelo_variantes').select('chave, numero, titulo, texto, reduz_protecao, explicacao').eq('modelo_id', modeloId).order('numero');
  if (error) throw error;
  return (data ?? []) as VarianteModelo[];
}

export async function fetchParametrosModelo(modeloId: string): Promise<ParametroClausula[]> {
  const { data, error } = await db().from('modelo_parametros').select('numero, parametro, rotulo, tipo, texto').eq('modelo_id', modeloId).order('numero');
  if (error) throw error;
  return (data ?? []) as ParametroClausula[];
}

/** Hash + pendências de marcador conferidos pelo servidor (grava em contratos). */
export async function conferirMinuta(contratoId: string): Promise<{ hash: string; faltando: string[] }> {
  return post('/api/contracts/preview', { contratoId, formato: 'hash' });
}

/** Minuta .docx ou PDF (com aviso). Devolve o arquivo para `entregarArquivo` dentro do gesto do usuário. */
export async function baixarMinuta(contratoId: string, formato: 'docx' | 'pdf'): Promise<{ arquivo: File; hash: string | null; faltando: number }> {
  const resp = await fetch('/api/contracts/preview', { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${await token()}` }, body: JSON.stringify({ contratoId, formato }) });
  if (!resp.ok) {
    const corpo = (await resp.json().catch(() => null)) as { erro?: string } | null;
    throw new Error(corpo?.erro ?? `Falha (HTTP ${resp.status}).`);
  }
  const blob = await resp.blob();
  const cd = resp.headers.get('Content-Disposition') ?? '';
  const m = /filename\*=UTF-8''([^;]+)/.exec(cd);
  const nome = m ? decodeURIComponent(m[1]!) : `Minuta.${formato}`;
  return { arquivo: new File([blob], nome, { type: blob.type }), hash: resp.headers.get('X-Bid-Hash'), faltando: Number(resp.headers.get('X-Bid-Faltando') ?? '0') };
}

export async function enviarValidacao(contratoId: string, hash: string): Promise<void> {
  const { error } = await db().rpc('enviar_validacao', { p_contrato: contratoId, p_hash: hash });
  if (error) throw error;
}
export async function aprovarContrato(contratoId: string, hash: string, itensLidos: string[]): Promise<void> {
  const { error } = await db().rpc('aprovar_contrato', { p_contrato: contratoId, p_hash: hash, p_itens_lidos: itensLidos });
  if (error) throw error;
}
export async function devolverContrato(contratoId: string, comentario: string): Promise<void> {
  const { error } = await db().rpc('devolver_contrato', { p_contrato: contratoId, p_comentario: comentario });
  if (error) throw error;
}

export function useAprovacaoVigente(contratoId: string | undefined) {
  return useQuery({ queryKey: ['contrato-aprovacao', contratoId], queryFn: () => fetchAprovacaoVigente(contratoId as string), enabled: !!contratoId });
}
export function useCatalogoModelo(modeloId: string | undefined) {
  return useQuery({ queryKey: ['modelo-catalogo', modeloId], queryFn: () => fetchCatalogoModelo(modeloId as string), enabled: !!modeloId, staleTime: 10 * 60_000 });
}
export function useVariantesModelo(modeloId: string | undefined) {
  return useQuery({ queryKey: ['modelo-variantes', modeloId], queryFn: () => fetchVariantesModelo(modeloId as string), enabled: !!modeloId, staleTime: 10 * 60_000 });
}
export function useParametrosModelo(modeloId: string | undefined) {
  return useQuery({ queryKey: ['modelo-parametros', modeloId], queryFn: () => fetchParametrosModelo(modeloId as string), enabled: !!modeloId, staleTime: 10 * 60_000 });
}
function invalidarContrato(qc: ReturnType<typeof useQueryClient>, id: string | undefined) {
  qc.invalidateQueries({ queryKey: ['contrato-v2', id] });
  qc.invalidateQueries({ queryKey: ['contrato-aprovacao', id] });
  qc.invalidateQueries({ queryKey: ['contratos'] });
}
export function useConferirMinuta(id: string | undefined) {
  const qc = useQueryClient();
  return useMutation({ mutationFn: () => conferirMinuta(id as string), onSettled: () => invalidarContrato(qc, id) });
}
export function useEnviarValidacao(id: string | undefined) {
  const qc = useQueryClient();
  return useMutation({ mutationFn: (hash: string) => enviarValidacao(id as string, hash), onSettled: () => invalidarContrato(qc, id) });
}
export function useAprovarContrato(id: string | undefined) {
  const qc = useQueryClient();
  return useMutation({ mutationFn: (v: { hash: string; itensLidos: string[] }) => aprovarContrato(id as string, v.hash, v.itensLidos), onSettled: () => invalidarContrato(qc, id) });
}
export function useDevolverContrato(id: string | undefined) {
  const qc = useQueryClient();
  return useMutation({ mutationFn: (comentario: string) => devolverContrato(id as string, comentario), onSettled: () => invalidarContrato(qc, id) });
}

/* ---------- M13: emissão, download, links e assinatura por signatário ---------- */
export interface AssinaturaV2Linha {
  signatarioId: string | null;
  parte: ParteV2;
  signatarioNome: string | null;
  assinadoEm: string | null;
  via: 'app' | 'link' | null;
  temLink: boolean;
  linkExpira: string | null;
}

export async function fetchAssinaturasV2(contratoId: string): Promise<AssinaturaV2Linha[]> {
  const { data, error } = await db().from('assinaturas').select('signatario_id, parte, signatario_nome, assinado_em, via, token_hash, token_expira').eq('contrato_id', contratoId);
  if (error) throw error;
  return ((data ?? []) as { signatario_id: string | null; parte: ParteV2; signatario_nome: string | null; assinado_em: string | null; via: 'app' | 'link' | null; token_hash: string | null; token_expira: string | null }[]).map((r) => ({
    signatarioId: r.signatario_id,
    parte: r.parte,
    signatarioNome: r.signatario_nome,
    assinadoEm: r.assinado_em,
    via: r.via,
    temLink: !!r.token_hash && (!r.token_expira || new Date(r.token_expira).getTime() > Date.now()),
    linkExpira: r.token_expira,
  }));
}

export async function emitirContrato(contratoId: string): Promise<{ numero: string; paginas: number }> {
  return post('/api/contracts/emitir', { contratoId });
}

/** URL assinada (60 s) do arquivo emitido; abrir dentro do gesto do usuário. */
export async function urlDownloadEmitido(contratoId: string, formato: 'docx' | 'pdf'): Promise<{ url: string; nome: string }> {
  const resp = await fetch(`/api/contracts/download?id=${encodeURIComponent(contratoId)}&formato=${formato}`, { headers: { Authorization: `Bearer ${await token()}` } });
  const corpo = (await resp.json().catch(() => null)) as { url?: string; nome?: string; erro?: string } | null;
  if (!resp.ok || !corpo?.url) throw new Error(corpo?.erro ?? `Falha (HTTP ${resp.status}).`);
  return { url: corpo.url, nome: corpo.nome ?? `contrato.${formato}` };
}

export async function gerarLinksAssinatura(contratoId: string, signatarioId?: string): Promise<{ signatarioId: string; nome: string; parte: ParteV2; token: string }[]> {
  const { data, error } = await db().rpc('gerar_links_assinatura', { p_contrato: contratoId, p_signatario: signatarioId ?? null });
  if (error) throw error;
  return ((data ?? []) as { signatario_id: string; nome: string; parte: ParteV2; token: string }[]).map((r) => ({ signatarioId: r.signatario_id, nome: r.nome, parte: r.parte, token: r.token }));
}

export async function coletarAssinaturaApp(contratoId: string, signatarioId: string, pngBase64: string): Promise<{ assinado: boolean }> {
  return post('/api/contracts/sign', { contratoId, signatarioId, pngBase64 });
}

export async function cancelarContrato(contratoId: string, motivo: string): Promise<void> {
  const { error } = await db().rpc('cancelar_contrato', { p_contrato: contratoId, p_motivo: motivo });
  if (error) throw error;
}

export function useAssinaturasV2(contratoId: string | undefined) {
  return useQuery({ queryKey: ['assinaturas-v2', contratoId], queryFn: () => fetchAssinaturasV2(contratoId as string), enabled: !!contratoId });
}
function invalidarEmissao(qc: ReturnType<typeof useQueryClient>, id: string | undefined) {
  invalidarContrato(qc, id);
  qc.invalidateQueries({ queryKey: ['assinaturas-v2', id] });
}
export function useEmitirContrato(id: string | undefined) {
  const qc = useQueryClient();
  return useMutation({ mutationFn: () => emitirContrato(id as string), onSettled: () => invalidarEmissao(qc, id) });
}
export function useGerarLinksAssinatura(id: string | undefined) {
  const qc = useQueryClient();
  return useMutation({ mutationFn: (signatarioId?: string) => gerarLinksAssinatura(id as string, signatarioId), onSettled: () => invalidarEmissao(qc, id) });
}
export function useColetarAssinatura(id: string | undefined) {
  const qc = useQueryClient();
  return useMutation({ mutationFn: (v: { signatarioId: string; pngBase64: string }) => coletarAssinaturaApp(id as string, v.signatarioId, v.pngBase64), onSettled: () => invalidarEmissao(qc, id) });
}
export function useCancelarContrato(id: string | undefined) {
  const qc = useQueryClient();
  return useMutation({ mutationFn: (motivo: string) => cancelarContrato(id as string, motivo), onSettled: () => invalidarEmissao(qc, id) });
}
