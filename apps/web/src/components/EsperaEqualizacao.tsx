import { useEffect, useState } from 'react';
import { Icon } from '@bid/ui';

/**
 * Espera do relatório de equalização — "Mesma régua" (protótipo B aprovado).
 * A régua varre os critérios em ciclo: as barras deslizam para os valores
 * daquele critério, a linha dourada vira a referência e o texto explica o que
 * está sendo nivelado. Os VALORES são ilustrativos (o resultado só existe no
 * fim); os NOMES são os fornecedores reais da equalização.
 */

interface Lente {
  chip: string;
  referencia: string;
  /** Posição da linha de referência (0–1 da trilha). */
  pos: number;
  titulo: string;
  sub: string;
  /** Por barra: largura (0–1), rótulo e se está fora da referência. */
  barras: { w: number; rotulo: string; fora: boolean }[];
}

const LENTES: Lente[] = [
  {
    chip: 'Valor',
    referencia: 'Régua do projeto',
    pos: 0.88,
    titulo: 'Colocando todas na mesma régua…',
    sub: 'Quantidade do projeto × preço unitário de cada uma',
    barras: [
      { w: 0.62, rotulo: 'apresentado', fora: false },
      { w: 0.78, rotulo: 'apresentado', fora: false },
      { w: 1, rotulo: 'apresentado', fora: true },
    ],
  },
  {
    chip: 'Prazo',
    referencia: 'Menor prazo',
    pos: 0.42,
    titulo: 'Comparando prazos de execução…',
    sub: 'Dias corridos, do material à instalação',
    barras: [
      { w: 0.42, rotulo: 'dias', fora: false },
      { w: 0.42, rotulo: 'dias', fora: false },
      { w: 0.56, rotulo: 'dias', fora: true },
    ],
  },
  {
    chip: 'Escopo',
    referencia: 'Escopo completo',
    pos: 0.96,
    titulo: 'Conferindo o escopo item a item…',
    sub: 'O que está incluído, parcial ou faltando',
    barras: [
      { w: 0.96, rotulo: 'itens', fora: false },
      { w: 0.8, rotulo: 'itens', fora: true },
      { w: 0.64, rotulo: 'itens', fora: true },
    ],
  },
  {
    chip: 'Pagamento',
    referencia: 'Melhor condição',
    pos: 0.3,
    titulo: 'Nivelando as condições de pagamento…',
    sub: 'Sinal, parcelas e faturamento direto',
    barras: [
      { w: 0.3, rotulo: 'sinal', fora: false },
      { w: 0.3, rotulo: 'sinal', fora: false },
      { w: 0.6, rotulo: 'sinal', fora: true },
    ],
  },
  {
    chip: 'Garantia',
    referencia: 'Maior garantia',
    pos: 0.9,
    titulo: 'Comparando garantias…',
    sub: 'Meses, abrangência e o que fica de fora',
    barras: [
      { w: 0.9, rotulo: 'meses', fora: false },
      { w: 0.9, rotulo: 'meses', fora: false },
      { w: 0.2, rotulo: 'meses', fora: true },
    ],
  },
  {
    chip: 'Validade',
    referencia: 'Validade mais longa',
    pos: 0.7,
    titulo: 'Checando validade e omissões…',
    sub: 'Separando o que está escrito do que está implícito',
    barras: [
      { w: 0.7, rotulo: 'dias', fora: false },
      { w: 0.25, rotulo: 'dias', fora: true },
      { w: 0.5, rotulo: 'dias', fora: false },
    ],
  },
];

const INTERVALO_MS = 3500;

export function EsperaEqualizacao({ nomes }: { nomes: string[] }) {
  const [i, setI] = useState(0);
  useEffect(() => {
    const id = setInterval(() => setI((v) => (v + 1) % LENTES.length), INTERVALO_MS);
    return () => clearInterval(id);
  }, []);
  const l = LENTES[i]!;
  // Até 4 barras; com mais propostas, as demais ficam implícitas no texto.
  const linhas = nomes.slice(0, 4);

  return (
    <div className="card esp" role="status" aria-live="polite">
      <div className="esp-chips" aria-hidden="true">
        {LENTES.map((x, j) => (
          <span key={x.chip} className={j === i ? 'on' : undefined}>
            {x.chip}
          </span>
        ))}
      </div>

      <div className="esp-ref" aria-hidden="true">
        <i />
        <span key={l.referencia}>{l.referencia}</span>
      </div>

      <div className="esp-reg" aria-hidden="true">
        <div className="esp-linha" style={{ left: `calc(var(--nm) + (100% - var(--nm)) * ${l.pos})` }} />
        {linhas.map((nome, j) => {
          const b = l.barras[j % l.barras.length]!;
          return (
            <div key={nome + j} className="esp-row">
              <span className="esp-nm" title={nome}>
                {nome}
              </span>
              <span className="esp-trk">
                <span className={`esp-fill ${b.fora ? 'fora' : ''}`} style={{ width: `${b.w * 100}%` }} />
              </span>
            </div>
          );
        })}
      </div>

      <div className="ler-status" key={i}>
        <div className="t">{l.titulo}</div>
        <div className="s">{l.sub}</div>
      </div>
      <div className="esp-bar" aria-hidden="true">
        <i />
      </div>
      <p className="esp-hint">
        <Icon name="spark" /> Relatório completo em 1 a 2 minutos. Pode continuar navegando.
      </p>
    </div>
  );
}
