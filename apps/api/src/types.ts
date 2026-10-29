import type { IncomingMessage, ServerResponse } from 'node:http';

/**
 * Tipos mínimos compatíveis com o runtime Node da Vercel (@vercel/node).
 * Mantidos locais no M0 para o pacote compilar sem dependências externas;
 * quando o deploy for configurado, trocam-se por `@vercel/node`.
 */
export interface VercelRequest extends IncomingMessage {
  query: Record<string, string | string[]>;
  body: unknown;
  method?: string;
}

export interface VercelResponse extends ServerResponse {
  status: (code: number) => VercelResponse;
  json: (body: unknown) => VercelResponse;
  send: (body: unknown) => VercelResponse;
}

export type Handler = (req: VercelRequest, res: VercelResponse) => void | Promise<void>;
