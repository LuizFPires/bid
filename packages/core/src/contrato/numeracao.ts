/** Número do contrato na emissão (RC-11): `CT-AAAA-NNN`, sequencial por organização e ano. */
export function formatarNumeroContrato(ano: number, n: number): string {
  if (!Number.isInteger(ano) || !Number.isInteger(n) || n < 1) throw new Error('número de contrato inválido');
  return `CT-${ano}-${String(n).padStart(3, '0')}`;
}

export function parseNumeroContrato(s: string): { ano: number; n: number } | null {
  const m = /^CT-(\d{4})-(\d{3,})$/.exec(s.trim());
  return m ? { ano: Number(m[1]), n: Number(m[2]) } : null;
}
