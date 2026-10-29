import { createClient, type SupabaseClient } from '@supabase/supabase-js';

const url = import.meta.env.VITE_SUPABASE_URL;
const anon = import.meta.env.VITE_SUPABASE_ANON_KEY;

/** Verdadeiro quando as variáveis do cliente estão presentes. */
export const supabaseConfigured = Boolean(url && anon);

/**
 * Cliente Supabase (ou null quando não configurado).
 * O cliente só usa a chave anon; a service_role e a chave da Anthropic
 * ficam exclusivamente no servidor.
 */
export const supabase: SupabaseClient | null = supabaseConfigured
  ? createClient(url as string, anon as string, {
      auth: { persistSession: true, autoRefreshToken: true },
    })
  : null;
