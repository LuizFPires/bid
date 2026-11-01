import type { VercelRequest, VercelResponse } from '@vercel/node';
import Anthropic from '@anthropic-ai/sdk';
import { contarPorSeveridade, type Dossie } from '@bid/core';
import { IAErro, MissingEnvError, bearer, carregarContratoV2, detectarMidia, gravarHashConteudo, env, requireMethod, resolverEHash, revisaoSimulada, revisarContrato, serviceClient, textoDoContrato, userClient, type ContratoParaRevisao, type DocumentoProposta } from '@bid/server';

const MAX_PDF_BYTES = 8 * 1024 * 1024;

/**
 * POST /api/ai/revisar-contrato { contratoId }
 * Revisão OBRIGATÓRIA por IA (RC-07): lê o contrato montado (no contexto do
 * usuário), calcula o hash do conteúdo, abre uma revisão "processando"
 * (service_role), chama a IA com a proposta original e grava os achados.
 * Falha = revisão "falhou" (bloqueia o envio até refazer).
 */
export default async function handler(req: VercelRequest, res: VercelResponse) {
  try {
    await processar(req, res);
  } catch (e) {
    console.error('revisar-contrato crash:', e);
    if (!res.headersSent) res.status(502).json({ erro: 'Não foi possível revisar o contrato.' });
  }
}

