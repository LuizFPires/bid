/**
 * Equalização — comparativo PURO e testável entre propostas (regra #1).
 * Nivela no mesmo plano: destaca menor/maior valor e prazo, calcula a economia
 * potencial. A análise com IA (apoio, não decisão) é do servidor; aqui ficam os
 * cálculos determinísticos que a tela exibe lado a lado.
 */

export interface PropostaComparavel {
  id: string;
  fornecedor: string;
  valor: number | null;
  prazo: number | null;
  condicaoPagamento: string | null;
  garantia: string | null;
}

export interface MarcadoresProposta {
  id: string;
  menorValor: boolean;
  maiorValor: boolean;
  menorPrazo: boolean;
  maiorPrazo: boolean;
}

export interface Comparativo {
  propostas: PropostaComparavel[];
  marcadores: Record<string, MarcadoresProposta>;
  menorValor: number | null;
  maiorValor: number | null;
  menorPrazo: number | null;
  maiorPrazo: number | null;
  /** Diferença entre o maior e o menor valor (quanto se evita escolhendo o menor). */
  economiaPotencial: number | null;
}

function extremos(nums: (number | null)[]): { min: number | null; max: number | null } {
  const vals = nums.filter((n): n is number => n !== null);
  if (vals.length === 0) return { min: null, max: null };
  return { min: Math.min(...vals), max: Math.max(...vals) };
}

/**
 * Monta o comparativo. Menor/maior só marcam quando há mais de uma proposta com
 * o dado (comparar exige base). Nulos são ignorados nos extremos.
 */
export function compararPropostas(props: readonly PropostaComparavel[]): Comparativo {
  const valores = props.map((p) => p.valor);
  const prazos = props.map((p) => p.prazo);
  const { min: menorValor, max: maiorValor } = extremos(valores);
  const { min: menorPrazo, max: maiorPrazo } = extremos(prazos);

  const comValor = valores.filter((v) => v !== null).length;
  const comPrazo = prazos.filter((v) => v !== null).length;

  const marcadores: Record<string, MarcadoresProposta> = {};
  for (const p of props) {
    marcadores[p.id] = {
      id: p.id,
      menorValor: comValor > 1 && p.valor !== null && p.valor === menorValor,
      maiorValor: comValor > 1 && p.valor !== null && p.valor === maiorValor,
      menorPrazo: comPrazo > 1 && p.prazo !== null && p.prazo === menorPrazo,
      maiorPrazo: comPrazo > 1 && p.prazo !== null && p.prazo === maiorPrazo,
    };
  }

  const economiaPotencial =
    menorValor !== null && maiorValor !== null && maiorValor > menorValor
      ? maiorValor - menorValor
      : null;

  return {
    propostas: [...props],
    marcadores,
    menorValor,
    maiorValor,
    menorPrazo,
    maiorPrazo,
    economiaPotencial,
  };
}
