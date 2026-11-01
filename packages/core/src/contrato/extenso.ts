/**
 * Valor em reais por extenso (pt-BR), para o quadro-resumo e o fecho do
 * contrato: 312.450,00 → "trezentos e doze mil, quatrocentos e cinquenta reais".
 * Portado do motor de referência (docs/contratos/ref). Até 999 bilhões.
 */
const UNIDADES = ['', 'um', 'dois', 'três', 'quatro', 'cinco', 'seis', 'sete', 'oito', 'nove', 'dez', 'onze', 'doze', 'treze', 'quatorze', 'quinze', 'dezesseis', 'dezessete', 'dezoito', 'dezenove'];
const DEZENAS = ['', '', 'vinte', 'trinta', 'quarenta', 'cinquenta', 'sessenta', 'setenta', 'oitenta', 'noventa'];
const CENTENAS = ['', 'cento', 'duzentos', 'trezentos', 'quatrocentos', 'quinhentos', 'seiscentos', 'setecentos', 'oitocentos', 'novecentos'];
const ESCALAS: [string, string][] = [
  ['', ''],
  ['mil', 'mil'],
  ['milhão', 'milhões'],
  ['bilhão', 'bilhões'],
];

/** 1–999 por extenso. */
function ateCentenas(n: number): string {
  if (n === 100) return 'cem';
  const c = Math.floor(n / 100);
  const resto = n % 100;
  const partes: string[] = [];
  if (c) partes.push(CENTENAS[c]!);
  if (resto) {
    if (resto < 20) partes.push(UNIDADES[resto]!);
    else {
      const d = Math.floor(resto / 10);
      const u = resto % 10;
      partes.push(u ? `${DEZENAS[d]} e ${UNIDADES[u]}` : DEZENAS[d]!);
    }
  }
  return partes.join(' e ');
}

/** Inteiro ≥ 0 por extenso (sem a moeda). */
export function inteiroExtenso(n: number): string {
  if (!Number.isFinite(n) || n < 0) return '';
  if (n === 0) return 'zero';
  const grupos: number[] = [];
  let x = Math.floor(n);
  while (x > 0) {
    grupos.push(x % 1000);
    x = Math.floor(x / 1000);
  }
  const pecas: string[] = [];
  for (let i = grupos.length - 1; i >= 0; i--) {
    const g = grupos[i]!;
    if (!g) continue;
    const [sing, plur] = ESCALAS[i] ?? ['', ''];
    let texto: string;
    if (i === 1) texto = g === 1 ? 'mil' : `${ateCentenas(g)} mil`;
    else if (i > 1) texto = `${ateCentenas(g)} ${g === 1 ? sing : plur}`;
    else texto = ateCentenas(g);
    pecas.push(texto);
  }
  // Ligação: ", " entre grupos; " e " antes do último quando ele é < 100 ou
  // centena redonda ("mil e cem", "dois milhões e mil", "trezentos e doze mil, quatrocentos e cinquenta").
  if (pecas.length === 1) return pecas[0]!;
  const ultimoNaoNulo = grupos[0] ? grupos[0] : grupos.find((g) => g > 0) ?? 0;
  const liga = ultimoNaoNulo < 100 || ultimoNaoNulo % 100 === 0 ? ' e ' : ', ';
  return pecas.slice(0, -1).join(', ') + liga + pecas[pecas.length - 1];
}

/**
 * Valor monetário por extenso. 1 → "um real"; 1.000.000 → "um milhão de reais";
 * 0,01 → "um centavo"; 2.001.001,10 → "dois milhões, mil e um reais e dez centavos".
 */
export function valorExtenso(valor: number): string {
  if (!Number.isFinite(valor) || valor < 0) return '';
  const cents = Math.round(valor * 100);
  const reais = Math.floor(cents / 100);
  const centavos = cents % 100;
  const partes: string[] = [];
  if (reais > 0) {
    const txt = inteiroExtenso(reais);
    const milhaoRedondo = reais >= 1_000_000 && reais % 1_000_000 === 0;
    partes.push(`${txt} ${milhaoRedondo ? 'de ' : ''}${reais === 1 ? 'real' : 'reais'}`);
  }
  if (centavos > 0) partes.push(`${inteiroExtenso(centavos)} ${centavos === 1 ? 'centavo' : 'centavos'}`);
  if (!partes.length) return 'zero reais';
  return partes.join(' e ');
}