async function processar(req: VercelRequest, res: VercelResponse) {
  if (!requireMethod(req, res, 'POST')) return;
  const token = bearer(req);
  if (!token) return void res.status(401).json({ erro: 'Não autenticado.' });
  const contratoId = (req.body as { contratoId?: unknown } | null)?.contratoId;
  if (typeof contratoId !== 'string' || !contratoId) return void res.status(400).json({ erro: 'Informe o contrato.' });

  const sb = userClient(token);
  const { data: userData } = await sb.auth.getUser();
  const { data: k } = await sb
    .from('contratos')
    .select('id, org_id, categoria, status, valor, dossie, parametros, partes, modelo_id, obras ( nome ), contrato_itens_clausula ( numero, texto, origem, suprimido, reduz_protecao, justificativa ), contrato_planilha ( ordem, codigo, grupo, descricao, unidade, quantidade, preco_unitario, total ), contrato_blocos ( ordem, bloco_chave, titulo, itens ), contrato_signatarios ( parte, nome, cargo, ordem )')
    .eq('id', contratoId)
    .is('deleted_at', null)
    .maybeSingle();
  const c = k as unknown as {
    id: string; org_id: string; categoria: string; status: string; valor: number | null; dossie: Dossie | null; parametros: Record<string, string>; partes: unknown; modelo_id: string | null;
    obras: { nome: string } | { nome: string }[] | null;
    contrato_itens_clausula: { numero: string; texto: string; origem: string; suprimido: boolean; reduz_protecao: boolean; justificativa: string | null }[] | null;
    contrato_planilha: { ordem: number; codigo: string | null; grupo: boolean; descricao: string; unidade: string | null; quantidade: number | null; preco_unitario: number | null; total: number | null }[] | null;
    contrato_blocos: { ordem: number; bloco_chave: string; titulo: string; itens: string[] }[] | null;
    contrato_signatarios: { parte: string; nome: string; cargo: string | null; ordem: number }[] | null;
  } | null;
  if (!c) return void res.status(404).json({ erro: 'Contrato não encontrado.' });
  if (!c.modelo_id || !c.dossie) return void res.status(409).json({ erro: 'Monte o dossiê antes de revisar.' });
  if (!['rascunho', 'devolvido', 'aprovado'].includes(c.status)) return void res.status(409).json({ erro: 'Contrato fora de edição.' });

  const itens = [...(c.contrato_itens_clausula ?? [])].sort((a, b) => cmpNumero(a.numero, b.numero));
  const planilha = [...(c.contrato_planilha ?? [])].sort((a, b) => a.ordem - b.ordem);
  const blocos = [...(c.contrato_blocos ?? [])].sort((a, b) => a.ordem - b.ordem);
  const signatarios = [...(c.contrato_signatarios ?? [])].sort((a, b) => a.ordem - b.ordem);
  const obra = (Array.isArray(c.obras) ? c.obras[0] : c.obras)?.nome ?? '';

  const contrato: ContratoParaRevisao = {
    categoria: c.categoria,
    obra,
    parametros: c.parametros ?? {},
    partes: c.partes,
    itens: itens.map((i) => ({ numero: i.numero, texto: i.texto, origem: i.origem, suprimido: i.suprimido, reduzProtecao: i.reduz_protecao, justificativa: i.justificativa })),
    planilha: planilha.map(({ ordem: _o, ...l }) => l),
    blocos: blocos.map((b) => ({ chave: b.bloco_chave, titulo: b.titulo, itens: Array.isArray(b.itens) ? b.itens : [] })),
    valor: c.valor,
  };
  // Hash do conteúdo atual = hash do DOCUMENTO RESOLVIDO (o mesmo da minuta e da
  // emissão); a revisão vale para este hash e o envio exige igualdade.
  const carregado = await carregarContratoV2(sb, c.id);
  if (!carregado) return void res.status(404).json({ erro: 'Contrato não encontrado.' });
  const { hash } = await resolverEHash(carregado);
  void signatarios;

  let svc;
  try {
    svc = serviceClient();
  } catch (e) {
    if (e instanceof MissingEnvError) return void res.status(503).json({ erro: 'Revisão não configurada no servidor.' });
    throw e;
  }
  const modeloIa = process.env.BID_IA_MOCK === '1' ? 'mock' : env.modelContrato();
  const { data: rev, error: rErr } = await svc
    .from('contrato_revisoes')
    .insert({ org_id: c.org_id, contrato_id: c.id, conteudo_hash: hash, modelo_ia: modeloIa, status: 'processando', autor: userData.user?.id ?? null })
    .select('id')
    .single();
  if (rErr || !rev) return void res.status(502).json({ erro: 'Não foi possível abrir a revisão.' });
  const revisaoId = (rev as { id: string }).id;
  if (!(await gravarHashConteudo(svc, carregado, hash, null))) {
    await svc.from('contrato_revisoes').update({ status: 'falhou', erro: 'conteudo_mudou' }).eq('id', revisaoId);
    return void res.status(409).json({ erro: 'O contrato mudou enquanto a revisão começava. Tente de novo.' });
  }

  // Arquivo original da proposta (no contexto do usuário), se couber.
  let documento: DocumentoProposta | null = null;
  const path = c.dossie.proposta.arquivoPath;
  if (path) {
    try {
      const { data: signed } = await sb.storage.from('propostas').createSignedUrl(path, 60);
      if (signed) {
        const resp = await fetch(signed.signedUrl);
        if (resp.ok) {
          const buf = Buffer.from(await resp.arrayBuffer());
          const tipo = buf.byteLength <= MAX_PDF_BYTES ? detectarMidia(buf, path) : null;
          if (tipo) documento = { proposta_id: c.dossie.proposta.id, fornecedor: c.dossie.proposta.fornecedor, pdfBase64: buf.toString('base64'), tipo };
        }
      }
    } catch (e) {
      console.error('revisar-contrato: falha ao ler a proposta', e);
    }
  }

  const avisos: string[] = [];
  try {
    let resultado;
    if (process.env.BID_IA_MOCK === '1') {
      resultado = revisaoSimulada(contrato, c.dossie);
    } else {
      const client = new Anthropic({ apiKey: env.anthropicKey() });
      let doc = documento;
      let conciso = false;
      for (let tentativa = 0; ; tentativa++) {
        try {
          resultado = await revisarContrato(client, contrato, c.dossie, { documento: doc, conciso });
          break;
        } catch (e) {
          const st = (e as { status?: number }).status;
          if (e instanceof IAErro && e.codigo === 'max_tokens' && !conciso) {
            conciso = true;
            avisos.push('Revisão resumida: a primeira versão ficou longa demais.');
            continue;
          }
          if ((st === 400 || st === 413) && doc) {
            doc = null;
            avisos.push('O arquivo da proposta era grande demais; a revisão usou só os dados extraídos.');
            continue;
          }
          // Erros transitórios da API (limite/instabilidade): tenta mais 2 vezes com espera.
          if ((st === 429 || st === 529 || (st != null && st >= 500)) && tentativa < 2) {
            await new Promise((r) => setTimeout(r, 1500 * (tentativa + 1)));
            continue;
          }
          throw e;
        }
      }
    }
    if (!resultado) throw new Error('sem resultado');
    if (resultado.achados.length) {
      const { error: aErr } = await svc.from('contrato_achados').insert(
        resultado.achados.map((a) => ({ org_id: c.org_id, revisao_id: revisaoId, tipo: a.tipo, severidade: a.severidade, numero: a.numero, titulo: a.titulo, explicacao: a.explicacao, trecho_proposta: a.trechoProposta, sugestao: a.sugestao })),
      );
      if (aErr) throw aErr;
    }
    await svc.from('contrato_revisoes').update({ status: 'concluida', resumo: resultado.resumo, concluida_em: new Date().toISOString() }).eq('id', revisaoId);
    const cont = contarPorSeveridade(resultado.achados);
    await svc.from('eventos').insert({ org_id: c.org_id, entidade: 'contrato', entidade_id: c.id, tipo: 'revisao_ia_concluida', payload: { revisao: revisaoId, hash, ...cont, com_arquivo: !!documento } });
    res.status(200).json({ revisaoId, hash, resumo: resultado.resumo, achados: resultado.achados, avisos, texto: textoDoContrato(contrato).length });
  } catch (e) {
    const codigo = e instanceof IAErro ? e.codigo : e instanceof MissingEnvError ? 'sem_configuracao' : 'erro';
    console.error('revisar-contrato falhou:', e);
    await svc.from('contrato_revisoes').update({ status: 'falhou', erro: codigo }).eq('id', revisaoId);
    await svc.from('eventos').insert({ org_id: c.org_id, entidade: 'contrato', entidade_id: c.id, tipo: 'revisao_ia_falhou', payload: { revisao: revisaoId, codigo } });
    if (e instanceof MissingEnvError) return void res.status(503).json({ erro: 'Revisão por IA não configurada no servidor.' });
    res.status(502).json({ erro: 'A revisão por IA falhou. Tente de novo.' });
  }
}

function cmpNumero(a: string, b: string): number {
  const pa = a.replace('decl:', '99.').split('.').map(Number);
  const pb = b.replace('decl:', '99.').split('.').map(Number);
  for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
    const d = (pa[i] ?? 0) - (pb[i] ?? 0);
    if (d) return d;
  }
  return 0;
}
