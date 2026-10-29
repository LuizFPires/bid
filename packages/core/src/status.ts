/** Estados e transições (SPEC §Estados e transições). A regra vive só no core. */

export type CertameStatus = 'aberta' | 'analise' | 'adjudicada';
export type PropostaStatus = 'recebida' | 'analise' | 'vencedora' | 'desclassificada';
export type ContratoStatus = 'rascunho' | 'enviado' | 'assinado';

const CERTAME: Record<CertameStatus, CertameStatus[]> = {
  aberta: ['analise', 'adjudicada'], // adjudicada direto = vencedora sem equalizar
  analise: ['adjudicada', 'aberta'],
  adjudicada: [], // terminal (reabrir é ação de auditoria, fora destas transições)
};

const PROPOSTA: Record<PropostaStatus, PropostaStatus[]> = {
  recebida: ['analise', 'vencedora', 'desclassificada'],
  analise: ['vencedora', 'desclassificada', 'recebida'],
  vencedora: ['analise', 'desclassificada'], // trocar vencedora (com "Desfazer")
  desclassificada: ['recebida', 'analise'],
};

const CONTRATO: Record<ContratoStatus, ContratoStatus[]> = {
  rascunho: ['enviado'],
  enviado: ['assinado', 'rascunho'],
  assinado: [], // terminal
};

function can<T extends string>(mapa: Record<T, T[]>, de: T, para: T): boolean {
  if (de === para) return true;
  return mapa[de].includes(para);
}

export function podeCertame(de: CertameStatus, para: CertameStatus): boolean {
  return can(CERTAME, de, para);
}
export function podeProposta(de: PropostaStatus, para: PropostaStatus): boolean {
  return can(PROPOSTA, de, para);
}
export function podeContrato(de: ContratoStatus, para: ContratoStatus): boolean {
  return can(CONTRATO, de, para);
}

/** Rótulos pt-BR e o tom visual (mapeia para as pills do design system). */
export type StatusTone = 'aberta' | 'analise' | 'adjudicada' | 'neutro';

export const CERTAME_LABEL: Record<CertameStatus, { texto: string; tom: StatusTone }> = {
  aberta: { texto: 'Recebendo propostas', tom: 'aberta' },
  analise: { texto: 'Em equalização', tom: 'analise' },
  adjudicada: { texto: 'Adjudicada', tom: 'adjudicada' },
};

export const PROPOSTA_LABEL: Record<PropostaStatus, { texto: string; tom: StatusTone }> = {
  recebida: { texto: 'Recebida', tom: 'aberta' },
  analise: { texto: 'Em análise', tom: 'analise' },
  vencedora: { texto: 'Vencedora', tom: 'adjudicada' },
  desclassificada: { texto: 'Desclassificada', tom: 'neutro' },
};

export const CONTRATO_LABEL: Record<ContratoStatus, { texto: string; tom: StatusTone }> = {
  rascunho: { texto: 'Rascunho', tom: 'neutro' },
  enviado: { texto: 'Enviado para assinatura', tom: 'analise' },
  assinado: { texto: 'Assinado', tom: 'adjudicada' },
};
