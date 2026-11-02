import { Component, type ErrorInfo, type ReactNode } from 'react';
import { Button, Icon } from '@bid/ui';

interface Props {
  children: ReactNode;
  /** Chamado ao clicar em "Voltar ao início" (padrão: recarrega em /propostas). */
  onInicio?: () => void;
}

interface State {
  erro: Error | null;
}

/**
 * Limite de erro de renderização. Sem isto, qualquer exceção durante o render
 * desmonta a árvore inteira do React e o app vira uma tela em branco/preta,
 * sem mensagem e sem saída. Aqui a casca (marca, abas) continua de pé e a
 * pessoa vê o que aconteceu, com "Tentar de novo" e "Voltar ao início".
 *
 * Use com `key={location.pathname}` para o limite se rearmar ao trocar de tela.
 */
export class ErrorBoundary extends Component<Props, State> {
  override state: State = { erro: null };

  static getDerivedStateFromError(erro: Error): State {
    return { erro };
  }

  override componentDidCatch(erro: Error, info: ErrorInfo) {
    // Diagnóstico no console (o usuário vê a mensagem amigável abaixo).
    console.error('[bid] erro de renderização:', erro, info.componentStack);
  }

  private tentarDeNovo = () => this.setState({ erro: null });

  private inicio = () => {
    if (this.props.onInicio) return this.props.onInicio();
    window.location.assign('/propostas');
  };

  override render() {
    const { erro } = this.state;
    if (!erro) return this.props.children;
    return (
      <div className="card" role="alert" style={{ marginTop: 16, display: 'grid', gap: 12 }}>
        <div className="banner warn" style={{ margin: 0 }}>
          <Icon name="alert" />
          <span>Algo deu errado ao mostrar esta tela.</span>
        </div>
        <p className="lead" style={{ margin: 0, fontSize: 12 }}>
          Nada foi perdido. Tente de novo ou volte ao início. Se continuar, feche e reabra o app.
        </p>
        <p className="lead" style={{ margin: 0, fontSize: 11, color: 'var(--faint)', wordBreak: 'break-word' }}>
          Detalhe técnico: {erro.message || String(erro)}
        </p>
        <div className="pair">
          <Button type="button" variant="ghost" onClick={this.inicio}>
            Voltar ao início
          </Button>
          <Button type="button" icon="arrow" onClick={this.tentarDeNovo}>
            Tentar de novo
          </Button>
        </div>
      </div>
    );
  }
}
