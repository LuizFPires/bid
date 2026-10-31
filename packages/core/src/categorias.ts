/**
 * Categorias de serviço — regras PURAS (regra #1). A categoria é campo livre;
 * aqui só se detecta "parecidas" para o usuário decidir mesclar/renomear.
 */

const RUIDO = new Set(['de', 'da', 'do', 'das', 'dos', 'e', 'em', 'para', 'com', 'a', 'o', 'as', 'os']);

/** Normaliza para comparar: minúsculas, sem acento, sem pontuação e sem palavras vazias. */
export function chaveCategoria(nome: string): string {
  return nome
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, ' ')
    .split(/[\s-]+/)
    .filter((t) => t && !RUIDO.has(t))
    .join(' ');
}

function tokens(nome: string): string[] {
  return chaveCategoria(nome).split(' ').filter(Boolean);
}

/** Raiz grosseira: tira plural e vogal final de gênero ("moldados" ≈ "moldada" ≈ "moldad"). */
function raiz(t: string): string {
  return t.replace(/(oes|aes|es|is|s)$/, '').replace(/(ao|a|o|e)$/, '');
}

/**
 * Duas categorias são "parecidas" quando, depois de normalizar: são iguais; uma
 * é prefixo da outra ("estrutura" ⊂ "estrutura pre moldada"); ou compartilham
 * todas as palavras da menor (por raiz). Curtas demais (≤ 2 letras) não casam.
 */
export function categoriasParecidas(a: string, b: string): boolean {
  const ka = chaveCategoria(a);
  const kb = chaveCategoria(b);
  if (!ka || !kb || ka.length <= 2 || kb.length <= 2) return false;
  if (ka === kb) return true;
  if (ka.startsWith(kb + ' ') || kb.startsWith(ka + ' ')) return true;
  const ta = new Set(tokens(a).map(raiz));
  const tb = new Set(tokens(b).map(raiz));
  const [menor, maior] = ta.size <= tb.size ? [ta, tb] : [tb, ta];
  if (menor.size === 0) return false;
  for (const t of menor) if (!maior.has(t)) return false;
  return true;
}

export interface CategoriaUso {
  nome: string;
  propostas: number;
  obras: number;
}

export interface CategoriaAgrupada extends CategoriaUso {
  /** Nomes das outras categorias parecidas com esta (vazio = única). */
  parecidas: string[];
  /** A mais usada do seu grupo de parecidas (sugestão de nome padrão). */
  padrao: boolean;
}

/** Agrupa por semelhança e marca a mais usada de cada grupo como "padrão". */
export function agruparCategorias(lista: readonly CategoriaUso[]): CategoriaAgrupada[] {
  const n = lista.length;
  const grupo = Array.from({ length: n }, (_, i) => i);
  const find = (i: number): number => (grupo[i] === i ? i : (grupo[i] = find(grupo[i]!)));
  for (let i = 0; i < n; i++)
    for (let j = i + 1; j < n; j++)
      if (categoriasParecidas(lista[i]!.nome, lista[j]!.nome)) grupo[find(i)] = find(j);

  const membros = new Map<number, number[]>();
  for (let i = 0; i < n; i++) {
    const g = find(i);
    membros.set(g, [...(membros.get(g) ?? []), i]);
  }
  return lista.map((c, i) => {
    const irmaos = (membros.get(find(i)) ?? []).filter((k) => k !== i);
    const maisUsada = [i, ...irmaos].sort((x, y) => lista[y]!.propostas - lista[x]!.propostas || lista[x]!.nome.localeCompare(lista[y]!.nome))[0];
    return { ...c, parecidas: irmaos.map((k) => lista[k]!.nome), padrao: irmaos.length > 0 && maisUsada === i };
  });
}
