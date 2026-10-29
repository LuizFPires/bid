import { certameAtivo, type CertameStatus, type PropostaAcervo, type PropostaStatus } from '@bid/core';
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
      `id, fornecedor, status, valor_atual, versao_atual, certame_id,
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
      `id, org_id, nome, cidade, fase, fase_pill, created_at, updated_at, deleted_at,
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

interface RawObraDetalhe extends Obra {
  certames:
    | {
        id: string;
        categoria: string;
        titulo: string;
        status: string;
        vencedora_proposta_id: string | null;
        propostas: { id: string; fornecedor: string; status: string }[] | null;
      }[]
    | null;
}

export interface ObraDetalhe {
  obra: Obra;
  certames: CertameResumo[];
}

export async function fetchObra(id: string): Promise<ObraDetalhe | null> {
  const { data, error } = await db()
    .from('obras')
    .select(
      `id, org_id, nome, cidade, fase, fase_pill, created_at, updated_at, deleted_at,
       certames ( id, categoria, titulo, status, vencedora_proposta_id,
                  propostas ( id, fornecedor, status ) )`,
    )
    .eq('id', id)
    .is('deleted_at', null)
    .maybeSingle();
  if (error) throw error;
  if (!data) return null;

  const row = data as unknown as RawObraDetalhe;
  const { certames, ...obra } = row;
  const resumos: CertameResumo[] = (certames ?? []).map((c) => {
    const props = c.propostas ?? [];
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
}

export interface PropostaDetalhe {
  id: string;
  fornecedor: string;
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

interface RawPropostaDetalhe {
  id: string;
  fornecedor: string;
  status: PropostaStatus;
  valor_atual: number | null;
  prazo_atual: number | null;
  condicao_pagamento: string | null;
  garantia: string | null;
  versao_atual: number;
  certame_id: string;
  certames:
    | {
        id: string;
        titulo: string;
        categoria: string;
        status: CertameStatus;
        obra_id: string;
        obras: { id: string; nome: string } | { id: string; nome: string }[] | null;
      }
    | null;
  proposta_versoes: VersaoDetalhe[] | null;
}

export async function fetchProposta(id: string): Promise<PropostaDetalhe | null> {
  const { data, error } = await db()
    .from('propostas')
    .select(
      `id, fornecedor, status, valor_atual, prazo_atual, condicao_pagamento, garantia, versao_atual, certame_id,
       certames!inner ( id, titulo, categoria, status, obra_id, obras!inner ( id, nome ) ),
       proposta_versoes ( id, n, data, valor, prazo, condicao_pagamento, garantia, obs, arquivo_path )`,
    )
    .eq('id', id)
    .is('deleted_at', null)
    .is('certames.deleted_at', null)
    .is('certames.obras.deleted_at', null)
    .maybeSingle();
  if (error) throw error;
  if (!data) return null;

  const r = data as unknown as RawPropostaDetalhe;
  const cert = one(r.certames);
  const obra = one(cert?.obras);
  const versoes = [...(r.proposta_versoes ?? [])].sort((a, b) => b.n - a.n);
  return {
    id: r.id,
    fornecedor: r.fornecedor,
    status: r.status,
    valorAtual: r.valor_atual,
    prazoAtual: r.prazo_atual,
    condicaoPagamento: r.condicao_pagamento,
    garantia: r.garantia,
    versaoAtual: r.versao_atual,
    categoria: cert?.categoria ?? '',
    obraId: cert?.obra_id ?? '',
    obraNome: obra?.nome ?? '',
    certameId: r.certame_id,
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
