import type { ReactNode } from 'react';
import { Icon, type IconName } from '@bid/ui';

/**
 * Telas de M0 são esqueletos (empty states). O conteúdo real do acervo,
 * equalização, contratos e obras entra nos milestones M1+.
 */
function Screen({
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

export function PropostasScreen() {
  return (
    <Screen
      titulo="Propostas"
      lead="O acervo de propostas por categoria de serviço."
      icone="tab-propostas"
      vazio="Nenhuma proposta ainda. O cadastro com extração por IA chega no M2."
    />
  );
}

export function EqualizacoesScreen() {
  return (
    <Screen
      titulo="Equalizar"
      lead="Compare concorrentes no mesmo nível, com apoio de IA."
      icone="tab-equalizacoes"
      vazio="Nenhuma equalização ainda. A comparação lado a lado chega no M4."
    />
  );
}

export function ContratosScreen() {
  return (
    <Screen
      titulo="Contratos"
      lead="A proposta vencedora vira contrato, assinado digitalmente."
      icone="tab-contratos"
      vazio="Nenhum contrato ainda. A geração a partir da vencedora chega no M6."
    />
  );
}

export function ObrasScreen() {
  return (
    <Screen
      titulo="Obras"
      lead="Organize propostas e certames por obra."
      icone="tab-obras"
      vazio="Nenhuma obra ainda. O organizador por obra chega no M1."
    />
  );
}
