import { categoriasParecidas, chaveCategoria } from '../categorias';
import type { Dossie, ItemClausula, PartesContrato } from './tipos';

/** Bloco de condições específicas, como vem de `modelo_blocos`. */
export interface BlocoModelo {
  chave: string;
  titulo: string;
  categorias: string[];
  quando: string | null;
  parametros: { chave: string; rotulo: string; tipo: string; opcoes?: string[] }[];
  itens_anexo: string[];
  altera_clausulas: { numero?: string; apos?: string; texto: string }[];
}

export interface SugestaoBloco {
  chave: string;
  /** true = marcado por padrão (bate com a categoria ou com sinais do dossiê). */
  marcado: boolean;
  motivo: string;
  /** Parâmetros pré-preenchidos a partir do dossiê. */
  parametros: Record<string, string>;
}

const RATIFICACAO = 'ratificacao_proposta';

/**
 * Quais blocos oferecer e quais já marcar, pela categoria do certame (mesma
 * semelhança de `core/categorias`) e por sinais do dossiê (exclusões, hora
 * técnica, combustível). `categorias: ['*']` = sempre oferecer, sem marcar.
 */
export function sugerirBlocos(categoria: string, dossie: Dossie | null, blocos: readonly BlocoModelo[]): SugestaoBloco[] {
  const texto = [dossie?.proposta.observacoes ?? '', ...(dossie?.proposta.alertas ?? []).map((a) => `${a.titulo} ${a.texto}`), ...(dossie?.equalizacao?.riscos ?? [])].join('\n').toLowerCase();
  const ausentes = (dossie?.equalizacao?.escopo ?? []).filter((e) => e.status === 'ausente').map((e) => e.item);
  const out: SugestaoBloco[] = [];
  for (const b of blocos) {
    const geral = b.categorias.includes('*');
    const porCategoria = !geral && b.categorias.some((c) => categoriasParecidas(c, categoria) || chaveCategoria(categoria).includes(chaveCategoria(c)));
    let marcado = porCategoria;
    let motivo = porCategoria ? `sugerido para ${categoria}` : geral ? 'opcional' : 'outras categorias';
    const parametros: Record<string, string> = {};
    if (b.chave === 'exclusoes' && (ausentes.length || /exclu[sí]/.test(texto))) {
      marcado = true;
      motivo = ausentes.length ? 'a equalização apontou escopo ausente' : 'a proposta lista exclusões';
      if (ausentes.length) parametros.lista_exclusoes = ausentes.join('\n');
    }
    if (b.chave === 'hora_tecnica' && /hora\s*t[eé]cnica|hora\s*extra|h\/h/.test(texto)) {
      marcado = true;
      motivo = 'a proposta cobra hora técnica';
    }
    if (b.chave === 'faturamento_direto_insumo' && /diesel|combust[ií]vel|faturamento\s*direto/.test(texto)) {
      marcado = true;
      motivo = 'a proposta cita insumo/faturamento direto';
    }
    if (b.chave === RATIFICACAO) {
      marcado = false;
      motivo = 'obrigatório quando a proposta vira Anexo III e foi dirigida a outra empresa (RC-14)';
    }
    out.push({ chave: b.chave, marcado, motivo, parametros });
  }
  return out;
}

export interface BlocoAplicado {
  chave: string;
  titulo: string;
  itens: string[];
  alteracoes: { numero?: string; apos?: string; texto: string }[];
  faltando: string[];
}

function substituir(texto: string, params: Record<string, string>, tipos: Record<string, string>): { texto: string; faltando: string[] } {
  const faltando: string[] = [];
  const out = texto.replace(/\{\{(\w+)\}\}/g, (_, k: string) => {
    const v = (params[k] ?? '').trim();
    if (!v) {
      faltando.push(k);
      return `[${k.toUpperCase()}]`;
    }
    if (tipos[k] === 'lista') return v.split(/\r?\n|;/).map((x) => x.trim()).filter(Boolean).join('; ');
    return v;
  });
  return { texto: out, faltando };
}

/**
 * Aplica um bloco com seus parâmetros: itens do Anexo I com os marcadores
 * trocados (item que fica vazio sai) e as alterações de itens de cláusula.
 * `faltando` lista parâmetros sem valor (vira pendência; não bloqueia editar).
 */
export function aplicarBloco(bloco: BlocoModelo, params: Record<string, string>): BlocoAplicado {
  const tipos = Object.fromEntries(bloco.parametros.map((p) => [p.chave, p.tipo]));
  const faltando = new Set<string>();
  const itens: string[] = [];
  for (const t of bloco.itens_anexo) {
    // Item que é só um parâmetro opcional vazio (ex.: docs_nao_anexados) desaparece.
    const soMarcador = /^\{\{(\w+)\}\}$/.exec(t.trim());
    if (soMarcador && !(params[soMarcador[1]!] ?? '').trim()) continue;
    const r = substituir(t, params, tipos);
    r.faltando.forEach((f) => faltando.add(f));
    itens.push(r.texto);
  }
  const alteracoes = bloco.altera_clausulas.map((a) => {
    const r = substituir(a.texto, params, tipos);
    r.faltando.forEach((f) => faltando.add(f));
    return { numero: a.numero, apos: a.apos, texto: r.texto };
  });
  return { chave: bloco.chave, titulo: bloco.titulo, itens, alteracoes, faltando: [...faltando] };
}

