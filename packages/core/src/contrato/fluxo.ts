/**
 * Papéis por obra e o que cada um pode fazer (PRD-contratos §3) ao longo dos
 * estados do contrato (PRD-contratos §6). Única fonte da matriz: telas escondem
 * ações com `podeAcao`, e o servidor recusa de qualquer forma (RLS + RPCs).
 */
export type PapelObra = 'dono' | 'gestor' | 'colaborador';

export type AcaoObra =
  | 'ver'
  | 'subir_proposta'
  | 'equalizar'
  | 'definir_vencedora'
  | 'montar_contrato'
  | 'enviar_validacao'
  | 'aprovar_contrato'
  | 'devolver_contrato'
  | 'emitir_contrato'
  | 'aprovar_variante'
  | 'apagar_proposta'
  | 'apagar_equalizacao'
  | 'apagar_contrato'
  | 'cancelar_contrato'
  | 'convidar'
  | 'mudar_papel'
  | 'remover_acesso'
  | 'apagar_obra'
  | 'editar_cadastros';

/** Estados do contrato na minuta padrão (M10+); os três primeiros também valem para o legado. */
export type StatusContratoFluxo =
  | 'rascunho'
  | 'em_validacao'
  | 'devolvido'
  | 'aprovado'
  | 'emitido'
  | 'enviado'
  | 'assinado'
  | 'cancelado';

const GERENCIA: ReadonlySet<AcaoObra> = new Set<AcaoObra>([
  'aprovar_contrato',
  'devolver_contrato',
  'emitir_contrato',
  'aprovar_variante',
  'apagar_proposta',
  'apagar_equalizacao',
  'apagar_contrato',
  'cancelar_contrato',
  'convidar',
  'mudar_papel',
  'remover_acesso',
  'editar_cadastros',
]);

/** Ações que dependem do estado do contrato: estados em que são permitidas. */
const POR_STATUS: Partial<Record<AcaoObra, readonly StatusContratoFluxo[]>> = {
  enviar_validacao: ['rascunho', 'devolvido', 'aprovado'],
  aprovar_contrato: ['em_validacao'],
  devolver_contrato: ['em_validacao'],
  emitir_contrato: ['aprovado'],
  cancelar_contrato: ['emitido', 'enviado'],
  apagar_contrato: ['rascunho', 'devolvido', 'aprovado'],
};

/**
 * `papel` null = sem acesso à obra (nada é permitido). `status` só importa para
 * ações de contrato; quando omitido, a resposta considera só o papel.
 */
export function podeAcao(papel: PapelObra | null | undefined, acao: AcaoObra, status?: StatusContratoFluxo | null): boolean {
  if (!papel) return false;
  if (acao === 'apagar_obra') return papel === 'dono';
  if (GERENCIA.has(acao) && papel === 'colaborador') return false;
  const estados = POR_STATUS[acao];
  if (estados && status != null && !estados.includes(status)) return false;
  return true;
}

export function gerencia(papel: PapelObra | null | undefined): boolean {
  return papel === 'dono' || papel === 'gestor';
}

export const PAPEL_LABEL: Record<PapelObra, { texto: string; descricao: string }> = {
  dono: { texto: 'Dono', descricao: 'Criou a obra. Faz tudo, inclusive apagar a obra.' },
  gestor: { texto: 'Gestor', descricao: 'Aprova e emite contratos, apaga, convida e troca papéis.' },
  colaborador: { texto: 'Colaborador', descricao: 'Sobe propostas, equaliza e monta contratos; envia para validação.' },
};

export const STATUS_CONTRATO_LABEL: Record<StatusContratoFluxo, string> = {
  rascunho: 'Rascunho',
  em_validacao: 'Aguardando validação',
  devolvido: 'Devolvido',
  aprovado: 'Aprovado',
  emitido: 'Emitido',
  enviado: 'Enviado para assinatura',
  assinado: 'Assinado',
  cancelado: 'Cancelado',
};
