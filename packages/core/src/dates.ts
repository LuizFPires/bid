/** Datas em pt-BR, com nomes fixos (independe do ICU da plataforma). */

const DIAS_ABREV = ['dom', 'seg', 'ter', 'qua', 'qui', 'sex', 'sáb'] as const;
const DIAS_CHEIO = [
  'domingo',
  'segunda',
  'terça',
  'quarta',
  'quinta',
  'sexta',
  'sábado',
] as const;

function toDate(d: Date | string): Date {
  return typeof d === 'string' ? new Date(d) : d;
}

function pad(n: number): string {
  return n < 10 ? `0${n}` : String(n);
}

/** "qua 21/10" — dia da semana abreviado + dd/mm. */
export function formatShort(d: Date | string): string {
  const date = toDate(d);
  return `${DIAS_ABREV[date.getDay()]} ${pad(date.getDate())}/${pad(date.getMonth() + 1)}`;
}

/** "quinta, 03/12/2026" — dia da semana por extenso + dd/mm/aaaa. */
export function formatFull(d: Date | string): string {
  const date = toDate(d);
  return `${DIAS_CHEIO[date.getDay()]}, ${pad(date.getDate())}/${pad(date.getMonth() + 1)}/${date.getFullYear()}`;
}

/** "21/10/2026" — data numérica simples. */
export function formatNumeric(d: Date | string): string {
  const date = toDate(d);
  return `${pad(date.getDate())}/${pad(date.getMonth() + 1)}/${date.getFullYear()}`;
}
