import type { Dossie, EntradaDossie } from './tipos';

const MAX_LISTA = 12;

/**
 * Monta o dossiê da vencedora: proposta (dados atuais + leitura da IA), o que a
 * equalização disse DELA (matriz, escopo, forças/riscos, equalizado) e a obra.
 * Puro e determinístico (data vem de fora) — é fotografado em `contratos.dossie`.
 */
export function montarDossie(e: EntradaDossie): Dossie {
  const ex = e.extraida ?? {};
  const pid = e.proposta.id;
  const an = e.analise;
  let equalizacao: Dossie['equalizacao'] = null;
  if (an) {
    const linha = an.matriz?.porProposta.find((p) => p.proposta_id === pid);
    const criterios = (an.matriz?.criterios ?? []).map((criterio, i) => ({
      criterio,
      texto: linha?.celulas[i]?.texto ?? null,
      status: linha?.celulas[i]?.status ?? ('neutro' as const),
    }));
    const esc = an.escopo?.porProposta.find((p) => p.proposta_id === pid);
    const escopo = (an.escopo?.itens ?? []).map((item, i) => ({ item, status: esc?.status[i] ?? ('na' as const) }));
    const fr = an.forcas_riscos?.find((f) => f.proposta_id === pid);
    const card = an.cards?.find((c) => c.proposta_id === pid);
    equalizacao = {
      equalizacaoId: an.id,
      criterios,
      escopo,
      aFavor: (fr?.a_favor ?? []).slice(0, MAX_LISTA),
      riscos: (fr?.riscos ?? []).slice(0, MAX_LISTA),
      equalizado: card?.equalizado ?? null,
      base: card?.base ?? null,
      nota: card?.nota ?? null,
    };
  }
  return {
    versao: 1,
    geradoEm: e.agora ?? new Date().toISOString(),
    proposta: {
      id: pid,
      fornecedor: e.proposta.fornecedor,
      opcao: e.proposta.opcao,
      versao: e.proposta.versao,
      arquivoPath: e.proposta.arquivoPath,
      valor: e.proposta.valor,
      prazoDias: e.proposta.prazoDias,
      condicaoPagamento: e.proposta.condicaoPagamento,
      garantia: e.proposta.garantia,
      observacoes: ex.observacoes ?? null,
      itens: (ex.itens ?? []).slice(0, 200),
      alertas: (ex.alertas ?? []).slice(0, 10),
    },
    equalizacao,
    obra: e.obra,
    categoria: e.categoria,
  };
}

/** Pontos do dossiê que merecem destaque na Etapa 1 (alertas da leitura + escopo ausente/parcial + riscos). */
export function destaquesDoDossie(d: Dossie): { tipo: 'alerta' | 'escopo' | 'risco'; texto: string }[] {
  const out: { tipo: 'alerta' | 'escopo' | 'risco'; texto: string }[] = [];
  for (const a of d.proposta.alertas) out.push({ tipo: 'alerta', texto: `${a.titulo}: ${a.texto}` });
  for (const s of d.equalizacao?.escopo ?? []) {
    if (s.status === 'ausente') out.push({ tipo: 'escopo', texto: `${s.item}: ausente na proposta` });
    if (s.status === 'parcial') out.push({ tipo: 'escopo', texto: `${s.item}: parcial na proposta` });
  }
  for (const r of d.equalizacao?.riscos ?? []) out.push({ tipo: 'risco', texto: r });
  return out;
}

/** A proposta mudou depois do dossiê? (nova versão ou valor/prazo diferentes) — RC-02. */
export function dossieDesatualizado(
  d: Dossie,
  atual: { versao: number | null; valor: number | null; prazoDias: number | null },
): boolean {
  if (d.proposta.versao != null && atual.versao != null && atual.versao !== d.proposta.versao) return true;
  if (atual.valor !== d.proposta.valor) return true;
  if (atual.prazoDias !== d.proposta.prazoDias) return true;
  return false;
}
