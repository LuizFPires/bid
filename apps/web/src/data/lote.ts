import { useSyncExternalStore } from 'react';
import {
  LOTE_MAX_ARQUIVOS,
  entradasDoLote,
  type ItemLote,
  type Lote,
  type PropostaExtraida,
} from '@bid/core';
import { supabase } from '../lib/supabase';
import { arquivoLegivelPelaIA, extrairProposta, uploadPropostaArquivo } from './mutations';

/**
 * Estado do lote de propostas, fora do React: sobrevive à navegação entre
 * telas (os uploads e as leituras continuam em segundo plano) e à recarga
 * (persistido no localStorage; o que estava "lendo" volta para a fila e é
 * retomado). Um lote ativo por aparelho — é o caso de uso: anexar as propostas
 * de uma cotação, conferir, arquivar.
 */
function db() {
  if (!supabase) throw new Error('Supabase não configurado.');
  return supabase;
}

const CHAVE = 'bid.lote.v1';
const PARALELO = 3;

let lote: Lote | null = carregar();
/** Usuário da sessão atual (mantido pelo listener de auth). */
let usuarioAtual: string | null = null;

// O lote fica no localStorage do aparelho: só vale para quem o criou. Ao
// trocar de conta ou sair, some — nada de uma conta vaza para outra.
if (supabase) {
  void supabase.auth.getSession().then(({ data }) => {
    usuarioAtual = data.session?.user.id ?? null;
    conferirDono();
  });
  supabase.auth.onAuthStateChange((_evento, sessao) => {
    usuarioAtual = sessao?.user.id ?? null;
    conferirDono();
  });
}

function conferirDono() {
  if (lote && (!usuarioAtual || lote.usuarioId !== usuarioAtual)) {
    arquivos.clear();
    emVoo.clear();
    setLote(() => null);
  }
}
const ouvintes = new Set<() => void>();
/** Arquivos ainda em memória (não persistem): id do item → File. */
const arquivos = new Map<string, File>();
/** Itens com trabalho em andamento nesta sessão (upload/leitura). */
const emVoo = new Set<string>();

function carregar(): Lote | null {
  try {
    const raw = localStorage.getItem(CHAVE);
    if (!raw) return null;
    const l = JSON.parse(raw) as Lote;
    if (!l || !Array.isArray(l.itens)) return null;
    // Recarga: nada está "lendo" de verdade; volta à fila para retomar.
    l.itens = l.itens.map((i) => (i.situacao === 'lendo' ? { ...i, situacao: 'fila' } : i));
    return l;
  } catch {
    return null;
  }
}

function gravar() {
  try {
    if (lote) localStorage.setItem(CHAVE, JSON.stringify(lote));
    else localStorage.removeItem(CHAVE);
  } catch {
    /* sem armazenamento: o lote vive só em memória */
  }
}

function emitir() {
  gravar();
  for (const f of ouvintes) f();
}

function setLote(fn: (l: Lote | null) => Lote | null) {
  lote = fn(lote);
  emitir();
}

function setItem(id: string, patch: Partial<ItemLote>) {
  setLote((l) => (l ? { ...l, itens: l.itens.map((i) => (i.id === id ? { ...i, ...patch } : i)) } : l));
}

