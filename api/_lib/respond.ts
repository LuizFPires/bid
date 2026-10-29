import type { VercelRequest, VercelResponse } from '@vercel/node';

/** Garante o método HTTP; responde 405 e retorna false se não bater. */
export function requireMethod(req: VercelRequest, res: VercelResponse, metodo: string): boolean {
  if (req.method !== metodo) {
    res.status(405).json({ erro: `Método não permitido. Use ${metodo}.` });
    return false;
  }
  return true;
}

/** Extrai o token Bearer do cabeçalho Authorization (ou null). */
export function bearer(req: VercelRequest): string | null {
  const h = req.headers.authorization;
  if (!h || !h.startsWith('Bearer ')) return null;
  const t = h.slice('Bearer '.length).trim();
  return t || null;
}

/** Stub padrão: declara o contrato da função e responde 501. */
export function naoImplementado(nome: string, previsto: string) {
  return (_req: VercelRequest, res: VercelResponse) => {
    res.status(501).json({ erro: 'Função ainda não implementada.', funcao: nome, previsto });
  };
}
