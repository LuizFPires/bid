import type { VercelRequest, VercelResponse } from '@vercel/node';
import Anthropic from '@anthropic-ai/sdk';
import { analisarEqualizacao, type PropostaParaIA } from '@bid/server';
import { MissingEnvError, env } from '@bid/server';
import { bearer, requireMethod } from '@bid/server';
import { userClient } from '@bid/server';

/**
 * POST /api/ai/equalize
 * Entrada: { id } — id de uma equalização já criada.
 * Ação: carrega as propostas (RLS, contexto do usuário), pede a análise à Claude
 * e grava em `equalizacoes.resultado_ia`. A recomendação é APOIO (regra #6).
 */
export default async function handler(req: VercelRequest, res: VercelResponse) {
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
    .select('id, proposta_ids')
    .eq('id', id)
    .is('deleted_at', null)
    .maybeSingle();
  if (eqErr || !eq) {
    res.status(404).json({ erro: 'Equalização não encontrada.' });
    return;
  }

  const ids = (eq as { proposta_ids: string[] }).proposta_ids ?? [];
  if (ids.length < 2) {
    res.status(400).json({ erro: 'A equalização precisa de ao menos duas propostas.' });
    return;
  }

  const { data: props, error: pErr } = await sb
    .from('propostas')
    .select('id, fornecedor, valor_atual, prazo_atual, condicao_pagamento, garantia')
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

  // Itens extraídos ficam na última versão de cada proposta (dados_extraidos).
  const { data: versoes } = await sb
    .from('proposta_versoes')
    .select('proposta_id, n, dados_extraidos')
    .in('proposta_id', ids);
  const itensPorProposta = new Map<string, unknown>();
  for (const v of (versoes ?? []) as { proposta_id: string; n: number; dados_extraidos: { itens?: unknown } | null }[]) {
    const atual = itensPorProposta.get(v.proposta_id) as { n: number } | undefined;
    if (!atual || v.n > atual.n) {
      itensPorProposta.set(v.proposta_id, { n: v.n, itens: v.dados_extraidos?.itens ?? [] });
    }
  }

  const propostas: PropostaParaIA[] = (
    props as {
      id: string;
      fornecedor: string;
      valor_atual: number | null;
      prazo_atual: number | null;
      condicao_pagamento: string | null;
      garantia: string | null;
    }[]
  ).map((p) => ({
    id: p.id,
    fornecedor: p.fornecedor,
    valor: p.valor_atual,
    prazo: p.prazo_atual,
    condicao_pagamento: p.condicao_pagamento,
    garantia: p.garantia,
    itens: (itensPorProposta.get(p.id) as { itens?: unknown } | undefined)?.itens ?? [],
  }));

  try {
    const client = new Anthropic({ apiKey: env.anthropicKey() });
    const analise = await analisarEqualizacao(client, propostas);
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
      payload: { recomendacao: analise.recomendacao.proposta_id },
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
