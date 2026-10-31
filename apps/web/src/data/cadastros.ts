import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { normalizarCnpj, somenteDigitos } from '@bid/core';
import { supabase } from '../lib/supabase';

/**
 * Cadastros que a minuta padrão precisa: PARTES (contratante / construtora) e
 * FORNECEDORES (contratada), cada um com signatários. Consultas, gravação
 * (parte + signatários numa sequência de upserts) e hooks.
 */
function db() {
  if (!supabase) throw new Error('Supabase não configurado.');
  return supabase;
}

export interface Signatario {
  id?: string;
  nome: string;
  cpf: string | null;
  cargo: string | null;
  email: string | null;
  telefone: string | null;
  ordem: number;
}

export interface Parte {
  id: string;
  tipo: 'contratante' | 'construtora';
  razao_social: string;
  nome_curto: string | null;
  natureza: string | null;
  cnpj: string;
  endereco: string;
  cep: string | null;
  email: string | null;
  marca: 'ampla' | 'classica' | null;
  signatarios: Signatario[];
}

export interface Fornecedor {
  id: string;
  razao_social: string;
  nome_curto: string | null;
  natureza: string | null;
  cnpj: string;
  endereco: string;
  cep: string | null;
  email: string | null;
  responsavel_tecnico: string | null;
  crea: string | null;
  signatarios: Signatario[];
}

type RawSig = { id: string; nome: string; cpf: string | null; cargo: string | null; email: string | null; telefone: string | null; ordem: number; ativo: boolean };
const sigs = (xs: RawSig[] | null | undefined): Signatario[] =>
  (xs ?? [])
    .filter((s) => s.ativo)
    .sort((a, b) => a.ordem - b.ordem)
    .map((s) => ({ id: s.id, nome: s.nome, cpf: s.cpf, cargo: s.cargo, email: s.email, telefone: s.telefone, ordem: s.ordem }));

/** Partes de UMA organização (a minha, na tela Cadastros; a da obra, no cartão da obra). */
export async function fetchPartes(orgId: string): Promise<Parte[]> {
  const { data, error } = await db()
    .from('partes')
    .select('id, tipo, razao_social, nome_curto, natureza, cnpj, endereco, cep, email, marca, parte_signatarios ( id, nome, cpf, cargo, email, telefone, ordem, ativo )')
    .eq('org_id', orgId)
    .is('deleted_at', null)
    .order('tipo')
    .order('razao_social');
  if (error) throw error;
  return ((data ?? []) as unknown as (Omit<Parte, 'signatarios'> & { parte_signatarios: RawSig[] | null })[]).map(({ parte_signatarios, ...p }) => ({ ...p, signatarios: sigs(parte_signatarios) }));
}

export async function fetchFornecedores(orgId: string): Promise<Fornecedor[]> {
  const { data, error } = await db()
    .from('fornecedores')
    .select('id, razao_social, nome_curto, natureza, cnpj, endereco, cep, email, responsavel_tecnico, crea, fornecedor_signatarios ( id, nome, cpf, cargo, email, telefone, ordem, ativo )')
    .eq('org_id', orgId)
    .is('deleted_at', null)
    .order('razao_social');
  if (error) throw error;
  return ((data ?? []) as unknown as (Omit<Fornecedor, 'signatarios'> & { fornecedor_signatarios: RawSig[] | null })[]).map(({ fornecedor_signatarios, ...f }) => ({ ...f, signatarios: sigs(fornecedor_signatarios) }));
}

export type ParteInput = Omit<Parte, 'id' | 'signatarios'> & { id?: string; signatarios: Signatario[] };
export type FornecedorInput = Omit<Fornecedor, 'id' | 'signatarios'> & { id?: string; signatarios: Signatario[] };

function limparDoc(v: string | null | undefined): string | null {
  const d = somenteDigitos(v);
  return d ? d : null;
}

function sigJson(lista: Signatario[]) {
  return lista.map((s) => ({ id: s.id ?? null, nome: s.nome.trim(), cpf: limparDoc(s.cpf), cargo: s.cargo?.trim() || null, email: s.email?.trim() || null, telefone: s.telefone?.trim() || null }));
}