function novoId(): string {
  return typeof crypto !== 'undefined' && 'randomUUID' in crypto ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

export function useLote(): Lote | null {
  return useSyncExternalStore(
    (f) => {
      ouvintes.add(f);
      return () => ouvintes.delete(f);
    },
    () => lote,
    () => lote,
  );
}

export function loteAtual(): Lote | null {
  return lote;
}

/** Começa um lote novo (substitui o anterior, se houver) e dispara upload + leitura. */
export function iniciarLote(input: { obraId: string; obraNome: string; categoria: string; files: File[] }): Lote {
  if (!usuarioAtual) throw new Error('Sessão inválida.');
  const files = input.files.slice(0, LOTE_MAX_ARQUIVOS);
  arquivos.clear();
  const itens: ItemLote[] = files.map((f) => {
    const id = novoId();
    arquivos.set(id, f);
    const legivel = arquivoLegivelPelaIA(f);
    return {
      id,
      nomeArquivo: f.name,
      arquivoPath: null,
      legivel,
      situacao: 'fila',
      dados: null,
      opcoesMarcadas: [],
      novaVersaoDe: null,
      erro: null,
    };
  });
  setLote(() => ({ id: novoId(), usuarioId: usuarioAtual, obraId: input.obraId, obraNome: input.obraNome, categoria: input.categoria.trim(), criadoEm: new Date().toISOString(), itens }));
  void bombear();
  return lote!;
}

/** Inclui mais arquivos no lote ativo. */
export function incluirArquivos(files: File[]) {
  if (!lote) return;
  const vagas = Math.max(0, LOTE_MAX_ARQUIVOS - lote.itens.length);
  const novos = files.slice(0, vagas).map<ItemLote>((f) => {
    const id = novoId();
    arquivos.set(id, f);
    return { id, nomeArquivo: f.name, arquivoPath: null, legivel: arquivoLegivelPelaIA(f), situacao: 'fila', dados: null, opcoesMarcadas: [], novaVersaoDe: null, erro: null };
  });
  setLote((l) => (l ? { ...l, itens: [...l.itens, ...novos] } : l));
  void bombear();
}

export function removerItem(id: string) {
  arquivos.delete(id);
  setLote((l) => (l ? { ...l, itens: l.itens.filter((i) => i.id !== id) } : l));
}

/** Tenta de novo um item com erro (reenvia se o upload não chegou a acontecer). */
export function tentarDeNovo(id: string) {
  setItem(id, { situacao: 'fila', erro: null });
  void bombear();
}

/** O usuário conferiu: guarda os dados editados e marca como confirmada. */
export function confirmarItem(id: string, dados: PropostaExtraida, opcoesMarcadas: boolean[], novaVersaoDe: string | null) {
  setItem(id, { dados, opcoesMarcadas, novaVersaoDe, situacao: 'confirmada', erro: null });
}

/** Volta uma confirmada para "lida" (o usuário quer reabrir). */
export function reabrirItem(id: string) {
  const it = lote?.itens.find((i) => i.id === id);
  if (!it) return;
  setItem(id, { situacao: it.legivel ? 'lida' : 'manual' });
}

export function descartarLote() {
  arquivos.clear();
  setLote(() => null);
}

/**
 * Motor: pega itens na fila e roda upload + leitura, até PARALELO por vez.
 * Cada item é independente — um que falha não derruba os outros.
 */
async function bombear() {
  if (!lote) return;
  while (lote && emVoo.size < PARALELO) {
    const prox = lote.itens.find((i) => i.situacao === 'fila' && !emVoo.has(i.id));
    if (!prox) break;
    emVoo.add(prox.id);
    void processar(prox.id).finally(() => {
      emVoo.delete(prox.id);
      void bombear();
    });
  }
}

async function processar(id: string) {
  const it = lote?.itens.find((i) => i.id === id);
  if (!it) return;
  let path = it.arquivoPath;
  try {
    if (!path) {
      const file = arquivos.get(id);
      if (!file) {
        setItem(id, { situacao: 'erro', erro: 'O envio não terminou. Anexe este arquivo de novo.' });
        return;
      }
      setItem(id, { situacao: 'lendo', erro: null });
      const env = await uploadPropostaArquivo(file);
      path = env.path;
      setItem(id, { arquivoPath: path });
    }
    if (!it.legivel) {
      setItem(id, { situacao: 'manual', dados: it.dados ?? vazio() });
      return;
    }
    setItem(id, { situacao: 'lendo', erro: null });
    const dados = await extrairProposta(path);
    setItem(id, { situacao: 'lida', dados, opcoesMarcadas: dados.opcoes.map(() => true) });
  } catch (e) {
    setItem(id, { situacao: 'erro', erro: e instanceof Error ? e.message : 'Não foi possível ler este arquivo.', dados: it.dados ?? vazio() });
  }
}

function vazio(): PropostaExtraida {
  return { fornecedor: null, valor: null, prazo_dias: null, condicao_pagamento: null, garantia: null, itens: [], opcoes: [], alertas: [], observacoes: null };
}

/** Retoma leituras pendentes (chamado quando a tela do lote monta). */
export function retomarLote() {
  void bombear();
}

/** Arquiva tudo em UMA transação (RPC). Devolve os ids das propostas criadas/atualizadas. */
export async function arquivarLote(): Promise<{ ids: string[]; obraId: string; categoria: string }> {
  if (!lote) throw new Error('Nenhum lote em andamento.');
  const entradas = entradasDoLote(lote);
  if (!entradas.length) throw new Error('Nenhuma proposta confirmada para arquivar.');
  const { data, error } = await db().rpc('criar_propostas_lote', {
    p_obra: lote.obraId,
    p_categoria: lote.categoria,
    p_itens: entradas,
  });
  if (error) throw error;
  const resultado = { ids: (data as string[]) ?? [], obraId: lote.obraId, categoria: lote.categoria };
  descartarLote();
  return resultado;
}
