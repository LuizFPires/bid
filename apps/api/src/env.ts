/**
 * Variáveis de ambiente do servidor. A chave da Anthropic e a service_role
 * do Supabase SÓ existem aqui — nunca no cliente.
 */
export interface ServerEnv {
  ANTHROPIC_API_KEY: string;
  SUPABASE_URL: string;
  SUPABASE_SERVICE_ROLE_KEY: string;
  ANTHROPIC_MODEL_EXTRACT: string;
  ANTHROPIC_MODEL_EQUALIZE: string;
}

export class MissingEnvError extends Error {
  constructor(public readonly chave: string) {
    super(`Variável de ambiente ausente no servidor: ${chave}`);
    this.name = 'MissingEnvError';
  }
}

function req(chave: string): string {
  const v = process.env[chave];
  if (!v) throw new MissingEnvError(chave);
  return v;
}

/** Lê e valida o ambiente do servidor. Lança MissingEnvError se faltar algo. */
export function serverEnv(): ServerEnv {
  return {
    ANTHROPIC_API_KEY: req('ANTHROPIC_API_KEY'),
    SUPABASE_URL: req('SUPABASE_URL'),
    SUPABASE_SERVICE_ROLE_KEY: req('SUPABASE_SERVICE_ROLE_KEY'),
    ANTHROPIC_MODEL_EXTRACT: process.env.ANTHROPIC_MODEL_EXTRACT ?? 'claude-haiku-5-5',
    ANTHROPIC_MODEL_EQUALIZE: process.env.ANTHROPIC_MODEL_EQUALIZE ?? 'claude-sonnet-5-5',
  };
}
