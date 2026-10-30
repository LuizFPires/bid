import { createHash } from 'node:crypto';
import type { SupabaseClient } from '@supabase/supabase-js';
import { ambasPartesAssinaram } from '@bid/core';
import { aplicarAssinatura, type Parte } from './assinatura-pdf';

export interface DadosAssinatura {
  contratoId: string;
  orgId: string;
  pdfPath: string;
  parte: Parte;
  nome: string;
  via: 'app' | 'link';
  pngBase64: string;
  ip: string | null;
  userAgent: string | null;
}

/**
 * Aplica a assinatura ao PDF do contrato, grava a imagem e a TRILHA de auditoria
 * (assinado_em, ip, user_agent, doc_hash) de forma autoritativa, invalida o
 * token e, quando AMBAS as partes assinaram, marca o contrato como `assinado`.
 * `sb` deve ser o cliente com service_role (escrita autoritativa da trilha).
 */
export async function registrarAssinatura(sb: SupabaseClient, d: DadosAssinatura): Promise<void> {
  // PDF atual do contrato.
  const baixado = await sb.storage.from('contratos').download(d.pdfPath);
  if (baixado.error || !baixado.data) throw new Error('PDF do contrato indisponível.');
  const pdfBytes = new Uint8Array(await baixado.data.arrayBuffer());

  const pngBytes = Uint8Array.from(Buffer.from(d.pngBase64, 'base64'));
  const assinado = await aplicarAssinatura(pdfBytes, pngBytes, d.parte, d.nome);
  const docHash = createHash('sha256').update(assinado).digest('hex');

  // Regrava o PDF assinado (mesmo caminho) e guarda a imagem da assinatura.
  const up1 = await sb.storage.from('contratos').upload(d.pdfPath, assinado, {
    upsert: true,
    contentType: 'application/pdf',
  });
  if (up1.error) throw new Error('Falha ao salvar o PDF assinado.');

  const imgPath = `${d.orgId}/${d.contratoId}-${d.parte}.png`;
  await sb.storage.from('assinaturas').upload(imgPath, pngBytes, { upsert: true, contentType: 'image/png' });

  // Trilha autoritativa (service_role). Invalida o token (uso único).
  const upErr = (
    await sb.from('assinaturas').upsert(
      {
        org_id: d.orgId,
        contrato_id: d.contratoId,
        parte: d.parte,
        signatario_nome: d.nome || null,
        assinatura_img_path: imgPath,
        via: d.via,
        assinado_em: new Date().toISOString(),
        ip: d.ip,
        user_agent: d.userAgent,
        doc_hash: docHash,
        token_hash: null,
        token_expira: null,
      },
      { onConflict: 'contrato_id,parte' },
    )
  ).error;
  if (upErr) throw new Error('Falha ao registrar a assinatura.');

  // Ambas as partes assinaram? → contrato assinado.
  const { data: linhas } = await sb
    .from('assinaturas')
    .select('parte, assinado_em')
    .eq('contrato_id', d.contratoId);
  const resumo = ((linhas ?? []) as { parte: Parte; assinado_em: string | null }[]).map((l) => ({
    parte: l.parte,
    assinadoEm: l.assinado_em,
  }));
  if (ambasPartesAssinaram(resumo)) {
    await sb.from('contratos').update({ status: 'assinado' }).eq('id', d.contratoId);
    await sb.from('eventos').insert({
      org_id: d.orgId,
      entidade: 'contrato',
      entidade_id: d.contratoId,
      tipo: 'contrato_assinado',
      payload: { por: d.parte },
    });
  } else {
    await sb.from('eventos').insert({
      org_id: d.orgId,
      entidade: 'contrato',
      entidade_id: d.contratoId,
      tipo: 'assinatura_registrada',
      payload: { parte: d.parte, via: d.via },
    });
  }
}
