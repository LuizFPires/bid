import type { VercelRequest, VercelResponse, Handler } from './types';

/** Garante o método HTTP; responde 405 e retorna false se não bater. */
export function requireMethod(req: VercelRequest, res: VercelResponse, metodo: string): boolean {
  if (req.method !== metodo) {
    res.status(405).json({ erro: `Método não permitido. Use ${metodo}.` });
    return false;
  }
  return true;
}

/** Stub padrão de M0: declara o contrato da função e responde 501. */
export function naoImplementado(nome: string, previsto: string): Handler {
  return (_req, res) => {
    res.status(501).json({
      erro: 'Função ainda não implementada.',
      funcao: nome,
      previsto,
    });
  };
}
