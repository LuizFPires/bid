import type { VercelRequest, VercelResponse } from '@vercel/node';
import Anthropic from '@anthropic-ai/sdk';
import { nomeProposta } from '@bid/core';
import { analisarEqualizacao, type DocumentoProposta, type PropostaParaIA } from '@bid/server';
import { MissingEnvError, env } from '@bid/server';
import { bearer, requireMethod } from '@bid/server';
import { userClient } from '@bid/server';

/**
 * POST /api/ai/equalize
 * Entrada: { id } — id de uma equalização já criada.
 * Ação: carrega as propostas (RLS, contexto do usuário), pede a análise à Claude
 * e grava em `equalizacoes.resultado_ia`. A recomendação é APOIO (regra #6).
 */
// PDFs que a IA lê por inteiro: limite por arquivo e no total (tempo + custo).
const MAX_PDF_BYTES = 8 * 1024 * 1024;
const MAX_TOTAL_PDF_BYTES = 24 * 1024 * 1024;

export default async function handler(req: VercelRequest, res: VercelResponse) {
  try {
    await processar(req, res);
  } catch (e) {
    console.error('equalize crash:', e);
    if (!res.headersSent) res.status(502).json({ erro: 'Não foi possível gerar a análise.' });
  }
}

async function processar(req: VercelRequest, res: VercelResponse) {
  if (!requireMethod(req, res, 'POST')) return;

  const token = bearer(req);
  if (!token) {
    res.status(401).json({ erro: 'Não autenticado.' });
    return;
  }

  const id = (req.body as { id?: unknown } | null)?.id;
  if (typeof id !== 'string' || !id) {
    res.status(400).json({ erro: 'Informe o id da equalização.' });
    return;
  }

  const sb = userClient(token);
  const { data: eq, error: eqErr } = await sb
    .from('equalizacoes')
    .select('id, proposta_ids, referencia')
    .eq('id', id)
    .is('deleted_at', null)
    .maybeSingle();
  if (eqErr || !eq) {
    res.status(404).json({ erro: 'Equalização não encontrada.' });
    return;
  }

  const ids = (eq as { proposta_ids: string[] }).proposta_ids ?? [];
  const referencia = (eq as { referencia: string | null }).referencia ?? null;
  if (ids.length < 2) {
    res.status(400).json({ erro: 'A equalização precisa de ao menos duas propostas.' });
    return;
  }

  const { data: props, error: pErr } = await sb
    .from('propostas')
    .select('id, fornecedor, opcao, valor_atual, prazo_atual, condicao_pagamento, garantia')
    .in('id', ids)
    .is('deleted_at', null);
  if (pErr || !props) {
    res.status(502).json({ erro: 'Falha ao carregar as propostas.' });
    return;
  }
  // As propostas podem ter perdido visibilidade (soft-delete) desde a criação:
  // não analisa um conjunto degenerado.
  if (props.length < 2) {
    res.status(409).json({ erro: 'Menos de duas propostas acessíveis para comparar.' });
    return;
  }

  // Itens extraídos e o ARQUIVO ficam na última versão de cada proposta.
  const { data: versoes } = await sb
    .from('proposta_versoes')
    .select('proposta_id, n, dados_extraidos, arquivo_path')
    .in('proposta_id', ids);
  const ultimaPorProposta = new Map<string, { n: number; itens: unknown; arquivo_path: string | null }>();
  for (const v of (versoes ?? []) as {
    proposta_id: string;
    n: number;
    dados_extraidos: { itens?: unknown } | null;
    arquivo_path: string | null;
  }[]) {
    const atual = ultimaPorProposta.get(v.proposta_id);
    if (!atual || v.n > atual.n) {
      ultimaPorProposta.set(v.proposta_id, { n: v.n, itens: v.dados_extraidos?.itens ?? [], arquivo_path: v.arquivo_path });
    }
  }

  const propostas: PropostaParaIA[] = (
    props as {
      id: string;
      fornecedor: string;
      opcao: string | null;
      valor_atual: number | null;
      prazo_atual: number | null;
      condicao_pagamento: string | null;
      garantia: string | null;
    }[]
  ).map((p) => ({
    id: p.id,
    // Duas opções do mesmo fornecedor precisam de nomes distintos para a IA.
    fornecedor: nomeProposta(p.fornecedor, p.opcao),
    valor: p.valor_atual,
    prazo: p.prazo_atual,
    condicao_pagamento: p.condicao_pagamento,
    garantia: p.garantia,
    itens: ultimaPorProposta.get(p.id)?.itens ?? [],
  }));

  // PDFs originais (última versão), lidos no contexto do usuário (RLS do
  // Storage). Só PDFs, dentro dos limites; o que faltar segue só com os dados.
  const documentos: DocumentoProposta[] = [];
  let totalBytes = 0;
  for (const p of propostas) {
    const path = ultimaPorProposta.get(p.id)?.arquivo_path;
    if (!path || !path.toLowerCase().endsWith('.pdf')) continue;
    try {
      const { data: signed } = await sb.storage.from('propostas').createSignedUrl(path, 60);
      if (!signed) continue;
      const resp = await fetch(signed.signedUrl);
      if (!resp.ok) continue;
      const declarado = Number(resp.headers.get('content-length'));
      if (Number.isFinite(declarado) && declarado > MAX_PDF_BYTES) continue;
      const buf = Buffer.from(await resp.arrayBuffer());
      if (buf.byteLength > MAX_PDF_BYTES || totalBytes + buf.byteLength > MAX_TOTAL_PDF_BYTES) continue;
      totalBytes += buf.byteLength;
      documentos.push({ proposta_id: p.id, fornecedor: p.fornecedor, pdfBase64: buf.toString('base64') });
    } catch (e) {
      console.error('equalize: falha ao ler PDF', path, e);
    }
  }

  try {
    const client = new Anthropic({ apiKey: env.anthropicKey() });
    const analise = await analisarEqualizacao(client, propostas, { referencia, documentos });
    const { data: eqRow, error: upErr } = await sb
      .from('equalizacoes')
      .update({ resultado_ia: analise })
      .eq('id', id)
      .select('org_id')
      .single();
    if (upErr || !eqRow) {
      res.status(502).json({ erro: 'Análise gerada, mas falhou ao salvar.' });
      return;
    }
    // Trilha de auditoria: quem rodou a IA (regra #10). Best-effort.
    await sb.from('eventos').insert({
      org_id: (eqRow as { org_id: string }).org_id,
      entidade: 'equalizacao',
      entidade_id: id,
      tipo: 'equalizacao_analisada',
      payload: { recomendacao: analise.recomendacao.proposta_id, pdfs: documentos.length, com_referencia: !!referencia },
    });
    res.status(200).json({ analise });
  } catch (e) {
    if (e instanceof MissingEnvError) {
      res.status(503).json({ erro: 'Análise por IA não configurada no servidor.' });
      return;
    }
    console.error('equalize falhou:', e);
    res.status(502).json({ erro: 'Não foi possível gerar a análise.' });
  }
}
