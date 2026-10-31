import {
  certameAtivo,
  nomeProposta,
  type AnaliseEqualizacao,
  type CategoriaUso,
  type PropostaExtraida,
  type CertameStatus,
  type PropostaAcervo,
  type PropostaStatus,
} from '@bid/core';
import { supabase } from '../lib/supabase';
import type { Obra, Organizacao } from './types';

function db() {
  if (!supabase) throw new Error('Supabase não configurado.');
  return supabase;
}

/** Normaliza um relacionamento embutido que pode vir como objeto ou array. */
function one<T>(v: T | T[] | null | undefined): T | undefined {
  if (Array.isArray(v)) return v[0];
  return v ?? undefined;
}

/* ---------- Acervo (um fetch agregado, sem N+1) ---------- */

interface RawAcervoRow {
  id: string;
  fornecedor: string;
  opcao: string | null;
  status: PropostaStatus;
  valor_atual: number | null;
  versao_atual: number;
  certame_id: string;
  certames:
    | {
        id: string;
        titulo: string;
        categoria: string;
        obra_id: string;
        obras: { id: string; nome: string } | { id: string; nome: string }[] | null;
      }
    | null;
}

export async function fetchAcervo(): Promise<PropostaAcervo[]> {
  const { data, error } = await db()
    .from('propostas')
    .select(
      `id, fornecedor, opcao, status, valor_atual, versao_atual, certame_id,
       certames!inner ( id, titulo, categoria, obra_id, obras!inner ( id, nome ) )`,
    )
    .is('deleted_at', null)
    .is('certames.deleted_at', null)
    .is('certames.obras.deleted_at', null);
  if (error) throw error;

  const rows = (data ?? []) as unknown as RawAcervoRow[];
  return rows.map((r): PropostaAcervo => {
    const cert = one(r.certames);
    const obra = one(cert?.obras);
    return {
      id: r.id,
      fornecedor: r.fornecedor,
      opcao: r.opcao,
      categoria: cert?.categoria ?? '',
      obraId: cert?.obra_id ?? '',
      obraNome: obra?.nome ?? '',
      certameId: r.certame_id,
      certameTitulo: cert?.titulo ?? '',
      status: r.status,
      valor: r.valor_atual,
      versaoAtual: r.versao_atual,
    };
  });
}

/* ---------- Obras ---------- */

export interface ObraResumo extends Obra {
  totalCertames: number;
  ativos: number;
}

interface RawObraRow extends Obra {
  certames: { id: string; status: string }[] | null;
}

export async function fetchObras(): Promise<ObraResumo[]> {
  const { data, error } = await db()
    .from('obras')
    .select(
      `id, org_id, nome, cidade, fase, fase_pill, criado_por, created_at, updated_at, deleted_at,
       certames ( id, status )`,
    )
    .is('deleted_at', null)
    .is('certames.deleted_at', null)
    .order('nome');
  if (error) throw error;

  const rows = (data ?? []) as unknown as RawObraRow[];
  return rows.map((o): ObraResumo => {
    const { certames, ...rest } = o;
    const cs = certames ?? [];
    return {
      ...rest,
      totalCertames: cs.length,
      ativos: cs.filter((c) => certameAtivo(c.status as CertameStatus)).length,
    };
  });
}

export interface CertameResumo {
  id: string;
  categoria: string;
  titulo: string;
  status: string;
  vencedoraFornecedor: string | null;
  totalPropostas: number;
}

interface RawCertameDetalhe {
  id: string;
  categoria: string;
  titulo: string;
  status: string;
  vencedora_proposta_id: string | null;
}

interface RawObraDetalhe extends Obra {
  certames: RawCertameDetalhe[] | null;
}

export interface ObraDetalhe {
  obra: Obra;
  certames: CertameResumo[];
}

/**
 * Detalhe da obra. NÃO embute `certames(propostas(...))`: há duas relações entre
 * certame e proposta (propostas.certame_id e certames.vencedora_proposta_id), o
 * que torna o embed ambíguo no PostgREST (erro). As propostas vêm numa segunda
 * consulta e são agregadas no cliente.
 */
