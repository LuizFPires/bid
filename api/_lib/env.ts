/**
 * Ambiente do servidor. Segredos (chave da Anthropic) e a URL/anon do Supabase
 * para as funções SÓ existem aqui — nunca no cliente. A `service_role` entra
 * nos milestones que gravam no servidor (contrato/assinatura).
 */

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

export const env = {
  anthropicKey: () => req('ANTHROPIC_API_KEY'),
  supabaseUrl: () => req('SUPABASE_URL'),
  supabaseAnonKey: () => req('SUPABASE_ANON_KEY'),
  modelExtract: () => process.env.ANTHROPIC_MODEL_EXTRACT ?? 'claude-haiku-5-5',
  modelEqualize: () => process.env.ANTHROPIC_MODEL_EQUALIZE ?? 'claude-sonnet-5-5',
};
