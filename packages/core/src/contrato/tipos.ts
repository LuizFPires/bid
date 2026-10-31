import type { AlertaExtraido, ItemExtraido, PropostaExtraida } from '../extracao';
import type { CriterioStatus, EscopoStatus } from '../equalizacao';
import type { StatusContratoFluxo } from './fluxo';

/** Estado do contrato na minuta padrão (v2). */
export type StatusContratoV2 = StatusContratoFluxo;

/** Origem de cada item de cláusula (regra 16). */
export type OrigemItem = 'padrao' | 'parametro' | 'proposta' | 'bloco' | 'variante';

/**
 * Fotografia da proposta vencedora + o que a equalização disse SOBRE ELA +
 * dados da obra, congelada na criação do contrato (RC-02). Nada de
 * concorrentes aqui (RC-15).
 */
export interface Dossie {
  versao: 1;
  geradoEm: string;
  proposta: {
    id: string;
    fornecedor: string;
    opcao: string | null;
    versao: number | null;
    arquivoPath: string | null;
    valor: number | null;
    prazoDias: number | null;
    condicaoPagamento: string | null;
    garantia: string | null;
    observacoes: string | null;
    itens: ItemExtraido[];
    alertas: AlertaExtraido[];
    /** Fornecedor para quem a proposta foi emitida/dirigida, se a leitura trouxe (RC-14). */
  };
  equalizacao: {
    equalizacaoId: string | null;
    /** Critério → o que a matriz disse da vencedora. */
    criterios: { criterio: string; texto: string | null; status: CriterioStatus }[];
    /** Item de escopo → situação na vencedora. */
    escopo: { item: string; status: EscopoStatus }[];
    aFavor: string[];
    riscos: string[];
    /** Valor equalizado e base, se a IA calculou. */
    equalizado: number | null;
    base: string | null;
    nota: string | null;
  } | null;
  obra: {
    id: string;
    nome: string;
    cidade: string | null;
    endereco: string | null;
    cep: string | null;
    cno: string | null;
    foro: string | null;
  };
  categoria: string;
}

export interface EntradaDossie {
  proposta: {
    id: string;
    fornecedor: string;
    opcao: string | null;
    versao: number | null;
    arquivoPath: string | null;
    valor: number | null;
    prazoDias: number | null;
    condicaoPagamento: string | null;
    garantia: string | null;
  };
  extraida: Partial<PropostaExtraida> | null;
  analise: {
    id: string | null;
    matriz?: { criterios: string[]; porProposta: { proposta_id: string; celulas: { texto: string | null; status: CriterioStatus }[] }[] };
    escopo?: { itens: string[]; porProposta: { proposta_id: string; status: EscopoStatus[] }[] };
    forcas_riscos?: { proposta_id: string; resumo: string | null; a_favor: string[]; riscos: string[] }[];
    cards?: { proposta_id: string; apresentado: number | null; equalizado: number | null; base: string | null; nota: string | null }[];
  } | null;
  obra: Dossie['obra'];
  categoria: string;
  agora?: string;
}

/** Parâmetros do contrato: campos do quadro-resumo e demais marcadores simples. */
export type ParametrosContrato = Record<string, string>;

export interface SignatarioContrato {
  id?: string;
  parte: 'contratante' | 'contratada' | 'construtora' | 'testemunha';
  nome: string;
  cpf: string | null;
  cargo: string | null;
  email: string | null;
  telefone: string | null;
  ordem: number;
  obrigatorio: boolean;
}

/** Fotografia da qualificação das partes no contrato. */
export interface PartesContrato {
  contratante: ParteSnapshot | null;
  contratada: ParteSnapshot | null;
  construtora: (ParteSnapshot & { marca: 'ampla' | 'classica' | null }) | null;
}
export interface ParteSnapshot {
  origemId: string | null;
  razao_social: string;
  nome_curto: string | null;
  natureza: string | null;
  cnpj: string;
  endereco: string;
  cep: string | null;
  email: string | null;
  /** Texto final da qualificação (core.qualificar), editável. */
  qualificacao: string;
}

export interface ItemClausula {
  numero: string;
  apos: string | null;
  texto: string;
  textoPadrao: string | null;
  origem: OrigemItem;
  varianteChave: string | null;
  blocoChave: string | null;
  suprimido: boolean;
  justificativa: string | null;
  reduzProtecao: boolean;
}

/** Achado da revisão por IA (PRD-contratos §7). */
export interface Achado {
  tipo: 'conflito' | 'lacuna' | 'risco';
  severidade: 'alta' | 'media' | 'baixa';
  numero: string;
  titulo: string;
  explicacao: string;
  trechoProposta: string | null;
  sugestao: string | null;
}

export interface RevisaoIA {
  resumo: string | null;
  achados: Achado[];
}
