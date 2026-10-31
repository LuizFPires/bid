import type { AlertaExtraido } from '@bid/core';
import { Icon } from '@bid/ui';

const TITULO_PADRAO: Record<AlertaExtraido['tipo'], string> = {
  texto_oculto: 'Texto oculto no arquivo',
  inconsistencia: 'Inconsistência no documento',
  validade: 'Validade',
  outro: 'Atenção',
};

/**
 * Alertas que a IA levantou ao ler a proposta (texto oculto de versões
 * anteriores, soma que não fecha, validade curta…). Aparecem na conferência,
 * ficam gravados na versão e voltam no detalhe — não se perdem: são base de
 * negociação.
 */
export function AlertasLeitura({ alertas, compacto = false }: { alertas: AlertaExtraido[]; compacto?: boolean }) {
  if (!alertas || alertas.length === 0) return null;
  return (
    <div className="alertas-ia" role="alert">
      {alertas.map((a, i) => (
        <div key={i} className={`alerta-ia ${a.tipo} ${compacto ? 'compacto' : ''}`}>
          <Icon name="alert" />
          <div>
            <b>{a.titulo || TITULO_PADRAO[a.tipo]}</b>
            {a.texto && <span>{a.texto}</span>}
          </div>
        </div>
      ))}
    </div>
  );
}
