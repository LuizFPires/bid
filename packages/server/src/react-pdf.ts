/**
 * Carrega react e @react-pdf/renderer sob demanda (são pesados e só o PDF usa).
 * Se a carga falhar no servidor, o erro diz QUAL módulo falhou e por quê — sem
 * isso a função cai num 500 mudo da plataforma, sem log acessível.
 */
type ReactPdf = typeof import('@react-pdf/renderer');
type Pecas = Pick<ReactPdf, 'Document' | 'Page' | 'StyleSheet' | 'Text' | 'View' | 'Font' | 'renderToBuffer'>;
export async function carregarReactPdf(): Promise<{ h: typeof import('react').createElement } & Pecas> {
  let react: typeof import('react');
  try {
    react = await import('react');
  } catch (e) {
    throw new Error(`carregar react: ${primeiraLinha(e)}`);
  }
  try {
    const { Document, Page, StyleSheet, Text, View, Font, renderToBuffer } = await import('@react-pdf/renderer');
    return { h: react.createElement, Document, Page, StyleSheet, Text, View, Font, renderToBuffer };
  } catch (e) {
    throw new Error(`carregar @react-pdf/renderer: ${primeiraLinha(e)}`);
  }
}

function primeiraLinha(e: unknown): string {
  return String((e as Error)?.message ?? e).split('\n')[0] ?? '';
}
