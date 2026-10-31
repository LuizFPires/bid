import type { AnaliseEqualizacao } from './equalizacao';

/**
 * O que falta em cada proposta para a equalização fechar com segurança.
 * Derivado do próprio relatório (células da matriz com status "falta") e dos
 * dados da proposta (sem valor total). Serve para a tela dizer EM QUAL
 * proposta o usuário precisa atuar — nunca "pelo menos uma proposta".
 */
export interface PendenciaProposta {
  proposta_id: string;
  nome: string;
  faltas: string[];
}

export function pendenciasDaAnalise(
  analise: Pick<AnaliseEqualizacao, 'matriz'> | null | undefined,
  propostas: { id: string; nome: string; valor: number | null }[],
): PendenciaProposta[] {
  const criterios = analise?.matriz?.criterios ?? [];
  const porId = new Map((analise?.matriz?.porProposta ?? []).map((p) => [p.proposta_id, p.celulas] as const));
  const out: PendenciaProposta[] = [];
  for (const p of propostas) {
    const faltas: string[] = [];
    if (p.valor === null || p.valor === undefined) faltas.push('valor total');
    const celulas = porId.get(p.id) ?? [];
    celulas.forEach((c, i) => {
      const nome = criterios[i];
      if (c.status === 'falta' && nome) {
        const n = nome.trim();
        const jaTem = faltas.some((f) => f.localeCompare(n, 'pt-BR', { sensitivity: 'base' }) === 0);
        const valorRepetido = /^valor/i.test(n) && faltas.some((f) => /^valor/i.test(f));
        if (n && !jaTem && !valorRepetido) faltas.push(n);
      }
    });
    if (faltas.length) out.push({ proposta_id: p.id, nome: p.nome, faltas });
  }
  return out;
}

/** Frase pronta, nomeando proposta e dado: "Faltam dados na proposta da Precom: valor total e prazo." */
export function textoPendencias(pendencias: PendenciaProposta[]): string | null {
  if (!pendencias.length) return null;
  return pendencias
    .map((p) => {
      const lista = listar(p.faltas.map((f) => f.toLocaleLowerCase('pt-BR')));
      return `${p.faltas.length > 1 ? 'Faltam' : 'Falta'} na proposta da ${p.nome}: ${lista}.`;
    })
    .join(' ');
}

function listar(itens: string[]): string {
  if (itens.length <= 1) return itens[0] ?? '';
  return `${itens.slice(0, -1).join(', ')} e ${itens[itens.length - 1]}`;
}
