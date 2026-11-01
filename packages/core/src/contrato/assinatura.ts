/**
 * Assinatura das três partes (M13): o contrato v2 fica `assinado` quando TODOS
 * os signatários OBRIGATÓRIOS assinaram (contratante, contratada e construtora;
 * testemunhas são opcionais — Q4). O legado de duas partes segue em
 * `core/assinatura.ts` (`ambasPartesAssinaram`).
 */
export type ParteV2 = 'contratante' | 'contratada' | 'construtora' | 'testemunha';

export const PARTE_V2_LABEL: Record<ParteV2, string> = {
  contratante: 'Contratante',
  contratada: 'Contratada',
  construtora: 'Construtora',
  testemunha: 'Testemunha',
};

export interface SignatarioResumo {
  id: string;
  parte: ParteV2;
  nome: string;
  obrigatorio: boolean;
}
export interface AssinaturaV2Resumo {
  signatarioId: string | null;
  assinadoEm: string | null;
  via?: 'app' | 'link' | null;
}

export function assinou(s: SignatarioResumo, assinaturas: readonly AssinaturaV2Resumo[]): boolean {
  return assinaturas.some((a) => a.signatarioId === s.id && a.assinadoEm !== null);
}

/** Verdadeiro quando todo signatário obrigatório assinou (e há pelo menos um). */
export function todasObrigatoriasAssinaram(signatarios: readonly SignatarioResumo[], assinaturas: readonly AssinaturaV2Resumo[]): boolean {
  const obrig = signatarios.filter((s) => s.obrigatorio);
  return obrig.length > 0 && obrig.every((s) => assinou(s, assinaturas));
}

export function signatariosPendentes(signatarios: readonly SignatarioResumo[], assinaturas: readonly AssinaturaV2Resumo[]): SignatarioResumo[] {
  return signatarios.filter((s) => !assinou(s, assinaturas));
}

/** Índice do signatário entre todos (para a posição da rubrica no PDF): ordem estável por parte e nome. */
export function indiceDoSignatario(signatarios: readonly SignatarioResumo[], id: string): number {
  const ordem: ParteV2[] = ['contratante', 'contratada', 'construtora', 'testemunha'];
  const lista = [...signatarios].sort((a, b) => ordem.indexOf(a.parte) - ordem.indexOf(b.parte) || a.nome.localeCompare(b.nome));
  return Math.max(0, lista.findIndex((s) => s.id === id));
}

/** Mensagem curta para o WhatsApp com o link de assinatura por signatário. */
export function mensagemAssinatura(d: { nome: string; parte: ParteV2; numero: string | null; obra: string; url: string }): string {
  return [`Olá, ${d.nome}.`, `Segue o link para assinar o contrato${d.numero ? ` ${d.numero}` : ''} (${d.obra}) como ${PARTE_V2_LABEL[d.parte].toLowerCase()}:`, d.url, 'O link é pessoal, de uso único e vale por 7 dias.'].join('\n');
}
