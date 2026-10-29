import { useId, useMemo, useRef, useState } from 'react';

function norm(s: string): string {
  return s
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .toLowerCase();
}

export interface AutocompleteProps {
  value: string;
  onChange: (v: string) => void;
  /** Sugestões (campo livre): o usuário pode escolher ou digitar algo novo. */
  options: readonly string[];
  label?: string;
  placeholder?: string;
  id?: string;
  limit?: number;
}

/**
 * Campo de texto livre com autocompletar. Mostra sugestões que casam (tolerante
 * a acento), mas aceita qualquer valor digitado — categoria/fornecedor/obra/local
 * são campos livres (não há cadastro fechado).
 */
export function Autocomplete({
  value,
  onChange,
  options,
  label,
  placeholder,
  id,
  limit = 8,
}: AutocompleteProps) {
  const autoId = useId();
  const fieldId = id ?? autoId;
  const listId = `${fieldId}-list`;
  const [aberto, setAberto] = useState(false);
  const blurTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const matches = useMemo(() => {
    const nq = norm(value.trim());
    const base = nq ? options.filter((o) => norm(o).includes(nq) && norm(o) !== nq) : options;
    return base.slice(0, limit);
  }, [options, value, limit]);

  function escolher(op: string) {
    onChange(op);
    setAberto(false);
  }

  return (
    <div className="field" style={{ position: 'relative', marginBottom: 14 }}>
      {label && <label htmlFor={fieldId}>{label}</label>}
      <input
        id={fieldId}
        type="text"
        role="combobox"
        aria-expanded={aberto && matches.length > 0}
        aria-controls={listId}
        aria-autocomplete="list"
        autoComplete="off"
        placeholder={placeholder}
        value={value}
        onChange={(e) => {
          onChange(e.target.value);
          setAberto(true);
        }}
        onFocus={() => setAberto(true)}
        onBlur={() => {
          blurTimer.current = setTimeout(() => setAberto(false), 120);
        }}
      />
      {aberto && matches.length > 0 && (
        <ul
          id={listId}
          role="listbox"
          style={{
            listStyle: 'none',
            margin: '6px 0 0',
            padding: 6,
            position: 'absolute',
            left: 0,
            right: 0,
            zIndex: 20,
            background: 'var(--surface)',
            border: '1px solid var(--line)',
            borderRadius: 12,
            boxShadow: 'var(--shadow)',
            maxHeight: 220,
            overflowY: 'auto',
          }}
        >
          {matches.map((op) => (
            <li key={op} id={`${listId}-${op}`} role="option" aria-selected={op === value}>
              <button
                type="button"
                onMouseDown={() => {
                  if (blurTimer.current) clearTimeout(blurTimer.current);
                }}
                onClick={() => escolher(op)}
                style={{
                  width: '100%',
                  minHeight: 44,
                  textAlign: 'left',
                  border: 0,
                  background: 'none',
                  padding: '11px 10px',
                  borderRadius: 9,
                  font: 'inherit',
                  fontWeight: 700,
                  fontSize: 14,
                  color: 'var(--ink)',
                }}
              >
                {op}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
