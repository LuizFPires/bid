import type { ReactNode } from 'react';
import { Icon, type IconName } from '@bid/ui';

export { PropostasScreen } from './Propostas';
export { ObrasScreen } from './Obras';
export { ObraScreen } from './Obra';
export { NovaObraScreen } from './NovaObra';

/** Telas ainda não implementadas (M4/M6) ficam como esqueleto. */
function Placeholder({
  titulo,
  lead,
  icone,
  vazio,
}: {
  titulo: string;
  lead: string;
  icone: IconName;
  vazio: ReactNode;
}) {
  return (
    <>
      <div className="page-head">
        <h1>{titulo}</h1>
        <p className="lead">{lead}</p>
      </div>
      <div className="card">
        <div className="empty">
          <div style={{ display: 'flex', justifyContent: 'center', marginBottom: 10 }}>
            <span className="ic" style={{ width: 48, height: 48, borderRadius: 14 }}>
              <Icon name={icone} style={{ width: 24, height: 24 }} />
            </span>
          </div>
          {vazio}
        </div>
      </div>
    </>
  );
}

export function EqualizacoesScreen() {
  return (
    <Placeholder
      titulo="Equalizar"
      lead="Compare concorrentes no mesmo nível, com apoio de IA."
      icone="tab-equalizacoes"
      vazio="Nenhuma equalização ainda. A comparação lado a lado chega no M4."
    />
  );
}

export function ContratosScreen() {
  return (
    <Placeholder
      titulo="Contratos"
      lead="A proposta vencedora vira contrato, assinado digitalmente."
      icone="tab-contratos"
      vazio="Nenhum contrato ainda. A geração a partir da vencedora chega no M6."
    />
  );
}
