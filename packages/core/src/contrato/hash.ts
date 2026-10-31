/**
 * Hash do documento resolvido (regra 15/18): JSON canônico (chaves ordenadas,
 * sem `undefined`) + SHA-256 hex. Mesmo resultado no cliente (Web Crypto) e no
 * servidor (Node ≥ 20 tem `globalThis.crypto`).
 */
export function canonico(v: unknown): string {
  return JSON.stringify(ordenar(v));
}

function ordenar(v: unknown): unknown {
  if (Array.isArray(v)) return v.map(ordenar);
  if (v && typeof v === 'object') {
    const o = v as Record<string, unknown>;
    const out: Record<string, unknown> = {};
    for (const k of Object.keys(o).sort()) {
      if (o[k] !== undefined) out[k] = ordenar(o[k]);
    }
    return out;
  }
  return v;
}

export async function sha256Hex(texto: string): Promise<string> {
  const bytes = new TextEncoder().encode(texto);
  const digest = await globalThis.crypto.subtle.digest('SHA-256', bytes);
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

/** Hash do conteúdo do contrato: ignora `final` e campos efêmeros. */
export async function hashDocumento(doc: unknown): Promise<string> {
  const limpo = doc && typeof doc === 'object' ? Object.fromEntries(Object.entries(doc as Record<string, unknown>).filter(([k]) => k !== 'final' && !k.startsWith('_'))) : doc;
  return sha256Hex(canonico(limpo));
}
