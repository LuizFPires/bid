/**
 * Equalização — comparativo PURO e testável entre propostas (regra #1).
 * Nivela no mesmo plano: destaca menor/maior valor e prazo, calcula a economia
 * potencial. A análise com IA (apoio, não decisão) é do servidor; aqui ficam os
 * cálculos determinísticos que a tela exibe lado a lado.
 */

export interface PropostaComparavel {
  id: string;
  fornecedor: string;
  /** Rótulo da alternativa de preço (null = preço único). */
  opcao?: string | null;
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

/** Situação de um critério na matriz lado a lado (vira selo colorido na tela). */
export type CriterioStatus = 'ok' | 'alerta' | 'falta' | 'neutro';

/** Relatório de equalização no padrão "mesma régua" (ver EQUALIZE_PROMPT). */
export interface AnaliseEqualizacao {
  /** Manchete do sumário executivo (uma frase que resume a decisão). */
  titulo: string | null;
  /** Leitura: parágrafo que explica a manchete. */
  veredito: string | null;
  /** Cartões por proposta: valor apresentado × equalizado e a base de cada um. */
  cards: {
    proposta_id: string;
    apresentado: number | null;
    equalizado: number | null;
    /** Ex.: "818 m² · escopo completo". */
    base: string | null;
    /** Ex.: "estrutura galvanizada já inclusa". */
    nota: string | null;
  }[];
  /** Matriz lado a lado: critérios (linhas) × propostas, com texto e selo. */
  matriz: {
    criterios: string[];
    porProposta: { proposta_id: string; celulas: { texto: string | null; status: CriterioStatus }[] }[];
  };
  /** Equalização: composição item a item na mesma base, com totais. */
  equalizacao: {
    base: string | null;
    linhas: {
      item: string;
      valores: { proposta_id: string; valor: number | null; referencia: boolean; nota: string | null }[];
    }[];
    totais: { proposta_id: string; total: number | null }[];
  };
  /** Divergências que mudam a decisão (numeradas na tela). */
  divergencias: { titulo: string; texto: string }[];
  /** Forças e riscos por proposta. */
  forcas_riscos: { proposta_id: string; resumo: string | null; a_favor: string[]; riscos: string[] }[];
  /** Próximos passos recomendados (numerados). */
  proximos_passos: { titulo: string; texto: string }[];
  /** Conclusão fechada (caixa destacada no fim). */
  conclusao: string | null;
  /** Compatibilidade: achados soltos por fornecedor (análises antigas). */
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

const CELULA_SCHEMA = {
  type: 'object',
  properties: {
    criterio: { type: 'string', description: 'Nome do critério, igual ao listado em matriz.criterios.' },
    texto: { type: ['string', 'null'], description: 'O que a proposta diz sobre o critério, curto (≤ 90 caracteres).' },
    status: {
      type: 'string',
      enum: ['ok', 'alerta', 'falta', 'neutro'],
      description: 'ok = atende/favorável; alerta = parcial, a confirmar ou risco; falta = não informa/exclui; neutro = só informação.',
    },
  },
  required: ['criterio', 'texto', 'status'],
} as const;

export const EQUALIZE_INPUT_SCHEMA = {
  type: 'object',
  properties: {
    titulo: {
      type: ['string', 'null'],
      description: 'Manchete do sumário executivo, uma frase (ex.: "A proposta mais barata no papel não é a mais barata na obra.").',
    },
    veredito: {
      type: ['string', 'null'],
      description: 'Leitura: 2 a 4 frases com a melhor opção em custo, as diferenças em R$ e as condições para contratar.',
    },
    cards: {
      type: 'array',
      description: 'Um cartão por proposta: valor apresentado, valor equalizado na mesma base e o que explica a diferença.',
      items: {
        type: 'object',
        properties: {
          proposta_id: { type: 'string' },
          apresentado: { type: ['number', 'null'], description: 'Total como veio na proposta (R$).' },
          equalizado: { type: ['number', 'null'], description: 'Total na mesma base/escopo (R$).' },
          base: { type: ['string', 'null'], description: 'Base cotada, curta (ex.: "818 m² · escopo completo").' },
          nota: { type: ['string', 'null'], description: 'O que falta ou já está incluso (ex.: "+ estrutura a definir").' },
        },
        required: ['proposta_id', 'apresentado', 'equalizado', 'base', 'nota'],
      },
    },
    matriz: {
      type: 'object',
      description:
        'Lado a lado: separa o que está escrito do que está implícito. Critérios típicos: área/quantidade cotada, preço unitário, especificação, estrutura/itens de apoio, pagamento, prazo, garantia, validade, responsabilidade técnica.',
      properties: {
        criterios: { type: 'array', items: { type: 'string' }, description: '6 a 14 critérios, nomes curtos.' },
        propostas: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              proposta_id: { type: 'string' },
              celulas: { type: 'array', items: CELULA_SCHEMA },
            },
            required: ['proposta_id', 'celulas'],
          },
        },
      },
      required: ['criterios', 'propostas'],
    },
    equalizacao: {
      type: 'object',
      description:
        'Mesma régua: composição item a item com a MESMA quantidade/escopo para todas. Onde um fornecedor não cotou um item, use o valor de outra proposta como referência (referencia=true) e diga de quem.',
      properties: {
        base: { type: ['string', 'null'], description: 'Descrição da base comum (ex.: "898,94 m² × preço unitário + letreiros + PTA").' },
        linhas: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              item: { type: 'string' },
              valores: {
                type: 'array',
                items: {
                  type: 'object',
                  properties: {
                    proposta_id: { type: 'string' },
                    valor: { type: ['number', 'null'], description: 'R$; null quando não dá para estimar.' },
                    referencia: { type: 'boolean', description: 'true se o valor foi emprestado de outra proposta/mercado.' },
                    nota: { type: ['string', 'null'], description: 'Ex.: "a confirmar", "inclusa", "a cotar".' },
                  },
                  required: ['proposta_id', 'valor', 'referencia', 'nota'],
                },
              },
            },
            required: ['item', 'valores'],
          },
        },
        totais: {
          type: 'array',
          items: {
            type: 'object',
            properties: { proposta_id: { type: 'string' }, total: { type: ['number', 'null'] } },
            required: ['proposta_id', 'total'],
          },
        },
      },
      required: ['base', 'linhas', 'totais'],
    },
    divergencias: {
      type: 'array',
      description: 'Divergências que mudam a decisão (3 a 6), do mais importante ao menos.',
      items: {
        type: 'object',
        properties: { titulo: { type: 'string' }, texto: { type: 'string' } },
        required: ['titulo', 'texto'],
      },
    },
    forcas_riscos: {
      type: 'array',
      description: 'Para cada proposta: resumo em 3 rótulos curtos separados por " · ", pontos a favor e riscos.',
      items: {
        type: 'object',
        properties: {
          proposta_id: { type: 'string' },
          resumo: { type: ['string', 'null'] },
          a_favor: { type: 'array', items: { type: 'string' } },
          riscos: { type: 'array', items: { type: 'string' } },
        },
        required: ['proposta_id', 'resumo', 'a_favor', 'riscos'],
      },
    },
    proximos_passos: {
      type: 'array',
      description: 'Próximos passos recomendados (3 a 6), acionáveis: o que pedir a quem.',
      items: {
        type: 'object',
        properties: { titulo: { type: 'string' }, texto: { type: 'string' } },
        required: ['titulo', 'texto'],
      },
    },
    conclusao: {
      type: ['string', 'null'],
      description: 'Conclusão em 2 a 3 frases: totais equalizados, quem lidera e do que a decisão depende.',
    },
    achados: {
      type: 'array',
      description: 'Opcional (compatibilidade): pontos soltos por fornecedor. Pode ser lista vazia.',
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
  required: [
    'titulo',
    'veredito',
    'cards',
    'matriz',
    'equalizacao',
    'divergencias',
    'forcas_riscos',
    'proximos_passos',
    'conclusao',
    'achados',
    'recomendacao',
    'escopo',
  ],
} as const;

