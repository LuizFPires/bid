import { supabase } from '../lib/supabase';
import { fetchMinhaOrg } from './queries';
import type { Obra } from './types';

function db() {
  if (!supabase) throw new Error('Supabase não configurado.');
  return supabase;
}

/** Registra uma sugestão de campo livre (ou soma 1 ao uso se já existir). */
export async function registrarSugestao(
  orgId: string,
  tipo: 'categoria' | 'fornecedor' | 'obra' | 'local',
  texto: string,
): Promise<void> {
  const t = texto.trim();
  if (!t) return;
  const { error } = await db().rpc('registrar_sugestao', {
    p_org: orgId,
    p_tipo: tipo,
    p_texto: t,
  });
  if (error) throw error;
}

export interface NovaObraInput {
  nome: string;
  cidade?: string;
}

export async function criarObra(input: NovaObraInput): Promise<Obra> {
  const org = await fetchMinhaOrg();
  if (!org) throw new Error('Organização não encontrada.');

  const { data, error } = await db()
    .from('obras')
    .insert({ org_id: org.id, nome: input.nome.trim(), cidade: input.cidade?.trim() || null })
    .select()
    .single();
  if (error) throw error;

  await registrarSugestao(org.id, 'obra', input.nome);
  if (input.cidade) await registrarSugestao(org.id, 'local', input.cidade);

  return data as Obra;
}
