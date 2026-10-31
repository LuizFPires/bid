import type { PropostaExtraida } from './extracao';

/**
 * Lote de propostas: vários arquivos anexados de uma vez, na MESMA obra e
 * categoria. Cada arquivo vira um item; a IA lê os itens em paralelo e o
 * usuário confere um a um antes de arquivar tudo de uma vez (regra #3: nada
 * é gravado sem confirmação).
 */
export type SituacaoItemLote =
  | 'fila' // arquivo enviado (ou a enviar), aguardando a leitura
  | 'lendo' // IA lendo
  | 'lida' // IA leu; falta o usuário conferir
  | 'erro' // envio ou leitura falhou; dá para tentar de novo ou preencher à mão
  | 'manual' // arquivo que a IA não lê (planilha) — preencher à mão
  | 'confirmada'; // conferida pelo usuário; pronta para arquivar

export interface ItemLote {
  id: string;
  nomeArquivo: string;
  /** Caminho no Storage depois do upload; null enquanto não subiu. */
  arquivoPath: string | null;
  legivel: boolean;
  situacao: SituacaoItemLote;
  /** O que a IA leu (ou o que o usuário preencheu/confirmou). */
  dados: PropostaExtraida | null;
  /** Quais opções de preço o usuário quer arquivar (alinhado a dados.opcoes). */
  opcoesMarcadas: boolean[];
  /** Proposta existente para virar NOVA VERSÃO em vez de duplicar (fornecedor repetido). */
  novaVersaoDe: string | null;
  erro: string | null;
}

export interface Lote {
  id: string;
  obraId: string;
  obraNome: string;
  categoria: string;
  criadoEm: string;
  itens: ItemLote[];
}

export const LOTE_MAX_ARQUIVOS = 10;

export interface ResumoLote {
  total: number;
  fila: number;
  lendo: number;
  lidas: number;
  erros: number;
  manuais: number;
  confirmadas: number;
  /** Itens que ainda vão mudar sozinhos (fila/lendo). */
  emAndamento: number;
  /** 0–1: progresso da leitura (lidas + confirmadas + erros + manuais sobre o total). */
  progressoLeitura: number;
}

export function resumoLote(lote: Pick<Lote, 'itens'>): ResumoLote {
  const c = (s: SituacaoItemLote) => lote.itens.filter((i) => i.situacao === s).length;
  const total = lote.itens.length;
  const fila = c('fila');
  const lendo = c('lendo');
  const prontas = total - fila - lendo;
  return {
    total,
    fila,
    lendo,
    lidas: c('lida'),
    erros: c('erro'),
    manuais: c('manual'),
    confirmadas: c('confirmada'),
    emAndamento: fila + lendo,
    progressoLeitura: total ? prontas / total : 0,
  };
}

/** Só arquiva com tudo conferido: nenhum item lendo e nenhum sem confirmação. */
export function podeArquivarLote(lote: Pick<Lote, 'itens'>): boolean {
  return lote.itens.length > 0 && lote.itens.every((i) => i.situacao === 'confirmada');
}

/** Próximo item a conferir depois de `atualId` (circular); null se não há pendente. */
export function proximoAConferir(lote: Pick<Lote, 'itens'>, atualId: string | null): ItemLote | null {
  const pend = (i: ItemLote) => i.situacao === 'lida' || i.situacao === 'erro' || i.situacao === 'manual';
  const idx = atualId ? lote.itens.findIndex((i) => i.id === atualId) : -1;
  const ordem = [...lote.itens.slice(idx + 1), ...lote.itens.slice(0, idx + 1)];
  return ordem.find(pend) ?? null;
}

/** Quantas propostas o lote vai gerar (opções marcadas contam uma cada). */
export function totalPropostasDoLote(lote: Pick<Lote, 'itens'>): number {
  return lote.itens.reduce((n, i) => {
    const marcadas = (i.dados?.opcoes.length ?? 0) >= 2 ? i.opcoesMarcadas.filter(Boolean).length : 0;
    return n + (marcadas > 0 ? marcadas : 1);
  }, 0);
}

function chaveFornecedor(nome: string): string {
  return nome
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .toLowerCase()
    .replace(/\b(ltda|me|epp|eireli|s\/?a|cia)\b\.?/g, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

/**
 * Fornecedores repetidos: dentro do lote (dois arquivos da mesma empresa) e
 * contra as propostas já arquivadas na categoria/obra (vira "nova versão?").
 */
export function fornecedoresRepetidos(
  lote: Pick<Lote, 'itens'>,
  existentes: { id: string; fornecedor: string }[],
): { noLote: Set<string>; jaExiste: Map<string, { id: string; fornecedor: string }> } {
  const noLote = new Set<string>();
  const jaExiste = new Map<string, { id: string; fornecedor: string }>();
  const vistos = new Map<string, string>();
  const mapaExist = new Map(existentes.map((e) => [chaveFornecedor(e.fornecedor), e] as const));
  for (const it of lote.itens) {
    const nome = it.dados?.fornecedor?.trim();
    if (!nome) continue;
    const k = chaveFornecedor(nome);
    if (!k) continue;
    const outro = vistos.get(k);
    if (outro) {
      noLote.add(outro);
      noLote.add(it.id);
    } else vistos.set(k, it.id);
    const ex = mapaExist.get(k);
    if (ex) jaExiste.set(it.id, ex);
  }
  return { noLote, jaExiste };
}

/** Um item do lote pronto para a RPC de arquivamento (uma entrada por proposta a criar). */
export interface EntradaArquivamento {
  fornecedor: string;
  opcao: string | null;
  valor: number | null;
  prazo: number | null;
  pagamento: string | null;
  garantia: string | null;
  obs: string | null;
  arquivo_path: string | null;
  dados: PropostaExtraida;
  proposta_id: string | null;
}

/** Expande os itens confirmados em entradas (opções marcadas viram propostas separadas). */
export function entradasDoLote(lote: Pick<Lote, 'itens'>): EntradaArquivamento[] {
  const out: EntradaArquivamento[] = [];
  for (const it of lote.itens) {
    if (it.situacao !== 'confirmada' || !it.dados) continue;
    const d = it.dados;
    const fornecedor = (d.fornecedor ?? '').trim();
    if (!fornecedor) continue;
    const comOpcoes = d.opcoes.length >= 2 ? d.opcoes.filter((_, i) => it.opcoesMarcadas[i]) : [];
    if (comOpcoes.length === 0) {
      out.push({
        fornecedor,
        opcao: null,
        valor: d.valor,
        prazo: d.prazo_dias,
        pagamento: d.condicao_pagamento,
        garantia: d.garantia,
        obs: d.observacoes,
        arquivo_path: it.arquivoPath,
        dados: d,
        proposta_id: it.novaVersaoDe,
      });
      continue;
    }
    for (const op of comOpcoes) {
      const obsOp = [op.descricao, d.observacoes].filter(Boolean).join('\n\n') || null;
      out.push({
        fornecedor,
        opcao: op.rotulo,
        valor: op.valor,
        prazo: d.prazo_dias,
        pagamento: d.condicao_pagamento,
        garantia: d.garantia,
        obs: obsOp,
        arquivo_path: it.arquivoPath,
        dados: { ...d, valor: op.valor, observacoes: obsOp },
        // Opções múltiplas nunca viram "nova versão" (seriam várias propostas).
        proposta_id: null,
      });
    }
  }
  return out;
}