export async function fetchObra(id: string): Promise<ObraDetalhe | null> {
  const { data, error } = await db()
    .from('obras')
    .select(
      `id, org_id, nome, cidade, fase, fase_pill, criado_por, created_at, updated_at, deleted_at,
       certames ( id, categoria, titulo, status, vencedora_proposta_id )`,
    )
    .eq('id', id)
    .is('deleted_at', null)
    .is('certames.deleted_at', null)
    .maybeSingle();
  if (error) throw error;
  if (!data) return null;

  const row = data as unknown as RawObraDetalhe;
  const { certames, ...obra } = row;
  const certs = certames ?? [];

  // Propostas dos certames desta obra (uma consulta só).
  const porCertame = new Map<string, { id: string; fornecedor: string }[]>();
  const ids = certs.map((c) => c.id);
  if (ids.length > 0) {
    const { data: pdata, error: pErr } = await db()
      .from('propostas')
      .select('id, fornecedor, certame_id')
      .in('certame_id', ids)
      .is('deleted_at', null);
    if (pErr) throw pErr;
    for (const p of (pdata ?? []) as { id: string; fornecedor: string; certame_id: string }[]) {
      const arr = porCertame.get(p.certame_id) ?? [];
      arr.push({ id: p.id, fornecedor: p.fornecedor });
      porCertame.set(p.certame_id, arr);
    }
  }

  const resumos: CertameResumo[] = certs.map((c) => {
    const props = porCertame.get(c.id) ?? [];
    const venc = props.find((p) => p.id === c.vencedora_proposta_id);
    return {
      id: c.id,
      categoria: c.categoria,
      titulo: c.titulo,
      status: c.status,
      vencedoraFornecedor: venc?.fornecedor ?? null,
      totalPropostas: props.length,
    };
  });
  return { obra: obra as Obra, certames: resumos };
}

/* ---------- Acesso por obra: convites ---------- */

export interface ConviteRecebido {
  id: string;
  obraId: string;
  obraNome: string;
  obraCidade: string | null;
  convidadoPor: string | null;
  createdAt: string;
}

/** Convites pendentes para mim (RPC `meus_convites`, por user_id ou e-mail). */
export async function fetchMeusConvites(): Promise<ConviteRecebido[]> {
  const { data, error } = await db().rpc('meus_convites');
  if (error) throw error;
  return ((data ?? []) as {
    id: string;
    obra_id: string;
    obra_nome: string;
    obra_cidade: string | null;
    convidado_por_email: string | null;
    created_at: string;
  }[]).map((r) => ({
    id: r.id,
    obraId: r.obra_id,
    obraNome: r.obra_nome,
    obraCidade: r.obra_cidade,
    convidadoPor: r.convidado_por_email,
    createdAt: r.created_at,
  }));
}

export interface AcessoObra {
  /** null para a linha do dono. */
  conviteId: string | null;
  email: string;
  status: 'dono' | 'pendente' | 'aceito';
}

/** Quem tem acesso à obra: dono + convites pendentes/aceitos. */
export async function fetchAcessoObra(obraId: string): Promise<AcessoObra[]> {
  const { data, error } = await db().rpc('listar_acesso_obra', { p_obra: obraId });
  if (error) throw error;
  return ((data ?? []) as { convite_id: string | null; email: string; status: string }[]).map((r) => ({
    conviteId: r.convite_id,
    email: r.email,
    status: r.status as AcessoObra['status'],
  }));
}

/* ---------- Categorias (organizar) ---------- */

/** Categorias em uso (certames ativos) + sugestões sem uso, com contagens. */
export async function fetchCategorias(): Promise<CategoriaUso[]> {
  const { data, error } = await db().rpc('listar_categorias');
  if (error) throw error;
  return ((data ?? []) as { nome: string; propostas: number | string; obras: number | string }[]).map((r) => ({
    nome: r.nome,
    propostas: Number(r.propostas),
    obras: Number(r.obras),
  }));
}

/* ---------- Proposta (detalhe + versões) ---------- */

export interface VersaoDetalhe {
  id: string;
  n: number;
  data: string;
  valor: number | null;
  prazo: number | null;
  condicao_pagamento: string | null;
  garantia: string | null;
  obs: string | null;
  arquivo_path: string | null;
  /** Saída da IA gravada na versão (itens, alertas…). */
  dados_extraidos: Partial<PropostaExtraida> | null;
}

