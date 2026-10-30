/**
 * Ambiente do servidor. Segredos (chave da Anthropic) e a URL/anon do Supabase
 * para as funções SÓ existem aqui — nunca no cliente. A `service_role` entra
 * nos milestones que gravam no servidor (contrato/assinatura).
 *
 * Robustez: a URL e a anon key do Supabase aceitam tanto `SUPABASE_*` quanto o
 * fallback `VITE_SUPABASE_*` (a mesma config que o cliente já usa e que funciona).
 * A URL é normalizada (ganha `https://` se faltar) — uma `SUPABASE_URL` sem
 * protocolo fazia o createClient lançar "Invalid supabaseUrl" e derrubar a função.
 */

export class MissingEnvError extends Error {
  constructor(public readonly chave: string) {
    super(`Variável de ambiente ausente no servidor: ${chave}`);
    this.name = 'MissingEnvError';
  }
}

function req(chave: string): string {
  const v = process.env[chave]?.trim();
  if (!v) throw new MissingEnvError(chave);
  return v;
}

/** Primeiro valor não vazio entre várias chaves (fallback). */
function primeiro(...chaves: string[]): string {
  for (const k of chaves) {
    const v = process.env[k]?.trim();
    if (v) return v;
  }
  throw new MissingEnvError(chaves[0] ?? '');
}

/** Garante protocolo http(s) e descarta valor que não seja URL válida. */
function comoUrl(v: string): string | null {
  const url = /^https?:\/\//i.test(v) ? v : `https://${v}`;
  try {
    new URL(url);
    return url;
  } catch {
    return null;
  }
}

/**
 * URL do Supabase: olha SUPABASE_URL e VITE_SUPABASE_URL, normaliza e prefere a
 * que pareça do Supabase (`.supabase.`); senão, a primeira válida.
 */
function supabaseUrlResolvida(): string {
  const candidatas = ['SUPABASE_URL', 'VITE_SUPABASE_URL']
    .map((k) => process.env[k]?.trim())
    .filter((v): v is string => !!v)
    .map(comoUrl)
    .filter((u): u is string => !!u);
  const doSupabase = candidatas.find((u) => /\.supabase\./i.test(u));
  const escolhida = doSupabase ?? candidatas[0];
  if (!escolhida) throw new MissingEnvError('SUPABASE_URL');
  return escolhida;
}

export const env = {
  anthropicKey: () => req('ANTHROPIC_API_KEY'),
  supabaseUrl: () => supabaseUrlResolvida(),
  supabaseAnonKey: () => primeiro('SUPABASE_ANON_KEY', 'VITE_SUPABASE_ANON_KEY'),
  // SÓ para o fluxo que não tem sessão de usuário (assinatura por link externo).
  supabaseServiceKey: () => req('SUPABASE_SERVICE_ROLE_KEY'),
  // Sonnet lê PDF (inclusive escaneado) muito melhor que o Haiku na extração.
  modelExtract: () => process.env.ANTHROPIC_MODEL_EXTRACT ?? 'claude-sonnet-5-5',
  modelEqualize: () => process.env.ANTHROPIC_MODEL_EQUALIZE ?? 'claude-sonnet-5-5',
};