/** Proposta anexada (Anexo III) dirigida a outra empresa exige o bloco de ratificação (RC-14). */
export function precisaRatificacao(partes: Partial<PartesContrato>, anexoIII: { incluir: boolean; emitente: string | null; destinatario: string | null }): boolean {
  if (!anexoIII.incluir) return false;
  const norm = (s: string | null | undefined) => chaveCategoria(s ?? '');
  const emit = norm(anexoIII.emitente);
  const dest = norm(anexoIII.destinatario);
  const cd = norm(partes.contratada?.razao_social);
  const cdCurto = norm(partes.contratada?.nome_curto);
  const ct = norm(partes.contratante?.razao_social);
  const ctCurto = norm(partes.contratante?.nome_curto);
  const cs = norm(partes.construtora?.razao_social);
  const emitenteDiverge = !!emit && emit !== cd && emit !== cdCurto;
  const destinatarioDiverge = !!dest && dest !== ct && dest !== ctCurto && dest !== cs;
  return emitenteDiverge || destinatarioDiverge;
}

/** Campos derivados dos anexos presentes (não se editam à mão). */
export function derivarAnexos(opts: { anexoIII: boolean }): { anexos_lista: string; q_documentos_integrantes: string } {
  return opts.anexoIII
    ? { anexos_lista: 'ANEXOS I, II e III', q_documentos_integrantes: 'Anexo I (Condições Particulares, Planilha de Preços e Escopo), Anexo II (Declaração de Capacidade) e Anexo III (Proposta Comercial).' }
    : { anexos_lista: 'ANEXOS I e II', q_documentos_integrantes: 'Anexo I (Condições Particulares, Planilha de Preços e Escopo) e Anexo II (Declaração de Capacidade).' };
}

/** Título/texto padrão do Anexo III a partir do dossiê e dos parâmetros da ratificação. */
export function textoAnexoIII(d: { fornecedor: string; numero?: string | null; data?: string | null; destinatario?: string | null }): { titulo: string; texto: string } {
  const partes = [`Proposta${d.numero ? ` nº ${d.numero}` : ''}${d.data ? `, de ${d.data}` : ''}, emitida por ${d.fornecedor}${d.destinatario ? ` e dirigida a ${d.destinatario}` : ''}.`, '**Prevalência:** em caso de conflito, prevalecem o contrato e o Anexo I (cláusula 1.3).'];
  return { titulo: 'ANEXO III – PROPOSTA COMERCIAL DA CONTRATADA', texto: partes.join(' ') };
}

/** Número do item de cláusula inserido por um bloco após `apos` (único por bloco). */
export function numeroItemBloco(apos: string, blocoChave: string): string {
  return `${apos}.b.${blocoChave}`;
}

/**
 * Itens de cláusula a gravar depois de aplicar os blocos escolhidos:
 * - item existente alterado por bloco → texto do bloco, origem 'bloco';
 * - inserção após um item → item novo (ou reativado) com origem 'bloco';
 * - item de bloco que saiu: alterado volta ao texto padrão; inserido fica
 *   `suprimido` (o RPC não apaga, só grava).
 * Só devolve o que muda.
 */
export function reconciliarItensBlocos(itens: readonly ItemClausula[], aplicados: readonly BlocoAplicado[]): ItemClausula[] {
  const out: ItemClausula[] = [];
  const tocados = new Set<string>();
  for (const a of aplicados) {
    for (const alt of a.alteracoes) {
      if (alt.numero) {
        const item = itens.find((i) => i.numero === alt.numero);
        if (!item) continue;
        tocados.add(item.numero);
        if (item.texto !== alt.texto || item.origem !== 'bloco' || item.blocoChave !== a.chave || item.suprimido) {
          out.push({ ...item, texto: alt.texto, origem: 'bloco', blocoChave: a.chave, varianteChave: null, suprimido: false, justificativa: null });
        }
      } else if (alt.apos) {
        const numero = numeroItemBloco(alt.apos, a.chave);
        tocados.add(numero);
        const atual = itens.find((i) => i.numero === numero);
        if (!atual || atual.texto !== alt.texto || atual.suprimido) {
          out.push({ numero, apos: alt.apos, texto: alt.texto, textoPadrao: null, origem: 'bloco', varianteChave: null, blocoChave: a.chave, suprimido: false, justificativa: null, reduzProtecao: atual?.reduzProtecao ?? false });
        }
      }
    }
  }
  for (const i of itens) {
    if (i.origem !== 'bloco' || tocados.has(i.numero) || i.suprimido) continue;
    if (i.textoPadrao != null) out.push({ ...i, texto: i.textoPadrao, origem: 'padrao', blocoChave: null, justificativa: null });
    else out.push({ ...i, suprimido: true });
  }
  return out;
}