export interface PropostaDetalhe {
  id: string;
  fornecedor: string;
  /** Rótulo da alternativa de preço (null = preço único). */
  opcao: string | null;
  status: PropostaStatus;
  valorAtual: number | null;
  prazoAtual: number | null;
  condicaoPagamento: string | null;
  garantia: string | null;
  versaoAtual: number;
  categoria: string;
  obraId: string;
  obraNome: string;
  certameId: string;
  certameTitulo: string;
  certameStatus: CertameStatus;
  /** Versões em ordem decrescente (a mais nova primeiro). */
  versoes: VersaoDetalhe[];
}

/**
 * Detalhe da proposta — à prova de falhas: a proposta SEMPRE abre.
 * Sem `!inner` nem filtros aninhados, para que um certame/obra com dado
 * estranho (ou excluído) nunca esconda a linha. Busca a proposta primeiro e,
 * em paralelo, o certame (com o nome da obra) e as versões. Consultas simples
 * e separadas eliminam qualquer ambiguidade de embed.
 */
export async function fetchProposta(id: string): Promise<PropostaDetalhe | null> {
  const { data: p, error } = await db()
    .from('propostas')
    .select(
      'id, fornecedor, opcao, status, valor_atual, prazo_atual, condicao_pagamento, garantia, versao_atual, certame_id',
    )
    .eq('id', id)
    .is('deleted_at', null)
    .maybeSingle();
  if (error) throw error;
  if (!p) return null;

  const [certRes, versRes] = await Promise.all([
    db()
      .from('certames')
      .select('id, titulo, categoria, status, obra_id, obras ( nome )')
      .eq('id', p.certame_id)
      .maybeSingle(),
    db()
      .from('proposta_versoes')
      .select('id, n, data, valor, prazo, condicao_pagamento, garantia, obs, arquivo_path, dados_extraidos')
      .eq('proposta_id', id)
      .order('n', { ascending: false }),
  ]);

  const cert = certRes.data as {
    id: string;
    titulo: string;
    categoria: string;
    status: CertameStatus;
    obra_id: string;
    obras: { nome: string } | { nome: string }[] | null;
  } | null;
  const obra = one(cert?.obras);
  const versoes = (versRes.data ?? []) as VersaoDetalhe[];

  return {
    id: p.id,
    fornecedor: p.fornecedor,
    opcao: (p as { opcao?: string | null }).opcao ?? null,
    status: p.status,
    valorAtual: p.valor_atual,
    prazoAtual: p.prazo_atual,
    condicaoPagamento: p.condicao_pagamento,
    garantia: p.garantia,
    versaoAtual: p.versao_atual,
    categoria: cert?.categoria ?? '',
    obraId: cert?.obra_id ?? '',
    obraNome: obra?.nome ?? '',
    certameId: p.certame_id,
    certameTitulo: cert?.titulo ?? '',
    certameStatus: (cert?.status ?? 'aberta') as CertameStatus,
    versoes,
  };
}

/** URL assinada (curta) para baixar um arquivo do bucket privado `propostas`. */
export async function urlArquivoProposta(path: string): Promise<string> {
  const { data, error } = await db().storage.from('propostas').createSignedUrl(path, 120);
  if (error || !data) throw error ?? new Error('Arquivo indisponível.');
  return data.signedUrl;
}

/* ---------- Equalização ---------- */

import type { PropostaComparavel } from '@bid/core';

export type EqualizacaoEscopo = 'obra' | 'entre_obras';

export interface EqualizacaoResumo {
  id: string;
  escopo: EqualizacaoEscopo;
  categoria: string;
  certameId: string | null;
  certameStatus: CertameStatus | null;
  totalPropostas: number;
  temAnalise: boolean;
}

/** Resultado gravado em `equalizacoes.resultado_ia` (forma do core, campos opcionais nas análises antigas). */
export type ResultadoIA = Partial<AnaliseEqualizacao>;

export interface EqualizacaoDetalhe {
  id: string;
  escopo: EqualizacaoEscopo;
  categoria: string;
  /** Régua do projeto informada ao iniciar (opcional). */
  referencia: string | null;
  certameId: string | null;
  certameTitulo: string | null;
  certameStatus: CertameStatus | null;
  vencedoraPropostaId: string | null;
  obraNome: string | null;
  propostas: (PropostaComparavel & { obraNome: string })[];
  resultadoIa: ResultadoIA | null;
}

