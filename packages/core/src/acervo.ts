import type { PropostaStatus } from './status';

/** Remove acentos e baixa a caixa, para busca tolerante. */
export function normalizar(texto: string): string {
  return texto
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .toLowerCase();
}

/**
 * Nome de exibição de uma proposta: o fornecedor e, quando o documento trouxe
 * mais de uma alternativa de preço, o rótulo da opção ("PANAIR · Opção 2 (Splitão)").
 */
export function nomeProposta(fornecedor: string, opcao?: string | null): string {
  const o = (opcao ?? '').trim();
  return o ? `${fornecedor} · ${o}` : fornecedor;
}

/** Uma proposta como aparece no acervo (achatada para a lista). */
export interface PropostaAcervo {
  id: string;
  fornecedor: string;
  /** Rótulo da alternativa de preço (null = preço único). */
  opcao?: string | null;
  categoria: string;
  obraId: string;
  obraNome: string;
  certameId: string;
  certameTitulo: string;
  status: PropostaStatus;
  valor: number | null;
  versaoAtual: number;
}

export interface AcervoFiltro {
  /** categoria (texto livre); vazio/ausente = todas. */
  categoria?: string | null;
  /** escopo por obra; vazio/ausente = todo o sistema. */
  obraId?: string | null;
  /** busca livre por fornecedor, categoria, obra, certame. */
  busca?: string;
}

/** Filtra e ordena o acervo por valor (crescente; nulos ao fim). Puro. */
export function filtrarAcervo(
  props: readonly PropostaAcervo[],
  filtro: AcervoFiltro = {},
): PropostaAcervo[] {
  let r = [...props];
  if (filtro.categoria) r = r.filter((p) => p.categoria === filtro.categoria);
  if (filtro.obraId) r = r.filter((p) => p.obraId === filtro.obraId);
  const q = (filtro.busca ?? '').trim();
  if (q) {
    const nq = normalizar(q);
    r = r.filter((p) =>
      normalizar(`${p.fornecedor} ${p.opcao ?? ''} ${p.categoria} ${p.obraNome} ${p.certameTitulo}`).includes(nq),
    );
  }
  return r.sort((a, b) => (a.valor ?? Infinity) - (b.valor ?? Infinity));
}

export interface ResumoAcervo {
  total: number;
  menorValor: number | null;
}

/** Resumo da lista filtrada: quantidade e menor valor. */
export function resumoAcervo(props: readonly PropostaAcervo[]): ResumoAcervo {
  const valores = props.map((p) => p.valor).filter((v): v is number => v != null);
  return {
    total: props.length,
    menorValor: valores.length ? Math.min(...valores) : null,
  };
}

/** Categorias distintas presentes no acervo, por frequência de uso. */
export function categoriasDoAcervo(props: readonly PropostaAcervo[]): string[] {
  const cont = new Map<string, number>();
  for (const p of props) cont.set(p.categoria, (cont.get(p.categoria) ?? 0) + 1);
  return [...cont.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0], 'pt-BR')).map(([c]) => c);
}

/* ---------- Sugestões (autocomplete, campo livre) ---------- */

export interface Sugestao {
  texto: string;
  uso: number;
}

/** Ordena por uso (desc) e depois alfabético. */
export function ordenarSugestoes(s: readonly Sugestao[]): Sugestao[] {
  return [...s].sort((a, b) => b.uso - a.uso || a.texto.localeCompare(b.texto, 'pt-BR'));
}

/** Filtra sugestões pelo termo (tolerante a acento) e limita a quantidade. */
export function filtrarSugestoes(
  s: readonly Sugestao[],
  termo: string,
  limite = 8,
): Sugestao[] {
  const nq = normalizar(termo.trim());
  const base = nq ? s.filter((x) => normalizar(x.texto).includes(nq)) : s;
  return ordenarSugestoes(base).slice(0, limite);
}
