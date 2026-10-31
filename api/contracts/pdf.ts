import type { VercelRequest, VercelResponse } from '@vercel/node';
import { formatBRL, nomeProposta, normalizarAnalise } from '@bid/core';
import { MissingEnvError } from '@bid/server';
import { bearer, requireMethod } from '@bid/server';
import { renderContratoPdf } from '@bid/server';
import { serviceClient, userClient } from '@bid/server';

/**
 * POST /api/contracts/pdf
 * Entrada: { id } — id do contrato.
 * Ação: autoriza pela sessão (RLS no load), renderiza o PDF (@react-pdf) e grava
 * no bucket privado `contratos` via SERVICE_ROLE (o PDF é escrito só pelo
 * servidor — membros não sobrescrevem). Recusa se o contrato já tem assinatura.
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
    res.status(400).json({ erro: 'Informe o id do contrato.' });
    return;
  }

  const sb = userClient(token);
  const { data: userData, error: userErr } = await sb.auth.getUser();
  if (userErr || !userData.user) {
    res.status(401).json({ erro: 'Sessão inválida.' });
    return;
  }

  const { data: contrato, error: cErr } = await sb
    .from('contratos')
    .select('id, org_id, categoria, valor, proposta_id, obras ( nome ), contrato_clausulas ( numero, titulo, texto )')
    .eq('id', id)
    .is('deleted_at', null)
    .maybeSingle();
  if (cErr || !contrato) {
    res.status(404).json({ erro: 'Contrato não encontrado.' });
    return;
  }

  const c = contrato as unknown as {
    id: string;
    org_id: string;
    categoria: string;
    valor: number | null;
    proposta_id: string | null;
    obras: { nome: string } | { nome: string }[] | null;
    contrato_clausulas: { numero: number; titulo: string; texto: string }[] | null;
  };
  const obraNome = Array.isArray(c.obras) ? (c.obras[0]?.nome ?? '') : (c.obras?.nome ?? '');
  const clausulas = [...(c.contrato_clausulas ?? [])].sort((a, b) => a.numero - b.numero);
  if (clausulas.length === 0) {
    res.status(400).json({ erro: 'Contrato sem cláusulas para gerar o PDF.' });
    return;
  }

  // Não regerar um contrato que já tem assinatura (o PDF assinado é imutável).
  const { data: assinadas } = await sb
    .from('assinaturas')
    .select('id')
    .eq('contrato_id', c.id)
    .not('assinado_em', 'is', null)
    .limit(1);
  if (assinadas && assinadas.length > 0) {
    res.status(409).json({ erro: 'Contrato já assinado: o PDF não pode ser regerado.' });
    return;
  }

  // O PDF é escrito SÓ pelo servidor (service_role) — membros não sobrescrevem.
  let svc;
  try {
    svc = serviceClient();
  } catch (e) {
    if (e instanceof MissingEnvError) {
      res.status(503).json({ erro: 'Geração de PDF não configurada no servidor.' });
      return;
    }
    throw e;
  }

  // Anexos: I = proposta vencedora; II = equalização do certame (se houver relatório).
  const anexos = await carregarAnexos(sb, c.proposta_id);

  let buffer: Buffer;
  let paginas: number;
  try {
    ({ buffer, paginas } = await renderContratoPdf({
      obra: obraNome,
      categoria: c.categoria,
      contratada: anexos.vencedora?.fornecedor ?? '',
      valor: c.valor != null ? formatBRL(c.valor) : 'a definir',
      clausulas,
      anexos,
    }));
  } catch {
    res.status(502).json({ erro: 'Falha ao renderizar o PDF.' });
    return;
  }

  // Caminho ORG-scoped e determinístico: qualquer membro regrava o mesmo objeto
  // (sem órfãos) e todos da org conseguem baixar (policies por is_member).
  const path = `${c.org_id}/contrato-${c.id}.pdf`;
  const { error: upErr } = await svc.storage
    .from('contratos')
    .upload(path, buffer, { upsert: true, contentType: 'application/pdf' });
  if (upErr) {
    res.status(502).json({ erro: 'Falha ao salvar o PDF no Storage.' });
    return;
  }

  const { error: updErr } = await svc
    .from('contratos')
    .update({ pdf_path: path, paginas })
    .eq('id', c.id);
  if (updErr) {
    res.status(502).json({ erro: 'PDF gerado, mas falhou ao registrar.' });
    return;
  }

  res.status(200).json({ pdf_path: path, paginas });
}


type Cliente = ReturnType<typeof userClient>;
type Anexos = NonNullable<Parameters<typeof renderContratoPdf>[0]['anexos']>;

const dias = (n: number | null) => (n == null ? '—' : `${n} dias`);
const txt = (s: string | null | undefined) => (s && s.trim() ? s.trim() : '—');

/** Vencedora (Anexo I) e comparativo do certame (Anexo II), no contexto do usuário (RLS). */
async function carregarAnexos(sb: Cliente, propostaId: string | null): Promise<Anexos> {
  const vazio: Anexos = { vencedora: null, equalizacao: null };
  if (!propostaId) return vazio;
  const { data: p } = await sb
    .from('propostas')
    .select('id, fornecedor, opcao, valor_atual, prazo_atual, condicao_pagamento, garantia, certame_id')
    .eq('id', propostaId)
    .maybeSingle();
  const prop = p as { id: string; fornecedor: string; opcao: string | null; valor_atual: number | null; prazo_atual: number | null; condicao_pagamento: string | null; garantia: string | null; certame_id: string | null } | null;
  if (!prop) return vazio;
  const vencedora: Anexos['vencedora'] = {
    fornecedor: prop.fornecedor,
    opcao: prop.opcao,
    valor: prop.valor_atual != null ? formatBRL(prop.valor_atual) : '—',
    prazo: dias(prop.prazo_atual),
    pagamento: txt(prop.condicao_pagamento),
    garantia: txt(prop.garantia),
  };
  if (!prop.certame_id) return { vencedora, equalizacao: null };

  const [{ data: eqs }, { data: todas }] = await Promise.all([
    sb
      .from('equalizacoes')
      .select('id, referencia, resultado_ia, proposta_ids, created_at')
      .eq('certame_id', prop.certame_id)
      .is('deleted_at', null)
      .not('resultado_ia', 'is', null)
      .order('created_at', { ascending: false })
      .limit(1),
    sb
      .from('propostas')
      .select('id, fornecedor, opcao, valor_atual, prazo_atual')
      .eq('certame_id', prop.certame_id)
      .is('deleted_at', null),
  ]);
  const eq = (eqs as { id: string; referencia: string | null; resultado_ia: unknown; proposta_ids: string[] }[] | null)?.[0] ?? null;
  const lista = (todas ?? []) as { id: string; fornecedor: string; opcao: string | null; valor_atual: number | null; prazo_atual: number | null }[];
  if (!eq || lista.length < 2) return { vencedora, equalizacao: null };

  const analise = normalizarAnalise(eq.resultado_ia, lista.map((x) => x.id));
  const equalizado = new Map<string, number | null>();
  for (const c of analise.cards) equalizado.set(c.proposta_id, c.equalizado);
  for (const t of analise.equalizacao.totais) if (!equalizado.has(t.proposta_id)) equalizado.set(t.proposta_id, t.total);
  const ordem = [...lista].sort((x, y) => (equalizado.get(x.id) ?? x.valor_atual ?? Infinity) - (equalizado.get(y.id) ?? y.valor_atual ?? Infinity));
  return {
    vencedora,
    equalizacao: {
      titulo: analise.titulo,
      conclusao: analise.conclusao ?? analise.recomendacao.justificativa,
      referencia: eq.referencia,
      propostas: ordem.map((x) => ({
        nome: nomeProposta(x.fornecedor, x.opcao),
        apresentado: x.valor_atual != null ? formatBRL(x.valor_atual) : '—',
        equalizado: equalizado.get(x.id) != null ? formatBRL(equalizado.get(x.id)!) : '—',
        prazo: dias(x.prazo_atual),
        vencedora: x.id === prop.id,
      })),
    },
  };
}