interface RawEqRow {
  id: string;
  escopo: EqualizacaoEscopo;
  categoria: string;
  certame_id: string | null;
  proposta_ids: string[];
  resultado_ia: ResultadoIA | null;
  certames: { status: CertameStatus } | { status: CertameStatus }[] | null;
}

export async function fetchEqualizacoes(): Promise<EqualizacaoResumo[]> {
  const { data, error } = await db()
    .from('equalizacoes')
    .select('id, escopo, categoria, certame_id, proposta_ids, resultado_ia, certames ( status )')
    .is('deleted_at', null)
    .order('created_at', { ascending: false });
  if (error) throw error;
  const rows = (data ?? []) as unknown as RawEqRow[];
  return rows.map((r) => {
    const cert = one(r.certames);
    return {
      id: r.id,
      escopo: r.escopo,
      categoria: r.categoria,
      certameId: r.certame_id,
      certameStatus: cert?.status ?? null,
      totalPropostas: r.proposta_ids?.length ?? 0,
      temAnalise: r.resultado_ia != null,
    };
  });
}

/** Mapeia uma linha de proposta (com certame→obra) para comparável + obra. */
function toComparavel(p: {
  id: string;
  fornecedor: string;
  opcao?: string | null;
  valor_atual: number | null;
  prazo_atual: number | null;
  condicao_pagamento: string | null;
  garantia: string | null;
  certames?: { obras?: { nome: string } | { nome: string }[] | null } | { obras?: unknown }[] | null;
}): PropostaComparavel & { obraNome: string } {
  const cert = one(p.certames as { obras?: { nome: string } | { nome: string }[] | null } | null);
  const obra = one(cert?.obras ?? null);
  return {
    id: p.id,
    fornecedor: p.fornecedor,
    opcao: p.opcao ?? null,
    valor: p.valor_atual,
    prazo: p.prazo_atual,
    condicaoPagamento: p.condicao_pagamento,
    garantia: p.garantia,
    obraNome: obra?.nome ?? '',
  };
}

export async function fetchEqualizacao(id: string): Promise<EqualizacaoDetalhe | null> {
  const { data, error } = await db()
    .from('equalizacoes')
    .select(
      `id, escopo, categoria, referencia, certame_id, proposta_ids, resultado_ia,
       certames ( id, titulo, status, vencedora_proposta_id, obras ( nome ) )`,
    )
    .eq('id', id)
    .is('deleted_at', null)
    .maybeSingle();
  if (error) throw error;
  if (!data) return null;
  const r = data as unknown as {
    id: string;
    escopo: EqualizacaoEscopo;
    categoria: string;
    referencia: string | null;
    certame_id: string | null;
    proposta_ids: string[];
    resultado_ia: ResultadoIA | null;
    certames: {
      id: string;
      titulo: string;
      status: CertameStatus;
      vencedora_proposta_id: string | null;
      obras: { nome: string } | { nome: string }[] | null;
    } | null;
  };

  const { data: pdata, error: pErr } = await db()
    .from('propostas')
    .select(
      `id, fornecedor, opcao, valor_atual, prazo_atual, condicao_pagamento, garantia,
       certames ( obras ( nome ) )`,
    )
    .in('id', r.proposta_ids.length ? r.proposta_ids : ['00000000-0000-0000-0000-000000000000'])
    .is('deleted_at', null);
  if (pErr) throw pErr;
  const mapaProp = new Map(
    ((pdata ?? []) as unknown as Parameters<typeof toComparavel>[0][]).map((p) => [p.id, toComparavel(p)]),
  );
  // Preserva a ordem de seleção (`proposta_ids`): o Postgres não garante a ordem do `.in`.
  const propostas = r.proposta_ids
    .map((pid) => mapaProp.get(pid))
    .filter((p): p is PropostaComparavel & { obraNome: string } => p !== undefined);

  const cert = one(r.certames);
  const obra = one(cert?.obras ?? null);
  return {
    id: r.id,
    escopo: r.escopo,
    categoria: r.categoria,
    referencia: r.referencia ?? null,
    certameId: r.certame_id,
    certameTitulo: cert?.titulo ?? null,
    certameStatus: cert?.status ?? null,
    vencedoraPropostaId: cert?.vencedora_proposta_id ?? null,
    obraNome: obra?.nome ?? null,
    propostas,
    resultadoIa: r.resultado_ia,
  };
}

