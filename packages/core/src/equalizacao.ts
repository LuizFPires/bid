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
  // Empate total (todos iguais) não marca nada — evita "menor" em todas.
  const valorVaria = comValor > 1 && menorValor !== maiorValor;
  const prazoVaria = comPrazo > 1 && menorPrazo !== maiorPrazo;

  const marcadores: Record<string, MarcadoresProposta> = {};
  for (const p of props) {
    marcadores[p.id] = {
      id: p.id,
      menorValor: valorVaria && p.valor !== null && p.valor === menorValor,
      maiorValor: valorVaria && p.valor !== null && p.valor === maiorValor,
      menorPrazo: prazoVaria && p.prazo !== null && p.prazo === menorPrazo,
      maiorPrazo: prazoVaria && p.prazo !== null && p.prazo === maiorPrazo,
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

/* ---------- Análise por IA (apoio) — partes puras ---------- */

/** Situação de um item de escopo numa proposta. `na` = não avaliado pela IA. */
export type EscopoStatus = 'incluido' | 'ausente' | 'parcial' | 'na';

export interface AnaliseEqualizacao {
  veredito: string | null;
  achados: { fornecedor: string; pontos: string[] }[];
  recomendacao: { proposta_id: string | null; fornecedor: string | null; justificativa: string | null };
  /**
   * Matriz de escopo: itens comparados (linhas) e, por proposta, a situação de
   * cada item — alinhada a `itens` (mesmo tamanho e ordem). Vazia quando a IA
   * não identificou itens de escopo comparáveis.
   */
  escopo: {
    itens: string[];
    porProposta: { proposta_id: string; status: EscopoStatus[] }[];
  };
}

export const EQUALIZE_TOOL_NAME = 'registrar_analise';

export const EQUALIZE_INPUT_SCHEMA = {
  type: 'object',
  properties: {
    veredito: { type: ['string', 'null'], description: 'Síntese curta da comparação.' },
    achados: {
      type: 'array',
      description: 'Pontos por proposta (itens faltando, risco de custo extra, escopo).',
      items: {
        type: 'object',
        properties: {
          fornecedor: { type: 'string' },
          pontos: { type: 'array', items: { type: 'string' } },
        },
        required: ['fornecedor', 'pontos'],
      },
    },
    recomendacao: {
      type: 'object',
      description: 'Proposta recomendada (apoio — a decisão é do usuário).',
      properties: {
        proposta_id: { type: ['string', 'null'] },
        fornecedor: { type: ['string', 'null'] },
        justificativa: { type: ['string', 'null'] },
      },
      required: ['proposta_id', 'fornecedor', 'justificativa'],
    },
    escopo: {
      type: 'object',
      description:
        'Matriz de escopo: a UNIÃO dos itens de serviço comparados e, para cada proposta, se cada item está incluído, ausente ou parcial.',
      properties: {
        itens: {
          type: 'array',
          description:
            'Lista canônica e enxuta dos itens de escopo comparados (ex.: "Transporte", "Montagem"), na ordem em que aparecem na tabela.',
          items: { type: 'string' },
        },
        propostas: {
          type: 'array',
          description: 'Situação dos itens por proposta.',
          items: {
            type: 'object',
            properties: {
              proposta_id: { type: 'string', description: 'Um dos ids informados.' },
              marcacoes: {
                type: 'array',
                items: {
                  type: 'object',
                  properties: {
                    item: { type: 'string', description: 'Nome do item, igual ao listado em escopo.itens.' },
                    status: { type: 'string', enum: ['incluido', 'ausente', 'parcial'] },
                  },
                  required: ['item', 'status'],
                },
              },
            },
            required: ['proposta_id', 'marcacoes'],
          },
        },
      },
      required: ['itens', 'propostas'],
    },
  },
  required: ['veredito', 'achados', 'recomendacao', 'escopo'],
} as const;

export const EQUALIZE_PROMPT = [
  'Você é um analista de compras de obras. Compare as propostas no mesmo nível',
  '(normalize escopos; se alguém não incluiu um item que os outros incluíram,',
  'aponte o risco de custo extra). Registre a análise na ferramenta.',
  '',
  '- Recomende a melhor proposta por CUSTO-BENEFÍCIO, não só o menor preço.',
  '- recomendacao.proposta_id DEVE ser um dos ids informados (ou null se não der).',
  '- A recomendação é apoio; seja objetivo e justifique.',
  '',
  'MATRIZ DE ESCOPO (campo escopo):',
  '- Em escopo.itens, liste a UNIÃO dos itens de serviço relevantes para comparar',
  '  (poucos e objetivos, 3 a 8 itens; use os `itens` de cada proposta e o bom',
  '  senso do serviço). Nomes curtos e consistentes.',
  '- Em escopo.propostas, para CADA proposta informada, marque cada item como',
  '  "incluido", "ausente" ou "parcial". Use os MESMOS nomes de escopo.itens.',
  '- Se não houver itens comparáveis, devolva escopo.itens vazio.',
].join('\n');

const MAX = 2000;
function txt(v: unknown): string | null {
  if (typeof v !== 'string') return null;
  const t = v.trim();
  return t ? t.slice(0, MAX) : null;
}

/**
 * Normaliza a saída da IA. `idsValidos` garante que a recomendação aponte para
 * uma das propostas comparadas (senão zera o id — a IA não inventa alvo).
 */
export function normalizarAnalise(raw: unknown, idsValidos: readonly string[]): AnaliseEqualizacao {
  const o = (typeof raw === 'object' && raw !== null ? raw : {}) as Record<string, unknown>;
  const achadosRaw = Array.isArray(o.achados) ? o.achados : [];
  const achados = achadosRaw
    .slice(0, 50)
    .map((a) => {
      if (typeof a !== 'object' || a === null) return null;
      const ao = a as Record<string, unknown>;
      const fornecedor = txt(ao.fornecedor);
      if (!fornecedor) return null;
      const pontos = (Array.isArray(ao.pontos) ? ao.pontos : [])
        .map(txt)
        .filter((p): p is string => p !== null)
        .slice(0, 20);
      return { fornecedor, pontos };
    })
    .filter((a): a is { fornecedor: string; pontos: string[] } => a !== null);

  const recRaw = (typeof o.recomendacao === 'object' && o.recomendacao !== null ? o.recomendacao : {}) as Record<
    string,
    unknown
  >;
  const recId = txt(recRaw.proposta_id);

  return {
    veredito: txt(o.veredito),
    achados,
    recomendacao: {
      proposta_id: recId && idsValidos.includes(recId) ? recId : null,
      fornecedor: txt(recRaw.fornecedor),
      justificativa: txt(recRaw.justificativa),
    },
    escopo: normalizarEscopo(o.escopo, idsValidos),
  };
}

function statusEscopo(v: unknown): EscopoStatus {
  return v === 'incluido' || v === 'ausente' || v === 'parcial' ? v : 'na';
}

/**
 * Normaliza a matriz de escopo: itens únicos (ordem preservada) e, por proposta
 * VÁLIDA, um vetor de situação alinhado a `itens` (faltando → 'na').
 */
function normalizarEscopo(
  raw: unknown,
  idsValidos: readonly string[],
): AnaliseEqualizacao['escopo'] {
  const e = (typeof raw === 'object' && raw !== null ? raw : {}) as Record<string, unknown>;
  const itens = [
    ...new Set(
      (Array.isArray(e.itens) ? e.itens : [])
        .map((s) => txt(s)?.slice(0, 80) ?? null)
        .filter((s): s is string => s !== null),
    ),
  ].slice(0, 12);

  const porProposta = (Array.isArray(e.propostas) ? e.propostas : [])
    .map((p) => {
      if (typeof p !== 'object' || p === null) return null;
      const po = p as Record<string, unknown>;
      const pid = txt(po.proposta_id);
      if (!pid || !idsValidos.includes(pid)) return null;
      const mapa = new Map<string, EscopoStatus>();
      for (const m of Array.isArray(po.marcacoes) ? po.marcacoes : []) {
        if (typeof m !== 'object' || m === null) continue;
        const mo = m as Record<string, unknown>;
        const item = txt(mo.item);
        if (item) mapa.set(item, statusEscopo(mo.status));
      }
      return { proposta_id: pid, status: itens.map((it) => mapa.get(it) ?? 'na') };
    })
    .filter((x): x is { proposta_id: string; status: EscopoStatus[] } => x !== null);

  // Sem itens não há matriz; devolve estrutura vazia coerente.
  return itens.length ? { itens, porProposta } : { itens: [], porProposta: [] };
}