export const EQUALIZE_PROMPT = [
  'Você é um engenheiro de suprimentos sênior escrevendo um RELATÓRIO TÉCNICO-',
  'COMERCIAL de equalização de propostas de obra, para o dono da obra decidir.',
  'Você recebe os dados extraídos de cada proposta e, quando houver, os PDFs',
  'originais e uma RÉGUA DO PROJETO (quantidades/escopo de referência). Leia os',
  'PDFs por inteiro: valores, quantidades, unidades, exclusões, condições.',
  '',
  'MÉTODO (sempre nesta ordem de raciocínio):',
  '1. As propostas raramente são comparáveis como chegaram: cada uma mede uma',
  '   quantidade/área diferente e deixa itens de fora. Primeiro identifique a',
  '   BASE de cada uma (quantidade cotada, unidade, o que inclui/exclui).',
  '2. Coloque TODAS na MESMA RÉGUA: a quantidade do projeto (se a régua foi dada)',
  '   ou a maior base clara entre as propostas; × preço unitário de cada uma;',
  '   + itens que só algumas cotaram (use o valor de quem cotou como referência',
  '   para quem não cotou e marque referencia=true); itens não cotáveis ficam',
  '   como "a confirmar"/"a cotar". Mostre a composição em equalizacao.linhas e',
  '   os totais em equalizacao.totais. Nunca invente preço sem dizer a origem.',
  '3. O preço unitário manda quando o pagamento é por medição: destaque-o.',
  '4. Separe o que está ESCRITO do que está IMPLÍCITO. Onde a proposta é omissa,',
  '   o risco fica com quem contrata — marque status "falta".',
  '5. Aponte inconsistências dentro de cada PDF (texto de outra obra, soma que',
  '   não fecha, validade curta, destinatário errado, garantia frouxa). Cada',
  '   proposta pode trazer `alertas` da leitura (ex.: texto oculto com valores de',
  '   versões anteriores): use-os em divergencias e forcas_riscos — são munição',
  '   de negociação e não podem ser omitidos.',
  '',
  'ESCRITA: português do Brasil, direto, números no padrão brasileiro quando em',
  'texto (R$ 498.134; 898,94 m²), frases curtas, zero enrolação. A manchete',
  '(titulo) deve carregar a conclusão. Em cards.nota e matriz use rótulos curtos.',
  'Cite valores em R$ nas divergências e na conclusão. Não use markdown.',
  '',
  'REGRAS:',
  '- Todo proposta_id DEVE ser um dos ids informados; preencha cards, matriz,',
  '  equalizacao, forcas_riscos para TODAS as propostas.',
  '- recomendacao.proposta_id: a melhor por CUSTO-BENEFÍCIO (não só menor preço),',
  '  ou null se não der para decidir. A recomendação é apoio: diga "desde que…".',
  '- matriz.criterios: 6 a 14 critérios curtos; status: ok / alerta / falta /',
  '  neutro. matriz.propostas cobre todas as propostas com TODOS os critérios.',
  '- escopo (compatibilidade): UNIÃO de 3 a 8 itens de serviço, marcados',
  '  incluido/ausente/parcial por proposta, com os MESMOS nomes de escopo.itens.',
  '- achados pode ficar vazio (o conteúdo vai em forcas_riscos).',
  '',
  'Responda SOMENTE chamando a ferramenta registrar_analise com os dados. Não',
  'escreva texto fora da ferramenta.',
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
    titulo: txt(o.titulo),
    veredito: txt(o.veredito),
    cards: normalizarCards(o.cards, idsValidos),
    matriz: normalizarMatriz(o.matriz, idsValidos),
    equalizacao: normalizarEqualizacao(o.equalizacao, idsValidos),
    divergencias: listaTituloTexto(o.divergencias),
    forcas_riscos: normalizarForcasRiscos(o.forcas_riscos, idsValidos),
    proximos_passos: listaTituloTexto(o.proximos_passos),
    conclusao: txt(o.conclusao),
    achados,
    recomendacao: {
      proposta_id: recId && idsValidos.includes(recId) ? recId : null,
      fornecedor: txt(recRaw.fornecedor),
      justificativa: txt(recRaw.justificativa),
    },
    escopo: normalizarEscopo(o.escopo, idsValidos),
  };
}

