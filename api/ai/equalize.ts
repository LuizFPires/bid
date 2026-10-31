import type { VercelRequest, VercelResponse } from '@vercel/node';
import Anthropic from '@anthropic-ai/sdk';
import { nomeProposta } from '@bid/core';
import { IAErro, analisarEqualizacao, detectarMidia, type DocumentoProposta, type PropostaParaIA } from '@bid/server';
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
  const ultimaPorProposta = new Map<string, { n: number; itens: unknown; alertas: unknown; arquivo_path: string | null }>();
  for (const v of (versoes ?? []) as {
    proposta_id: string;
    n: number;
    dados_extraidos: { itens?: unknown; alertas?: unknown } | null;
    arquivo_path: string | null;
  }[]) {
    const atual = ultimaPorProposta.get(v.proposta_id);
    if (!atual || v.n > atual.n) {
      ultimaPorProposta.set(v.proposta_id, { n: v.n, itens: v.dados_extraidos?.itens ?? [], alertas: v.dados_extraidos?.alertas ?? [], arquivo_path: v.arquivo_path });
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
    alertas: ultimaPorProposta.get(p.id)?.alertas ?? [],
  }));

  // PDFs originais (última versão), lidos no contexto do usuário (RLS do
  // Storage). Só PDFs, dentro dos limites; o que faltar segue só com os dados.
  const documentos: DocumentoProposta[] = [];
  let totalBytes = 0;
  for (const p of propostas) {
    const path = ultimaPorProposta.get(p.id)?.arquivo_path;
    if (!path) continue;
    try {
      const { data: signed } = await sb.storage.from('propostas').createSignedUrl(path, 60);
      if (!signed) continue;
      const resp = await fetch(signed.signedUrl);
      if (!resp.ok) continue;
      const declarado = Number(resp.headers.get('content-length'));
      if (Number.isFinite(declarado) && declarado > MAX_PDF_BYTES) continue;
      const buf = Buffer.from(await resp.arrayBuffer());
      if (buf.byteLength > MAX_PDF_BYTES || totalBytes + buf.byteLength > MAX_TOTAL_PDF_BYTES) continue;
      // Tipo real pelos bytes (planilhas e HEIC ficam de fora; a proposta segue só com os dados).
      const tipo = detectarMidia(buf, path);
      if (!tipo) continue;
      totalBytes += buf.byteLength;
      documentos.push({ proposta_id: p.id, fornecedor: p.fornecedor, pdfBase64: buf.toString('base64'), tipo });
    } catch (e) {
      console.error('equalize: falha ao ler PDF', path, e);
    }
  }

  // Tentativas, da mais rica à mais robusta: (1) PDFs + dados; (2) se a IA
  // estourou o tamanho da resposta, de novo pedindo concisão; (3) se a API
  // recusou a entrada (PDFs grandes/páginas demais), só com os dados extraídos.
  const avisos: string[] = [];
  async function gerar(client: Anthropic) {
    let docs = documentos;
    let conciso = false;
    for (let tentativa = 0; tentativa < 3; tentativa++) {
      try {
        return await analisarEqualizacao(client, propostas, { referencia, documentos: docs, conciso });
      } catch (e) {
        const st = (e as { status?: number }).status;
        const msg = String((e as Error).message ?? '');
        if (e instanceof IAErro && e.codigo === 'max_tokens' && !conciso) {
          conciso = true;
          avisos.push('Relatório resumido: a primeira versão ficou longa demais.');
          continue;
        }
        if ((st === 400 || st === 413) && docs.length > 0) {
          docs = [];
          avisos.push('Os PDFs eram grandes demais para a IA ler de uma vez; a análise usou os dados extraídos.');
          continue;
        }
        console.error('equalize: tentativa falhou', { tentativa, status: st, msg });
        throw e;
      }
    }
    throw new Error('sem tentativas');
  }

  try {
    const client = new Anthropic({ apiKey: env.anthropicKey() });
    const analise = await gerar(client);
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
    res.status(200).json({ analise, avisos });
  } catch (e) {
    if (e instanceof MissingEnvError) {
      res.status(503).json({ erro: 'Análise por IA não configurada no servidor.' });
      return;
    }
    console.error('equalize falhou:', e);
    // Mensagem ao usuário por CATEGORIA (sem internals), para ele saber se é
    // tamanho, limite da IA, instabilidade ou tempo — e o que fazer.
    const st = (e as { status?: number }).status;
    const msg = String((e as Error).message ?? '').toLowerCase();
    let erro = 'Não foi possível gerar a análise.';
    let codigo = 'desconhecido';
    if (e instanceof IAErro) {
      codigo = e.codigo;
      erro =
        e.codigo === 'max_tokens'
          ? 'A IA não conseguiu fechar o relatório no tamanho permitido. Tente de novo.'
          : 'A IA respondeu fora do formato esperado. Tente de novo.';
    } else if (st === 429) {
      codigo = 'limite';
      erro = 'Limite de uso da IA atingido no momento. Tente de novo em alguns minutos.';
    } else if (st === 529 || st === 503 || msg.includes('overloaded')) {
      codigo = 'sobrecarga';
      erro = 'A IA está sobrecarregada agora. Tente de novo em instantes.';
    } else if (st === 400 || st === 413 || msg.includes('too long') || msg.includes('too large') || msg.includes('pages')) {
      codigo = 'entrada';
      erro = 'As propostas são grandes demais para a IA processar de uma vez (PDFs muito longos).';
    } else if (st === 401 || st === 403) {
      codigo = 'credencial';
      erro = 'A chave da IA no servidor foi recusada.';
    } else if (msg.includes('timeout') || msg.includes('timed out') || msg.includes('aborted')) {
      codigo = 'tempo';
      erro = 'A análise demorou além do limite. Tente de novo (ou com menos propostas).';
    }
    // Trilha: a falha fica registrada (código, não detalhes) para diagnóstico.
    try {
      const { data: eqRow } = await sb.from('equalizacoes').select('org_id').eq('id', id).single();
      if (eqRow) {
        await sb.from('eventos').insert({
          org_id: (eqRow as { org_id: string }).org_id,
          entidade: 'equalizacao',
          entidade_id: id,
          tipo: 'equalizacao_falhou',
          payload: { codigo, status: st ?? null, pdfs: documentos.length },
        });
      }
    } catch {
      /* best-effort */
    }
    res.status(502).json({ erro: `${erro} (código: ${codigo}${st ? ` · ${st}` : ''})`, codigo });
  }
}
