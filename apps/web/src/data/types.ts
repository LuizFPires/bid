// Tipos das linhas do banco (escritos à mão por ora; gerar via Supabase CLI depois).
import type {
  CertameStatus,
  ContratoStatus,
  PropostaStatus,
} from '@bid/core';

export interface Organizacao {
  id: string;
  nome: string;
}

export interface Membro {
  id: string;
  org_id: string;
  user_id: string;
  papel: 'gestor' | 'equipe';
}

export interface Obra {
  id: string;
  org_id: string;
  nome: string;
  cidade: string | null;
  fase: string | null;
  fase_pill: 'aberta' | 'analise' | 'adjudicada' | 'neutro';
  /** Dono da obra (quem criou): único que pode apagá-la e convidar pessoas. */
  criado_por: string | null;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
}

export interface Certame {
  id: string;
  org_id: string;
  obra_id: string;
  categoria: string;
  titulo: string;
  escopo: string | null;
  status: CertameStatus;
  abertura: string | null;
  limite: string | null;
  vencedora_proposta_id: string | null;
}

export interface Proposta {
  id: string;
  org_id: string;
  certame_id: string;
  fornecedor: string;
  status: PropostaStatus;
  valor_atual: number | null;
  prazo_atual: number | null;
  condicao_pagamento: string | null;
  garantia: string | null;
  versao_atual: number;
}

export interface PropostaVersao {
  id: string;
  proposta_id: string;
  n: number;
  data: string;
  valor: number | null;
  prazo: number | null;
  condicao_pagamento: string | null;
  garantia: string | null;
  obs: string | null;
  arquivo_path: string | null;
}

export interface Sugestao {
  id: string;
  org_id: string;
  tipo: 'categoria' | 'fornecedor' | 'obra' | 'local';
  texto: string;
  uso: number;
}

export interface Contrato {
  id: string;
  org_id: string;
  certame_id: string;
  proposta_id: string;
  obra_id: string;
  categoria: string;
  valor: number | null;
  status: ContratoStatus;
}
