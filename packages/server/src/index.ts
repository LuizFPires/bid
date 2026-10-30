/**
 * @bid/server — código de servidor compartilhado pelas funções /api. Empacotado
 * (esbuild) num único arquivo, com os pacotes npm externos. Vive como PACOTE (e
 * não em api/_lib) porque a Vercel não inclui arquivos _lib no bundle das
 * funções; como pacote, é resolvido como o @bid/core.
 */
export * from './env';
export * from './respond';
export * from './supabase';
export * from './anthropic';
export * from './pdf';
export * from './assinatura-pdf';
export * from './assinar';
