import { useEffect, useState } from 'react';
import { Icon } from '@bid/ui';

/**
 * Estado de espera da leitura por IA — "Scanner": um feixe varre o documento e
 * os campos vão acendendo (Fornecedor → Valor → Prazo → Pagamento → Garantia),
 * com texto de etapa trocando. Os ✓ são ILUSTRATIVOS (ritmo não é o real da IA);
 * o objetivo é comunicar o que está acontecendo e encurtar a espera percebida.
 */

const CAMPOS = ['Fornecedor', 'Valor', 'Prazo', 'Pagamento', 'Garantia'] as const;

const ETAPAS: readonly (readonly [string, string])[] = [
  ['Lendo a proposta…', 'Abrindo o PDF'],
  ['Encontrando o fornecedor…', 'Quem está propondo'],
  ['Lendo valores e prazos…', 'Total e dias de execução'],
  ['Conferindo pagamento e garantia…', 'Condições comerciais'],
  ['Quase lá…', 'Organizando tudo para você conferir'],
];

export function LeituraIA({ primeiraEtapa }: { primeiraEtapa?: string }) {
  const [i, setI] = useState(0);

  useEffect(() => {
    const id = setInterval(() => setI((v) => (v + 1) % ETAPAS.length), 2200);
    return () => clearInterval(id);
  }, []);

  const [titulo, sub] = ETAPAS[i] ?? ETAPAS[0]!;
  const t = i === 0 && primeiraEtapa ? primeiraEtapa : titulo;

  return (
    <div className="card ler" role="status" aria-live="polite">
      <div className="ler-wrap" aria-hidden="true">
        <div className="ler-sheet">
          <i />
          <i />
          <i />
          <i />
          <i />
          <i />
          <i />
          <div className="ler-beam" />
        </div>
        <div className="ler-chips">
          {CAMPOS.map((c) => (
            <span key={c} className="ler-chip">
              <Icon name="check" />
              {c}
            </span>
          ))}
        </div>
      </div>
      {/* key={i} reinicia a animação de fade a cada troca de etapa */}
      <div className="ler-status" key={i}>
        <div className="t">{t}</div>
        <div className="s">{sub}</div>
      </div>
    </div>
  );
}