/** Propostas de um certame (para iniciar equalização de escopo obra). */
export async function fetchPropostasDoCertame(
  certameId: string,
): Promise<(PropostaComparavel & { obraNome: string })[]> {
  const { data, error } = await db()
    .from('propostas')
    .select(
      `id, fornecedor, opcao, valor_atual, prazo_atual, condicao_pagamento, garantia,
       certames ( obras ( nome ) )`,
    )
    .eq('certame_id', certameId)
    .is('deleted_at', null);
  if (error) throw error;
  return ((data ?? []) as unknown as Parameters<typeof toComparavel>[0][]).map(toComparavel);
}

/** Propostas de uma categoria em todas as obras (escopo entre_obras). */
export async function fetchPropostasPorCategoria(
  categoria: string,
): Promise<(PropostaComparavel & { obraNome: string })[]> {
  const { data, error } = await db()
    .from('propostas')
    .select(
      `id, fornecedor, opcao, valor_atual, prazo_atual, condicao_pagamento, garantia,
       certames!inner ( categoria, obras!inner ( nome ) )`,
    )
    .eq('certames.categoria', categoria)
    .is('deleted_at', null)
    .is('certames.deleted_at', null);
  if (error) throw error;
  return ((data ?? []) as unknown as Parameters<typeof toComparavel>[0][]).map(toComparavel);
}

/* ---------- Contratos ---------- */

import type { ContratoStatus } from '@bid/core';

export interface ContratoResumo {
  id: string;
  categoria: string;
  obraNome: string;
  valor: number | null;
  status: ContratoStatus;
  temPdf: boolean;
}

export interface ClausulaRow {
  id: string;
  numero: number;
  titulo: string;
  texto: string;
  origem: 'proposta' | 'modelo';
}

export interface ContratoDetalhe {
  id: string;
  categoria: string;
  obraNome: string;
  valor: number | null;
  status: ContratoStatus;
  propostaId: string;
  certameId: string | null;
  pdfPath: string | null;
  paginas: number | null;
  clausulas: ClausulaRow[];
}

interface RawContratoRow {
  id: string;
  categoria: string;
  valor: number | null;
  status: ContratoStatus;
  pdf_path: string | null;
  obras: { nome: string } | { nome: string }[] | null;
}

export async function fetchContratos(): Promise<ContratoResumo[]> {
  const { data, error } = await db()
    .from('contratos')
    .select('id, categoria, valor, status, pdf_path, obras ( nome )')
    .is('deleted_at', null)
    .order('created_at', { ascending: false });
  if (error) throw error;
  const rows = (data ?? []) as unknown as RawContratoRow[];
  return rows.map((r) => ({
    id: r.id,
    categoria: r.categoria,
    obraNome: one(r.obras)?.nome ?? '',
    valor: r.valor,
    status: r.status,
    temPdf: Boolean(r.pdf_path),
  }));
}

export async function fetchContrato(id: string): Promise<ContratoDetalhe | null> {
  const { data, error } = await db()
    .from('contratos')
    .select(
      `id, categoria, valor, status, proposta_id, pdf_path, paginas,
       obras ( nome ),
       propostas ( certame_id ),
       contrato_clausulas ( id, numero, titulo, texto, origem )`,
    )
    .eq('id', id)
    .is('deleted_at', null)
    .maybeSingle();
  if (error) throw error;
  if (!data) return null;
  const r = data as unknown as {
    id: string;
    categoria: string;
    valor: number | null;
    status: ContratoStatus;
    proposta_id: string;
    pdf_path: string | null;
    paginas: number | null;
    obras: { nome: string } | { nome: string }[] | null;
    propostas: { certame_id: string | null } | { certame_id: string | null }[] | null;
    contrato_clausulas: ClausulaRow[] | null;
  };
  const clausulas = [...(r.contrato_clausulas ?? [])].sort((a, b) => a.numero - b.numero);
  return {
    id: r.id,
    categoria: r.categoria,
    obraNome: one(r.obras)?.nome ?? '',
    valor: r.valor,
    status: r.status,
    propostaId: r.proposta_id,
    certameId: one(r.propostas)?.certame_id ?? null,
    pdfPath: r.pdf_path,
    paginas: r.paginas,
    clausulas,
  };
}

export interface VencedoraResumo {
  id: string;
  /** Já com o rótulo da opção, quando houver ("PANAIR · Opção 2"). */
  fornecedor: string;
  categoria: string;
  obraNome: string;
}

