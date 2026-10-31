/**
 * Qualificação das partes do contrato (CONTRATANTE, CONTRATADA, CONSTRUTORA) e
 * validação de documentos (CNPJ/CPF por dígito verificador; CNO por formato).
 * Texto no padrão da minuta: "Razão Social, natureza, inscrita no CNPJ sob
 * nº 00.000.000/0000-00, com sede na Endereço, CEP 00000-000, neste ato
 * representada por A e B".
 */

export function somenteDigitos(v: string | null | undefined): string {
  return (v ?? '').replace(/\D/g, '');
}

function todosIguais(d: string): boolean {
  return /^(\d)\1+$/.test(d);
}

export function cnpjValido(v: string | null | undefined): boolean {
  const d = somenteDigitos(v);
  if (d.length !== 14 || todosIguais(d)) return false;
  const calc = (base: string, pesos: number[]) => {
    const soma = base.split('').reduce((s, c, i) => s + Number(c) * pesos[i]!, 0);
    const r = soma % 11;
    return r < 2 ? 0 : 11 - r;
  };
  const p1 = [5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2];
  const p2 = [6, ...p1];
  const d1 = calc(d.slice(0, 12), p1);
  const d2 = calc(d.slice(0, 12) + d1, p2);
  return d.endsWith(`${d1}${d2}`);
}

export function cpfValido(v: string | null | undefined): boolean {
  const d = somenteDigitos(v);
  if (d.length !== 11 || todosIguais(d)) return false;
  const calc = (base: string, inicio: number) => {
    const soma = base.split('').reduce((s, c, i) => s + Number(c) * (inicio - i), 0);
    const r = (soma * 10) % 11;
    return r === 10 ? 0 : r;
  };
  const d1 = calc(d.slice(0, 9), 10);
  const d2 = calc(d.slice(0, 9) + d1, 11);
  return d.endsWith(`${d1}${d2}`);
}

/**
 * CNO (Cadastro Nacional de Obras): 12 dígitos. Validação só de FORMATO —
 * o algoritmo do dígito verificador não é público de forma confiável
 * (decisão registrada no PLAN); o campo é conferido pelo usuário.
 */
export function cnoValido(v: string | null | undefined): boolean {
  return somenteDigitos(v).length === 12;
}

export function cepValido(v: string | null | undefined): boolean {
  return somenteDigitos(v).length === 8;
}

export function formatarCnpj(v: string | null | undefined): string {
  const d = somenteDigitos(v);
  return d.length === 14 ? `${d.slice(0, 2)}.${d.slice(2, 5)}.${d.slice(5, 8)}/${d.slice(8, 12)}-${d.slice(12)}` : (v ?? '');
}
export function formatarCpf(v: string | null | undefined): string {
  const d = somenteDigitos(v);
  return d.length === 11 ? `${d.slice(0, 3)}.${d.slice(3, 6)}.${d.slice(6, 9)}-${d.slice(9)}` : (v ?? '');
}
/** CPF mascarado para listas: ***.982.247-**. */
export function mascararCpf(v: string | null | undefined): string {
  const d = somenteDigitos(v);
  return d.length === 11 ? `***.${d.slice(3, 6)}.${d.slice(6, 9)}-**` : '';
}
export function formatarCno(v: string | null | undefined): string {
  const d = somenteDigitos(v);
  return d.length === 12 ? `${d.slice(0, 2)}.${d.slice(2, 5)}.${d.slice(5, 10)}/${d.slice(10)}` : (v ?? '');
}
export function formatarCep(v: string | null | undefined): string {
  const d = somenteDigitos(v);
  return d.length === 8 ? `${d.slice(0, 5)}-${d.slice(5)}` : (v ?? '');
}

/** "A" · "A e B" · "A, B e C". */
export function listarNomes(nomes: readonly string[]): string {
  const n = nomes.map((x) => x.trim()).filter(Boolean);
  if (n.length <= 1) return n[0] ?? '';
  return `${n.slice(0, -1).join(', ')} e ${n[n.length - 1]}`;
}

export interface ParteCadastro {
  razao_social: string;
  nome_curto?: string | null;
  natureza?: string | null;
  cnpj: string;
  endereco: string;
  cep?: string | null;
}

export interface SignatarioCadastro {
  nome: string;
  cargo?: string | null;
  cpf?: string | null;
}

export type PapelParte = 'contratante' | 'contratada' | 'construtora';

/**
 * Qualificação completa da parte, como vai na abertura do contrato. Signatários
 * entram por nome (cargo não entra na qualificação; vai no bloco de assinatura).
 * Sociedades com 2+ signatários: "representada por seus diretores A e B" quando
 * todos têm cargo "Diretor"; senão, "representada por A e B".
 */
export function qualificar(parte: ParteCadastro, signatarios: readonly SignatarioCadastro[]): string {
  const partes: string[] = [parte.razao_social.trim()];
  if (parte.natureza?.trim()) partes.push(parte.natureza.trim());
  partes.push(`inscrita no CNPJ sob nº ${formatarCnpj(parte.cnpj)}`);
  const sede = `com sede na ${parte.endereco.trim()}${parte.cep && cepValido(parte.cep) ? `, CEP ${formatarCep(parte.cep)}` : ''}`;
  partes.push(sede);
  const ativos = signatarios.filter((s) => s.nome.trim());
  if (ativos.length) {
    const todosDiretores = ativos.length >= 2 && ativos.every((s) => /^diretor/i.test(s.cargo ?? ''));
    partes.push(`neste ato representada por ${todosDiretores ? 'seus diretores ' : ''}${listarNomes(ativos.map((s) => s.nome))}`);
  }
  return partes.join(', ');
}

/** Como a parte é chamada no corpo do texto: nome curto quando houver, senão a razão social. */
export function nomeNoTexto(parte: Pick<ParteCadastro, 'razao_social' | 'nome_curto'>): string {
  return (parte.nome_curto?.trim() || parte.razao_social).trim();
}
