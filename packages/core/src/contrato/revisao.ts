import type { Achado, RevisaoIA } from './tipos';

/**
 * Revisão obrigatória por IA (RC-07/RC-08): a IA compara minuta × proposta e
 * devolve conflitos, lacunas e riscos. Aqui: schema da ferramenta, prompt e a
 * normalização da saída (enums, tamanhos, descarte do que não aponta item).
 */
export const REVISAO_TOOL_NAME = 'registrar_revisao';

export const REVISAO_INPUT_SCHEMA = {
  type: 'object',
  required: ['resumo', 'achados'],
  properties: {
    resumo: { type: 'string', description: '2–4 frases: o contrato reflete a proposta? principais pontos.' },
    achados: {
      type: 'array',
      items: {
        type: 'object',
        required: ['tipo', 'severidade', 'numero', 'titulo', 'explicacao'],
        properties: {
          tipo: { type: 'string', enum: ['conflito', 'lacuna', 'risco'] },
          severidade: { type: 'string', enum: ['alta', 'media', 'baixa'] },
          numero: { type: 'string', description: "item do contrato: '3.2', 'quadro.q_prazo', 'planilha', 'anexo_i.bloco:<chave>', 'partes'" },
          titulo: { type: 'string' },
          explicacao: { type: 'string', description: 'com os números dos dois lados' },
          trecho_proposta: { type: ['string', 'null'], description: 'citação literal curta da proposta' },
          sugestao: { type: ['string', 'null'], description: 'texto sugerido para o item, pronto para colar' },
        },
      },
    },
  },
} as const;

export const REVISAO_PROMPT = [
  'Você é o revisor jurídico-técnico de contratos de empreitada de obra. Vai receber',
  '(1) o CONTRATO montado (quadro-resumo, partes, itens de cláusula com número e',
  'origem, planilha, condições específicas), (2) os DADOS EXTRAÍDOS da proposta',
  'vencedora com seus alertas, (3) quando houver, o arquivo ORIGINAL da proposta e',
  '(4) o que a equalização apontou sobre essa proposta (escopo ausente/parcial,',
  'riscos). Compare SEMPRE, campo a campo, o contrato com a proposta e registre os',
  'achados na ferramenta registrar_revisao.',
  '',
  'OBRIGAÇÕES:',
  '- Quadro × proposta: valor, regime (unitário/global), prazo, início, pagamento e',
  '  medição, retenção, antecipação, reajuste, garantia, materiais, faturamento',
  '  direto, exclusões, hora técnica/extras, validade da proposta, destinatário da',
  '  proposta (dirigida a outra empresa?).',
  '- Planilha: itens, unidades, quantidades, preços e soma × valor da proposta.',
  '- Toda condição da proposta CONTRÁRIA a uma cláusula do contrato é "conflito".',
  '- Toda EXCLUSÃO da proposta que a minuta trata como incluída é "conflito" de',
  '  severidade "alta".',
  '- Campos obrigatórios vazios ou bloco esperado e ausente são "lacuna".',
  '- Itens de origem "variante" que reduzam proteção, alertas da leitura (texto',
  '  oculto, somas que não fecham) e escopo ausente/parcial da equalização são "risco".',
  '- Não invente: sem evidência no contrato ou na proposta, não há achado.',
  '- "numero" aponta o item do contrato afetado: "3.2", "quadro.q_prazo", "planilha",',
  '  "anexo_i.bloco:<chave>" ou "partes".',
  '- Em "explicacao" traga os números dos dois lados (ex.: "quadro 60 dias × proposta',
  '  90 dias"). Em "sugestao", texto pronto para colar no item.',
  '- Português do Brasil, valores no padrão 1.234,56. Sem markdown.',
  '',
  'Responda SOMENTE chamando a ferramenta registrar_revisao. Não escreva fora dela.',
].join('\n');

const MAX_ACHADOS = 40;
const MAX_TEXTO = 1500;
const MAX_TRECHO = 300;

function txt(v: unknown, max = MAX_TEXTO): string | null {
  if (typeof v !== 'string') return null;
  const t = v.trim();
  return t ? t.slice(0, max) : null;
}

export function normalizarRevisao(raw: unknown): RevisaoIA {
  const o = (typeof raw === 'object' && raw !== null ? raw : {}) as Record<string, unknown>;
  const achados: Achado[] = [];
  for (const a of Array.isArray(o.achados) ? o.achados : []) {
    if (!a || typeof a !== 'object') continue;
    const x = a as Record<string, unknown>;
    const numero = txt(x.numero, 80);
    const titulo = txt(x.titulo, 160);
    const explicacao = txt(x.explicacao);
    if (!numero || !titulo || !explicacao) continue;
    const tipo = x.tipo === 'conflito' || x.tipo === 'lacuna' || x.tipo === 'risco' ? x.tipo : 'risco';
    const severidade = x.severidade === 'alta' || x.severidade === 'media' || x.severidade === 'baixa' ? x.severidade : 'media';
    achados.push({ tipo, severidade, numero, titulo, explicacao, trechoProposta: txt(x.trecho_proposta, MAX_TRECHO), sugestao: txt(x.sugestao) });
    if (achados.length >= MAX_ACHADOS) break;
  }
  const peso = { alta: 0, media: 1, baixa: 2 } as const;
  achados.sort((a, b) => peso[a.severidade] - peso[b.severidade]);
  return { resumo: txt(o.resumo), achados };
}

export interface AchadoComResolucao extends Achado {
  id?: string;
  resolucao: 'corrigido' | 'aceito' | null;
  justificativa: string | null;
}

/** Achados "alta" sem resolução bloqueiam o envio para validação (RC-08). */
export function achadosBloqueantes(achados: readonly AchadoComResolucao[]): AchadoComResolucao[] {
  return achados.filter((a) => a.severidade === 'alta' && !a.resolucao);
}

/** Contagem por severidade (para o evento e o badge). */
export function contarPorSeveridade(achados: readonly Achado[]): { alta: number; media: number; baixa: number } {
  return achados.reduce(
    (acc, a) => {
      acc[a.severidade] += 1;
      return acc;
    },
    { alta: 0, media: 0, baixa: 0 },
  );
}

/** Justificativa de aceite: mínimo de 10 caracteres úteis. */
export function justificativaValida(j: string | null | undefined): boolean {
  return (j ?? '').trim().length >= 10;
}
