import { useEffect, useRef, useState, type ReactNode } from 'react';

export interface MatrizColuna {
  id: string;
  titulo: ReactNode;
  sub?: ReactNode;
}

export interface MatrizLinha {
  rotulo: ReactNode;
  /** Uma célula por coluna, na mesma ordem de `colunas`. */
  celulas: ReactNode[];
  /** Linha de total (fundo e peso diferentes). */
  total?: boolean;
  /** Centraliza as células (selos ✓/✗, botões). */
  centro?: boolean;
}

/**
 * Matriz de equalização "faixa presa" (opção B aprovada): no celular, cada
 * critério vira uma FAIXA de rótulo acima das suas células, presa à borda
 * esquerda enquanto as células rolam — nunca se perde a referência e as
 * células usam toda a largura. O cabeçalho com os fornecedores fica preso no
 * topo. Em tela larga (celular deitado/desktop) vira a tabela clássica, com o
 * critério como primeira coluna e sem rolagem.
 */
export function Matriz({
  colunas,
  linhas,
  primeira = 'Critério',
  larguraCelula = 200,
}: {
  colunas: MatrizColuna[];
  linhas: MatrizLinha[];
  primeira?: string;
  larguraCelula?: number;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [largura, setLargura] = useState(0);

  // A faixa do rótulo precisa ter a largura VISÍVEL do quadro (não do conteúdo
  // rolável) para ficar presa cobrindo exatamente a tela.
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const medir = () => setLargura(el.clientWidth);
    medir();
    const ro = new ResizeObserver(medir);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const n = Math.max(1, colunas.length);
  return (
    <div
      ref={ref}
      className="mx"
      style={{ ['--mx-cols' as string]: n, ['--mx-cel' as string]: `${larguraCelula}px`, ['--mx-w' as string]: `${largura}px` }}
    >
      <div className="mx-in">
        <div className="mx-hdr">
          <div className="mx-hdr-lbl">{primeira}</div>
          {colunas.map((c) => (
            <div key={c.id} className="mx-th">
              <span className="nm">{c.titulo}</span>
              {c.sub && <span className="vz">{c.sub}</span>}
            </div>
          ))}
        </div>
        {linhas.map((l, i) => (
          <div key={i} className={`mx-grp ${l.total ? 'total' : ''}`}>
            <div className="mx-lbl">{l.rotulo}</div>
            <div className={`mx-cells ${l.centro ? 'centro' : ''}`}>
              {colunas.map((c, j) => (
                <div key={c.id} className="mx-td">
                  {l.celulas[j] ?? <span className="muted">—</span>}
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
