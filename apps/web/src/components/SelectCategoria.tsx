import { useId, useMemo, useState } from 'react';

const OUTRA = '__outra__';

/**
 * Categoria de serviço como LISTA das já cadastradas (sugestões da org) + opção
 * "Outra…" que abre um campo livre. Categoria continua campo livre (regra #4):
 * o select só expõe o que já existe para o usuário escolher sem redigitar — e
 * cair na mesma categoria das outras propostas na hora de equalizar.
 */
export function SelectCategoria({
  value,
  onChange,
  opcoes,
  label = 'Categoria de serviço',
}: {
  value: string;
  onChange: (v: string) => void;
  /** Categorias já usadas (sugestões), em ordem de uso. */
  opcoes: readonly string[];
  label?: string;
}) {
  const id = useId();
  const lista = useMemo(() => {
    const set = new Set<string>();
    if (value.trim()) set.add(value.trim());
    for (const o of opcoes) if (o.trim()) set.add(o.trim());
    return [...set];
  }, [opcoes, value]);
  // "Outra" fica ligado quando o usuário escolheu digitar (mesmo com texto vazio).
  const [outra, setOutra] = useState(false);
  const selecionado = outra ? OUTRA : lista.includes(value.trim()) ? value.trim() : OUTRA;

  return (
    <div className="field">
      <label htmlFor={id}>{label}</label>
      <select
        id={id}
        value={selecionado}
        onChange={(e) => {
          if (e.target.value === OUTRA) {
            setOutra(true);
            onChange('');
          } else {
            setOutra(false);
            onChange(e.target.value);
          }
        }}
      >
        {lista.map((c) => (
          <option key={c} value={c}>
            {c}
          </option>
        ))}
        <option value={OUTRA}>Outra categoria…</option>
      </select>
      {selecionado === OUTRA && (
        <input
          type="text"
          aria-label="Nova categoria"
          placeholder="Digite a nova categoria"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          autoFocus
          style={{ marginTop: 8 }}
        />
      )}
    </div>
  );
}