function num(v: unknown): number | null {
  return typeof v === 'number' && Number.isFinite(v) ? v : null;
}
function obj(v: unknown): Record<string, unknown> | null {
  return typeof v === 'object' && v !== null ? (v as Record<string, unknown>) : null;
}
function lista(v: unknown): unknown[] {
  return Array.isArray(v) ? v : [];
}
function textos(v: unknown, max = 12): string[] {
  return lista(v)
    .map(txt)
    .filter((s): s is string => s !== null)
    .slice(0, max);
}

/** Entradas {titulo, texto} válidas, no máximo 8. */
function listaTituloTexto(v: unknown): { titulo: string; texto: string }[] {
  return lista(v)
    .map((x) => {
      const o = obj(x);
      const titulo = o ? txt(o.titulo) : null;
      const texto = o ? txt(o.texto) : null;
      return titulo && texto ? { titulo, texto } : null;
    })
    .filter((x): x is { titulo: string; texto: string } => x !== null)
    .slice(0, 8);
}

/** Um cartão por proposta válida (o primeiro de cada id vence). */
function normalizarCards(v: unknown, ids: readonly string[]): AnaliseEqualizacao['cards'] {
  const vistos = new Set<string>();
  const out: AnaliseEqualizacao['cards'] = [];
  for (const x of lista(v)) {
    const o = obj(x);
    const pid = o ? txt(o.proposta_id) : null;
    if (!o || !pid || !ids.includes(pid) || vistos.has(pid)) continue;
    vistos.add(pid);
    out.push({
      proposta_id: pid,
      apresentado: num(o.apresentado),
      equalizado: num(o.equalizado),
      base: txt(o.base),
      nota: txt(o.nota),
    });
  }
  return out;
}

