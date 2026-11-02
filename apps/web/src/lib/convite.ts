/** Texto que o dono/gestor manda para quem foi convidado (WhatsApp, e-mail…). */
export function textoAvisoConvite(input: { obraNome: string; email: string; url?: string }): string {
  const url = input.url ?? (typeof window !== 'undefined' ? window.location.origin : '');
  return (
    `Você foi convidado(a) para a obra "${input.obraNome}" no bid.\n` +
    `Entre em ${url} com o e-mail ${input.email} (se ainda não tem conta, crie uma com esse e-mail) ` +
    `e aceite o convite em Perfil › Convites.`
  );
}

/**
 * Compartilha o aviso: folha nativa do celular (Web Share) quando existe;
 * senão abre o WhatsApp com o texto pronto. Devolve como foi enviado.
 */
export async function avisarConvite(input: { obraNome: string; email: string }): Promise<'share' | 'whatsapp'> {
  const texto = textoAvisoConvite(input);
  if (typeof navigator !== 'undefined' && typeof navigator.share === 'function') {
    try {
      await navigator.share({ text: texto });
      return 'share';
    } catch (e) {
      // Cancelou a folha nativa: não cai para o WhatsApp.
      if (e instanceof Error && e.name === 'AbortError') throw e;
    }
  }
  window.open(`https://wa.me/?text=${encodeURIComponent(texto)}`, '_blank', 'noopener');
  return 'whatsapp';
}