/** Parte + signatários numa transação (RPC); signatário removido vira inativo. */
export async function salvarParte(input: ParteInput & { orgId: string }): Promise<string> {
  const { data, error } = await db().rpc('salvar_parte', {
    p_org: input.orgId,
    p_parte: {
      id: input.id ?? null,
      tipo: input.tipo,
      razao_social: input.razao_social.trim(),
      nome_curto: input.nome_curto?.trim() || null,
      natureza: input.natureza?.trim() || null,
      cnpj: normalizarCnpj(input.cnpj),
      endereco: input.endereco.trim(),
      cep: limparDoc(input.cep),
      email: input.email?.trim() || null,
      marca: input.tipo === 'construtora' ? input.marca : null,
    },
    p_signatarios: sigJson(input.signatarios),
  });
  if (error) throw error;
  return data as string;
}

export async function salvarFornecedor(input: FornecedorInput & { orgId: string }): Promise<string> {
  const { data, error } = await db().rpc('salvar_fornecedor', {
    p_org: input.orgId,
    p_fornecedor: {
      id: input.id ?? null,
      razao_social: input.razao_social.trim(),
      nome_curto: input.nome_curto?.trim() || null,
      natureza: input.natureza?.trim() || null,
      cnpj: normalizarCnpj(input.cnpj),
      endereco: input.endereco.trim(),
      cep: limparDoc(input.cep),
      email: input.email?.trim() || null,
      responsavel_tecnico: input.responsavel_tecnico?.trim() || null,
      crea: input.crea?.trim() || null,
    },
    p_signatarios: sigJson(input.signatarios),
  });
  if (error) throw error;
  return data as string;
}

/** Exclusão lógica (regra 10). */
export async function apagarCadastro(tabela: 'partes' | 'fornecedores', id: string): Promise<void> {
  const { data, error } = await db().from(tabela).update({ deleted_at: new Date().toISOString() }).eq('id', id).select('id');
  if (error) throw error;
  if (!data?.length) throw new Error('Sem permissão para remover este cadastro.');
}
export async function restaurarCadastro(tabela: 'partes' | 'fornecedores', id: string): Promise<void> {
  const { error } = await db().from(tabela).update({ deleted_at: null }).eq('id', id);
  if (error) throw error;
}

/** Dados de contrato da obra (endereço, CNO, foro, contratante e construtora). */
export interface ObraContratoInput {
  endereco: string | null;
  cep: string | null;
  cno: string | null;
  foro: string | null;
  contratante_id: string | null;
  construtora_id: string | null;
}
export async function atualizarObraContrato(obraId: string, d: ObraContratoInput): Promise<void> {
  const { data, error } = await db()
    .from('obras')
    .update({
      endereco: d.endereco?.trim() || null,
      cep: limparDoc(d.cep),
      cno: limparDoc(d.cno),
      foro: d.foro?.trim() || null,
      contratante_id: d.contratante_id || null,
      construtora_id: d.construtora_id || null,
    })
    .eq('id', obraId)
    .select('id');
  if (error) throw error;
  if (!data?.length) throw new Error('Sem permissão para editar os dados de contrato desta obra.');
}

/* ---------- hooks ---------- */
export function usePartes(orgId: string | undefined) {
  return useQuery({ queryKey: ['partes', orgId], queryFn: () => fetchPartes(orgId as string), enabled: !!orgId });
}
export function useFornecedores(orgId: string | undefined) {
  return useQuery({ queryKey: ['fornecedores', orgId], queryFn: () => fetchFornecedores(orgId as string), enabled: !!orgId });
}
export function useSalvarParte() {
  const qc = useQueryClient();
  return useMutation({ mutationFn: salvarParte, onSuccess: () => qc.invalidateQueries({ queryKey: ['partes'] }) });
}
export function useSalvarFornecedor() {
  const qc = useQueryClient();
  return useMutation({ mutationFn: salvarFornecedor, onSuccess: () => qc.invalidateQueries({ queryKey: ['fornecedores'] }) });
}
export function useApagarCadastro() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (v: { tabela: 'partes' | 'fornecedores'; id: string }) => apagarCadastro(v.tabela, v.id),
    onSuccess: (_r, v) => qc.invalidateQueries({ queryKey: [v.tabela] }),
  });
}
export function useAtualizarObraContrato(obraId: string | undefined) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (d: ObraContratoInput) => atualizarObraContrato(obraId as string, d),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['obra', obraId] });
      qc.invalidateQueries({ queryKey: ['obras'] });
    },
  });
}
