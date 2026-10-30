import type { ReactNode } from 'react';
import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom';
import { QueryClientProvider } from '@tanstack/react-query';
import { queryClient } from './lib/queryClient';
import { AuthProvider, useAuth } from './auth/AuthProvider';
import { LoginScreen } from './auth/LoginScreen';
import { NovaSenhaScreen } from './auth/NovaSenhaScreen';
import { AppShell } from './app/AppShell';
import {
  PropostasScreen,
  EqualizacoesScreen,
  ContratosScreen,
  ObrasScreen,
  ObraScreen,
  NovaObraScreen,
  NovaPropostaScreen,
  PropostaScreen,
  IniciarEqualizacaoScreen,
  EqualizacaoScreen,
  NovoContratoScreen,
  ContratoScreen,
  EquipeScreen,
} from './screens';
import { SignScreen } from './screens/Sign';

/** Exige sessão para o app; a página pública de assinatura fica fora disto. */
function RequireAuth({ children }: { children: ReactNode }) {
  const { session, loading, configured } = useAuth();
  if (loading) {
    return (
      <div className="stage">
        <div className="device">
          <div className="content" style={{ display: 'grid', placeItems: 'center' }}>
            <span className="thinking" aria-label="Carregando">
              <i />
              <i />
              <i />
            </span>
          </div>
        </div>
      </div>
    );
  }
  if (!configured || !session) return <LoginScreen />;
  return <>{children}</>;
}

/** Durante a redefinição de senha, mostra a tela de nova senha sobre tudo. */
function Conteudo() {
  const { recovering } = useAuth();
  if (recovering) return <NovaSenhaScreen />;
  return (
    <Routes>
      {/* Pública: assinatura por link (sem login). */}
      <Route path="/sign/:token" element={<SignScreen />} />

      <Route
        element={
          <RequireAuth>
            <AppShell />
          </RequireAuth>
        }
      >
        <Route index element={<Navigate to="/propostas" replace />} />
        <Route path="propostas" element={<PropostasScreen />} />
        <Route path="propostas/nova" element={<NovaPropostaScreen />} />
        <Route path="propostas/:id" element={<PropostaScreen />} />
        <Route path="equalizacoes" element={<EqualizacoesScreen />} />
        <Route path="equalizacoes/nova" element={<IniciarEqualizacaoScreen />} />
        <Route path="equalizacoes/:id" element={<EqualizacaoScreen />} />
        <Route path="contratos" element={<ContratosScreen />} />
        <Route path="contratos/nova" element={<NovoContratoScreen />} />
        <Route path="contratos/:id" element={<ContratoScreen />} />
        <Route path="obras" element={<ObrasScreen />} />
        <Route path="obras/nova" element={<NovaObraScreen />} />
        <Route path="obras/:id" element={<ObraScreen />} />
        <Route path="equipe" element={<EquipeScreen />} />
        <Route path="*" element={<Navigate to="/propostas" replace />} />
      </Route>
    </Routes>
  );
}

export function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        <BrowserRouter>
          <Conteudo />
        </BrowserRouter>
      </AuthProvider>
    </QueryClientProvider>
  );
}
