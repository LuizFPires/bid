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
  if (typeof d !== 'string') return d;
  // Data só-data ("YYYY-MM-DD", coluna `date` do Postgres): montar em horário
  // LOCAL. `new Date("2026-10-30")` seria meia-noite UTC e, no Brasil (UTC-3),
  // `getDate()` devolveria o dia anterior.
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(d);
  if (m) return new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
  return new Date(d);
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
