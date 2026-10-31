import type { AnaliseEqualizacao, CriterioStatus } from './equalizacao';

/** Um ponto que o fornecedor precisa corrigir ou esclarecer na proposta. */
export interface PontoRevisao {
  criterio: string;
  situacao: Extract<CriterioStatus, 'falta' | 'alerta'>;
  /** O que a IA leu na proposta (quando houver), para dar contexto ao pedido. */
  texto: string | null;
}

export interface PedidoRevisao {
  proposta_id: string;
  nome: string;
  pontos: PontoRevisao[];
}

/**
 * O que pedir a cada fornecedor, a partir da matriz "lado a lado": critérios
 * marcados como `falta` (não consta) e `alerta` (consta, mas precisa ser
 * confirmado/esclarecido). Propostas sem valor total entram com "Valor total".
 */
export function pedidosDeRevisao(
  analise: Pick<AnaliseEqualizacao, 'matriz'> | null | undefined,
  propostas: { id: string; nome: string; valor: number | null }[],
): PedidoRevisao[] {
  const criterios = analise?.matriz?.criterios ?? [];
  const porId = new Map((analise?.matriz?.porProposta ?? []).map((p) => [p.proposta_id, p.celulas] as const));
  const out: PedidoRevisao[] = [];
  for (const p of propostas) {
    const pontos: PontoRevisao[] = [];
    if (p.valor == null) pontos.push({ criterio: 'Valor total', situacao: 'falta', texto: null });
    (porId.get(p.id) ?? []).forEach((c, i) => {
      const criterio = criterios[i]?.trim();
      if (!criterio || (c.status !== 'falta' && c.status !== 'alerta')) return;
      if (/^valor/i.test(criterio) && pontos.some((x) => /^valor/i.test(x.criterio))) return;
      if (pontos.some((x) => x.criterio.localeCompare(criterio, 'pt-BR', { sensitivity: 'base' }) === 0)) return;
      pontos.push({ criterio, situacao: c.status, texto: c.texto });
    });
    // Faltas primeiro (são o que impede a comparação), depois os alertas.
    pontos.sort((a, b) => (a.situacao === b.situacao ? 0 : a.situacao === 'falta' ? -1 : 1));
    if (pontos.length) out.push({ proposta_id: p.id, nome: p.nome, pontos });
  }
  return out;
}

/** O que pedir, em linguagem de obra, conforme o critério. */
function pedidoDoCriterio(criterio: string, situacao: PontoRevisao['situacao']): string {
  const c = criterio.toLocaleLowerCase('pt-BR');
  const falta = situacao === 'falta';
  if (/tribut|impost|iss|pis|cofins/.test(c)) return falta ? 'informar explicitamente se os tributos estão incluídos no preço' : 'confirmar por escrito que os tributos estão incluídos no preço final';
  if (/garantia/.test(c)) return falta ? 'incluir a garantia (prazo e cobertura)' : 'confirmar o prazo e a cobertura da garantia';
  if (/validade/.test(c)) return falta ? 'informar a validade da proposta' : 'renovar a validade da proposta';
  if (/pagamento/.test(c)) return falta ? 'informar as condições de pagamento' : 'confirmar as condições de pagamento';
  if (/prazo/.test(c)) return falta ? 'informar o prazo de execução' : 'confirmar o prazo de execução';
  if (/valor|pre[çc]o/.test(c)) return falta ? 'informar o valor total fechado' : 'confirmar o valor total fechado';
  if (/peso|a[çc]o/.test(c)) return falta ? 'informar o peso de aço considerado' : 'confirmar o peso de aço considerado';
  if (/[áa]rea|quantidade|base/.test(c)) return falta ? 'informar a área/quantidade considerada' : 'confirmar a área/quantidade considerada';
  if (/escopo|exclus|omiss/.test(c)) return falta ? 'detalhar o escopo e as exclusões' : 'esclarecer o escopo e as exclusões';
  return falta ? 'incluir essa informação na proposta' : 'esclarecer esse ponto na proposta';
}

export interface MensagemRevisaoDados {
  categoria: string;
  obra: string | null;
  pontos: PontoRevisao[];
}

/**
 * Texto pronto para o WhatsApp: direto ao ponto, um item por linha. Sem
 * saudação nem assinatura — a conversa já está aberta e quem manda cumprimenta
 * do seu jeito; termina no "obrigado".
 */
export function mensagemRevisao(d: MensagemRevisaoDados): string {
  const onde = d.obra ? `${d.categoria} da obra ${d.obra}` : d.categoria;
  const linhas = d.pontos.map((p) => {
    const pedido = pedidoDoCriterio(p.criterio, p.situacao);
    const contexto = p.situacao === 'alerta' && p.texto ? ` (a proposta traz: "${p.texto}")` : '';
    return `• ${p.criterio}: ${pedido}${contexto}.`;
  });
  return [
    `Estamos equalizando as propostas de ${onde} e precisamos de uma revisão da sua proposta nos pontos abaixo:`,
    '',
    ...linhas,
    '',
    'Pode nos enviar a proposta revisada com esses itens? Assim conseguimos comparar na mesma base. Obrigado!',
  ].join('\n');
}

/** Link do WhatsApp com a mensagem pronta; o WhatsApp pede o contato ao abrir. */
export function linkWhatsAppMensagem(mensagem: string): string {
  return `https://wa.me/?text=${encodeURIComponent(mensagem)}`;
}
