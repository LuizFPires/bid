/**
 * Assinatura — partes PURAS e testáveis (regra #1). As duas partes de um
 * contrato são a CONTRATANTE e a CONTRATADA; o contrato fica "assinado" só
 * quando ambas assinam. A aplicação da assinatura ao PDF e a trilha de auditoria
 * (ip, user agent, hash) acontecem no servidor.
 */

export type ParteAssinatura = 'contratante' | 'contratada';
export type ViaAssinatura = 'app' | 'link';

export const PARTES: readonly ParteAssinatura[] = ['contratante', 'contratada'];

export const PARTE_LABEL: Record<ParteAssinatura, string> = {
  contratante: 'Contratante',
  contratada: 'Contratada',
};

export interface AssinaturaResumo {
  parte: ParteAssinatura;
  /** Momento em que assinou; null = ainda não assinou. */
  assinadoEm: string | null;
}

/** Verdadeiro quando AMBAS as partes já assinaram (contrato → assinado). */
export function ambasPartesAssinaram(assinaturas: readonly AssinaturaResumo[]): boolean {
  return PARTES.every((p) => assinaturas.some((a) => a.parte === p && a.assinadoEm !== null));
}

/** Partes que ainda faltam assinar. */
export function partesPendentes(assinaturas: readonly AssinaturaResumo[]): ParteAssinatura[] {
  return PARTES.filter((p) => !assinaturas.some((a) => a.parte === p && a.assinadoEm !== null));
}

/**
 * Monta o link do WhatsApp para enviar o pedido de assinatura (wa.me).
 * `url` é o link tokenizado de assinatura; `texto` acompanha a mensagem.
 */
export function linkWhatsApp(url: string, texto: string): string {
  const msg = `${texto} ${url}`.trim();
  return `https://wa.me/?text=${encodeURIComponent(msg)}`;
}
