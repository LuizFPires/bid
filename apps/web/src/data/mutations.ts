import type { PropostaExtraida } from '@bid/core';
import { supabase } from '../lib/supabase';
import { fetchMinhaOrg } from './queries';
import type { Certame, Obra, Proposta } from './types';

function db() {
  if (!supabase) throw new Error('Supabase não configurado.');
  return supabase;
}

/** Registra uma sugestão de campo livre (ou soma 1 ao uso se já existir). */
export async function registrarSugestao(
  orgId: string,
  tipo: 'categoria' | 'fornecedor' | 'obra' | 'local',
  texto: string,
): Promise<void> {
  const t = texto.trim();
  if (!t) return;
  const { error } = await db().rpc('registrar_sugestao', {
    p_org: orgId,
    p_tipo: tipo,
    p_texto: t,
  });
  if (error) throw error;
}

export interface NovaObraInput {
  nome: string;
  cidade?: string;
}

export async function criarObra(input: NovaObraInput): Promise<Obra> {
  const org = await fetchMinhaOrg();
  if (!org) throw new Error('Organização não encontrada.');

  const { data, error } = await db()
    .from('obras')
    .insert({ org_id: org.id, nome: input.nome.trim(), cidade: input.cidade?.trim() || null })
    .select()
    .single();
  if (error) throw error;

  // Registrar sugestões é best-effort: não deve derrubar a criação da obra.
  try {
    await registrarSugestao(org.id, 'obra', input.nome);
    if (input.cidade) await registrarSugestao(org.id, 'local', input.cidade);
  } catch {
    // ignora — a obra já foi criada; sugestões são secundárias.
  }

  return data as Obra;
}

/* ---------- Nova proposta (upload → extração por IA → conferência → salvar) ---------- */

/** Tira acentos/espaços de um nome de arquivo, preservando a extensão. */
function nomeSeguro(nome: string): string {
  return nome
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .replace(/[^a-zA-Z0-9._-]+/g, '-')
    .replace(/-+/g, '-')
    .toLowerCase();
}

export interface ArquivoEnviado {
  path: string;
  /** true quando é PDF (único formato com extração automática neste milestone). */
  ehPdf: boolean;
}

/**
 * Envia o arquivo da proposta ao bucket privado `propostas`, na pasta do
 * usuário (`{org_id}/{user_id}/…`) — convenção exigida pela função de extração.
 */
export async function uploadPropostaArquivo(file: File): Promise<ArquivoEnviado> {
  const org = await fetchMinhaOrg();
  if (!org) throw new Error('Organização não encontrada.');
  const { data: userData, error: userErr } = await db().auth.getUser();
  if (userErr || !userData.user) throw new Error('Sessão inválida.');

  const path = `${org.id}/${userData.user.id}/${Date.now()}-${nomeSeguro(file.name)}`;
  const { error } = await db()
    .storage.from('propostas')
    .upload(path, file, { upsert: false, contentType: file.type || undefined });
  if (error) throw error;

  const ehPdf = file.type === 'application/pdf' || file.name.toLowerCase().endsWith('.pdf');
  return { path, ehPdf };
}

/** Chama a função de servidor que lê o PDF e devolve os dados para conferência. */
export async function extrairProposta(path: string): Promise<PropostaExtraida> {
  const { data: sessionData } = await db().auth.getSession();
  const token = sessionData.session?.access_token;
  if (!token) throw new Error('Sessão inválida.');

  const resp = await fetch('/api/ai/extract-proposal', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify({ path }),
  });
  if (!resp.ok) {
    const corpo = (await resp.json().catch(() => null)) as { erro?: string } | null;
    throw new Error(corpo?.erro ?? 'Falha na extração.');
  }
  const corpo = (await resp.json()) as { dados: PropostaExtraida };
  return corpo.dados;
}

export interface NovaPropostaInput {
  obraId: string;
  categoria: string;
  /** Dados já conferidos/editados pelo usuário. `fornecedor` é obrigatório. */
  dados: PropostaExtraida & { fornecedor: string };
  arquivoPath: string | null;
}

/**
 * Salva a proposta conferida: reaproveita um certame ATIVO da obra+categoria ou
 * cria um novo `aberta`; grava a proposta e a 1ª versão (com `dados_extraidos` e
 * o arquivo). Nada é gravado sem a conferência do usuário (regra #3).
 */
export async function criarProposta(input: NovaPropostaInput): Promise<Proposta> {
  const org = await fetchMinhaOrg();
  if (!org) throw new Error('Organização não encontrada.');
  const categoria = input.categoria.trim();
  const fornecedor = input.dados.fornecedor.trim();
  if (!categoria) throw new Error('Informe a categoria.');
  if (!fornecedor) throw new Error('Informe o fornecedor.');

  // Reaproveita um certame ativo (não adjudicado) da mesma obra+categoria.
  const { data: existentes, error: buscaErr } = await db()
    .from('certames')
    .select('id, org_id, obra_id, categoria, titulo, escopo, status, abertura, limite, vencedora_proposta_id')
    .eq('obra_id', input.obraId)
    .eq('categoria', categoria)
    .neq('status', 'adjudicada')
    .is('deleted_at', null)
    .order('created_at', { ascending: false })
    .limit(1);
  if (buscaErr) throw buscaErr;

  let certame = (existentes?.[0] as Certame | undefined) ?? null;
  if (!certame) {
    const { data: novo, error: certErr } = await db()
      .from('certames')
      .insert({
        org_id: org.id,
        obra_id: input.obraId,
        categoria,
        titulo: categoria,
        status: 'aberta',
      })
      .select('id, org_id, obra_id, categoria, titulo, escopo, status, abertura, limite, vencedora_proposta_id')
      .single();
    if (certErr) throw certErr;
    certame = novo as Certame;
  }

  const d = input.dados;
  const { data: proposta, error: propErr } = await db()
    .from('propostas')
    .insert({
      org_id: org.id,
      certame_id: certame.id,
      fornecedor,
      status: 'recebida',
      valor_atual: d.valor,
      prazo_atual: d.prazo_dias,
      condicao_pagamento: d.condicao_pagamento,
      garantia: d.garantia,
      versao_atual: 1,
    })
    .select('*')
    .single();
  if (propErr) throw propErr;
  const nova = proposta as Proposta;

  const { error: versaoErr } = await db()
    .from('proposta_versoes')
    .insert({
      org_id: org.id,
      proposta_id: nova.id,
      n: 1,
      valor: d.valor,
      prazo: d.prazo_dias,
      condicao_pagamento: d.condicao_pagamento,
      garantia: d.garantia,
      obs: d.observacoes,
      arquivo_path: input.arquivoPath,
      dados_extraidos: d,
    });
  if (versaoErr) throw versaoErr;

  // Sugestões são best-effort (não derrubam o salvamento).
  try {
    await registrarSugestao(org.id, 'categoria', categoria);
    await registrarSugestao(org.id, 'fornecedor', fornecedor);
  } catch {
    // ignora
  }

  return nova;
}
