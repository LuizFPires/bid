import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { env } from './env';

/**
 * Cliente do Supabase no CONTEXTO DO USUÁRIO: usa a chave anon + o token do
 * chamador, então a RLS continua valendo. A função nunca escala privilégio para
 * ler arquivos/registros que o usuário não poderia ler. (A `service_role`, que
 * ignora a RLS, fica para gravações de servidor em milestones posteriores.)
 */
export function userClient(accessToken: string): SupabaseClient {
  return createClient(env.supabaseUrl(), env.supabaseAnonKey(), {
    global: { headers: { Authorization: `Bearer ${accessToken}` } },
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

/**
 * Cliente com `service_role` — IGNORA a RLS. Uso ESTRITO: o fluxo de assinatura
 * por LINK externo, em que o signatário não tem sessão (sem como passar RLS).
 * Nunca exposto ao cliente; a chave só existe no servidor.
 */
export function serviceClient(): SupabaseClient {
  return createClient(env.supabaseUrl(), env.supabaseServiceKey(), {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}
