import type { VercelRequest, VercelResponse } from '@vercel/node';
// Imports estáticos (sem uso direto) para o empacotador da Vercel levar react e
// @react-pdf/renderer junto com esta função: o @bid/server os carrega por
// import dinâmico, que o rastreador de dependências não enxerga.
import 'react';
import '@react-pdf/renderer';
import { nomeProposta, normalizarAnalise } from '@bid/core';
import { bearer, requireMethod } from '@bid/server';
import { renderRelatorioEqualizacaoPdf } from '@bid/server';
import { userClient } from '@bid/server';

/**
 * POST /api/equalizacoes/pdf
 * Entrada: { id } — id da equalização (com relatório da IA já gerado).
 * Saída: o PDF do relatório (application/pdf), renderizado na hora no contexto
 * do usuário (RLS decide o que ele pode ver). Nada é gravado.
 */
export default async function handler(req: VercelRequest, res: VercelResponse) {
  try {
    await processar(req, res);
  } catch (e) {
    console.error('equalizacoes/pdf crash:', e);
    // Sem acesso aos logs da plataforma, a mensagem (curta, sem stack) é o único
    // caminho de diagnóstico para o usuário reportar.
    const msg = String((e as Error)?.message ?? e).replace(/\s+/g, ' ').slice(0, 160);
    if (!res.headersSent) res.status(502).json({ erro: `Não foi possível gerar o PDF. (${msg})` });
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
  const { data: eq, error } = await sb
    .from('equalizacoes')
    .select('id, escopo, categoria, referencia, proposta_ids, resultado_ia, org_id, certames ( obras ( nome ) )')
    .eq('id', id)
    .is('deleted_at', null)
    .maybeSingle();
  if (error || !eq) {
    res.status(404).json({ erro: 'Equalização não encontrada.' });
    return;
  }
  const r = eq as unknown as {
    id: string;
    escopo: 'obra' | 'entre_obras';
    categoria: string;
    referencia: string | null;
    proposta_ids: string[];
    resultado_ia: unknown;
    org_id: string;
    certames: { obras: { nome: string } | { nome: string }[] | null } | { obras: unknown }[] | null;
  };
  if (!r.resultado_ia) {
    res.status(409).json({ erro: 'Gere o relatório com IA antes de baixar o PDF.' });
    return;
  }

  const { data: props } = await sb
    .from('propostas')
    .select('id, fornecedor, opcao, valor_atual, prazo_atual, condicao_pagamento, garantia')
    .in('id', r.proposta_ids.length ? r.proposta_ids : ['00000000-0000-0000-0000-000000000000'])
    .is('deleted_at', null);
  const mapa = new Map(
    ((props ?? []) as { id: string; fornecedor: string; opcao: string | null; valor_atual: number | null; prazo_atual: number | null; condicao_pagamento: string | null; garantia: string | null }[]).map(
      (p) => [p.id, p] as const,
    ),
  );
  const propostas = r.proposta_ids
    .map((pid) => mapa.get(pid))
    .filter((p): p is NonNullable<typeof p> => !!p)
    .map((p) => ({
      id: p.id,
      nome: nomeProposta(p.fornecedor, p.opcao),
      valor: p.valor_atual,
      prazo: p.prazo_atual,
      pagamento: p.condicao_pagamento,
      garantia: p.garantia,
    }));

  const cert = Array.isArray(r.certames) ? r.certames[0] : r.certames;
  const obras = (cert as { obras?: { nome: string } | { nome: string }[] | null } | null)?.obras ?? null;
  const obra = Array.isArray(obras) ? (obras[0]?.nome ?? null) : (obras?.nome ?? null);

  const { data: org } = await sb.from('organizacoes').select('nome').eq('id', r.org_id).maybeSingle();

  const buffer = await renderRelatorioEqualizacaoPdf({
    categoria: r.categoria,
    obra,
    escopo: r.escopo,
    referencia: r.referencia,
    dataIso: new Date().toISOString(),
    emissor: (org as { nome?: string } | null)?.nome ?? null,
    propostas,
    // Normaliza de novo: resultado antigo pode não ter as seções novas.
    analise: normalizarAnalise(r.resultado_ia, propostas.map((p) => p.id)),
  });

  const nomeArq = `equalizacao-${r.categoria.normalize('NFD').replace(/[^\w]+/g, '-').toLowerCase()}.pdf`;
  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Disposition', `attachment; filename="${nomeArq}"`);
  res.setHeader('Cache-Control', 'no-store');
  res.status(200).send(buffer);
}