/** Propostas vencedoras (para criar contrato a partir delas). */
export async function fetchVencedoras(): Promise<VencedoraResumo[]> {
  const { data, error } = await db()
    .from('propostas')
    .select('id, fornecedor, opcao, certames!inner ( categoria, status, obras!inner ( nome ) )')
    .eq('status', 'vencedora')
    .eq('certames.status', 'adjudicada')
    .is('deleted_at', null)
    .is('certames.deleted_at', null);
  if (error) throw error;
  const rows = (data ?? []) as unknown as {
    id: string;
    fornecedor: string;
    opcao: string | null;
    certames: { categoria: string; obras: { nome: string } | { nome: string }[] | null } | { categoria: string }[] | null;
  }[];
  // Exclui as vencedoras que já viraram contrato (evita duplicar).
  const { data: cts } = await db().from('contratos').select('proposta_id').is('deleted_at', null);
  const jaContratadas = new Set(((cts ?? []) as { proposta_id: string }[]).map((c) => c.proposta_id));

  return rows
    .filter((r) => !jaContratadas.has(r.id))
    .map((r) => {
      const cert = one(
        r.certames as { categoria: string; obras?: { nome: string } | { nome: string }[] | null } | null,
      );
      return {
        id: r.id,
        fornecedor: nomeProposta(r.fornecedor, r.opcao),
        categoria: cert?.categoria ?? '',
        obraNome: one(cert?.obras ?? null)?.nome ?? '',
      };
    });
}

import type { ParteAssinatura, ViaAssinatura } from '@bid/core';

export interface AssinaturaLinha {
  parte: ParteAssinatura;
  assinadoEm: string | null;
  via: ViaAssinatura | null;
  signatarioNome: string | null;
}

/** Assinaturas de um contrato (para mostrar o status das partes). */
export async function fetchAssinaturas(contratoId: string): Promise<AssinaturaLinha[]> {
  const { data, error } = await db()
    .from('assinaturas')
    .select('parte, assinado_em, via, signatario_nome')
    .eq('contrato_id', contratoId);
  if (error) throw error;
  return ((data ?? []) as {
    parte: ParteAssinatura;
    assinado_em: string | null;
    via: ViaAssinatura | null;
    signatario_nome: string | null;
  }[]).map((r) => ({
    parte: r.parte,
    assinadoEm: r.assinado_em,
    via: r.via,
    signatarioNome: r.signatario_nome,
  }));
}

/** URL assinada (curta) para baixar o PDF do contrato (bucket privado). */
export async function urlContratoPdf(path: string): Promise<string> {
  const { data, error } = await db().storage.from('contratos').createSignedUrl(path, 120);
  if (error || !data) throw error ?? new Error('PDF indisponível.');
  return data.signedUrl;
}

/* ---------- Organização ---------- */

/** A organização do usuário (a primeira; criada no signup). RLS garante o escopo. */
export async function fetchMinhaOrg(): Promise<Organizacao | null> {
  const { data, error } = await db()
    .from('organizacoes')
    .select('id, nome')
    .order('created_at', { ascending: true })
    .limit(1)
    .maybeSingle();
  if (error) throw error;
  return (data as Organizacao | null) ?? null;
}

export type MembroPapel = 'gestor' | 'equipe';

export interface Membro {
  userId: string;
  email: string;
  papel: MembroPapel;
}

/** Membros da organização (via RPC, que lê o e-mail em auth.users). */
export async function fetchMembros(orgId: string): Promise<Membro[]> {
  const { data, error } = await db().rpc('listar_membros', { p_org: orgId });
  if (error) throw error;
  return ((data ?? []) as { user_id: string; email: string; papel: MembroPapel }[]).map((m) => ({
    userId: m.user_id,
    email: m.email,
    papel: m.papel,
  }));
}

/* ---------- Sugestões (autocomplete) ---------- */

export async function fetchSugestoes(
  tipo: 'categoria' | 'fornecedor' | 'obra' | 'local',
): Promise<{ texto: string; uso: number }[]> {
  const { data, error } = await db()
    .from('sugestoes')
    .select('texto, uso')
    .eq('tipo', tipo)
    .order('uso', { ascending: false })
    .limit(100);
  if (error) throw error;
  return (data ?? []) as { texto: string; uso: number }[];
}
