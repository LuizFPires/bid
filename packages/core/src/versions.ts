/** Variação entre versões de uma proposta (valor e prazo). */

export type Direcao = 'up' | 'down' | 'flat';

export interface Variacao {
  abs: number;
  pct: number;
  dir: Direcao;
}

/** Variação de `anterior` → `atual`. pct é relativo a `anterior` (0 se anterior = 0). */
export function variacao(anterior: number, atual: number): Variacao {
  const abs = atual - anterior;
  const pct = anterior === 0 ? 0 : (abs / anterior) * 100;
  const dir: Direcao = abs > 0 ? 'up' : abs < 0 ? 'down' : 'flat';
  return { abs, pct, dir };
}

export interface VersaoResumo {
  n: number;
  valor: number;
  prazo: number;
}

/** Variação da última versão em relação à penúltima; null se houver só uma versão. */
export function variacaoUltimaVersao(
  versoes: readonly VersaoResumo[],
): { valor: Variacao; prazo: Variacao } | null {
  if (versoes.length < 2) return null;
  const ordenadas = [...versoes].sort((a, b) => a.n - b.n);
  const atual = ordenadas[ordenadas.length - 1]!;
  const anterior = ordenadas[ordenadas.length - 2]!;
  return {
    valor: variacao(anterior.valor, atual.valor),
    prazo: variacao(anterior.prazo, atual.prazo),
  };
}