function statusCriterio(v: unknown): CriterioStatus {
  return v === 'ok' || v === 'alerta' || v === 'falta' ? v : 'neutro';
}

/** Matriz critérios × propostas, células alinhadas a `criterios` (faltando → neutro/null). */
function normalizarMatriz(v: unknown, ids: readonly string[]): AnaliseEqualizacao['matriz'] {
  const m = obj(v) ?? {};
  const criterios = [...new Set(textos(m.criterios, 14).map((s) => s.slice(0, 60)))];
  if (criterios.length === 0) return { criterios: [], porProposta: [] };
  const porProposta = lista(m.propostas)
    .map((p) => {
      const po = obj(p);
      const pid = po ? txt(po.proposta_id) : null;
      if (!po || !pid || !ids.includes(pid)) return null;
      const mapa = new Map<string, { texto: string | null; status: CriterioStatus }>();
      for (const c of lista(po.celulas)) {
        const co = obj(c);
        const nome = co ? txt(co.criterio) : null;
        if (co && nome) mapa.set(nome, { texto: txt(co.texto)?.slice(0, 160) ?? null, status: statusCriterio(co.status) });
      }
      return {
        proposta_id: pid,
        celulas: criterios.map((c) => mapa.get(c) ?? { texto: null, status: 'neutro' as const }),
      };
    })
    .filter((x): x is AnaliseEqualizacao['matriz']['porProposta'][number] => x !== null);
  return { criterios, porProposta };
}

/** Composição equalizada: só ids válidos; linhas sem item são descartadas. */
function normalizarEqualizacao(v: unknown, ids: readonly string[]): AnaliseEqualizacao['equalizacao'] {
  const e = obj(v) ?? {};
  const linhas = lista(e.linhas)
    .map((l) => {
      const lo = obj(l);
      const item = lo ? txt(lo.item) : null;
      if (!lo || !item) return null;
      const valores = lista(lo.valores)
        .map((x) => {
          const xo = obj(x);
          const pid = xo ? txt(xo.proposta_id) : null;
          if (!xo || !pid || !ids.includes(pid)) return null;
          return { proposta_id: pid, valor: num(xo.valor), referencia: xo.referencia === true, nota: txt(xo.nota) };
        })
        .filter((x): x is { proposta_id: string; valor: number | null; referencia: boolean; nota: string | null } => x !== null);
      return { item: item.slice(0, 120), valores };
    })
    .filter((x): x is AnaliseEqualizacao['equalizacao']['linhas'][number] => x !== null)
    .slice(0, 20);
  const totais = lista(e.totais)
    .map((t) => {
      const to = obj(t);
      const pid = to ? txt(to.proposta_id) : null;
      return to && pid && ids.includes(pid) ? { proposta_id: pid, total: num(to.total) } : null;
    })
    .filter((x): x is { proposta_id: string; total: number | null } => x !== null);
  return { base: txt(e.base), linhas, totais };
}

function normalizarForcasRiscos(v: unknown, ids: readonly string[]): AnaliseEqualizacao['forcas_riscos'] {
  const vistos = new Set<string>();
  const out: AnaliseEqualizacao['forcas_riscos'] = [];
  for (const x of lista(v)) {
    const o = obj(x);
    const pid = o ? txt(o.proposta_id) : null;
    if (!o || !pid || !ids.includes(pid) || vistos.has(pid)) continue;
    vistos.add(pid);
    out.push({ proposta_id: pid, resumo: txt(o.resumo), a_favor: textos(o.a_favor, 8), riscos: textos(o.riscos, 8) });
  }
  return out;
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
