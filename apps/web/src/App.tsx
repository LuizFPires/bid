import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom';
import { QueryClientProvider } from '@tanstack/react-query';
import { queryClient } from './lib/queryClient';
import { AuthProvider, useAuth } from './auth/AuthProvider';
import { LoginScreen } from './auth/LoginScreen';
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
} from './screens';

function Gate() {
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

  // Sem Supabase (ou sem sessão), a porta de entrada é o login.
  if (!configured || !session) return <LoginScreen />;

  return (
    <Routes>
      <Route element={<AppShell />}>
        <Route index element={<Navigate to="/propostas" replace />} />
        <Route path="propostas" element={<PropostasScreen />} />
        <Route path="propostas/nova" element={<NovaPropostaScreen />} />
        <Route path="propostas/:id" element={<PropostaScreen />} />
        <Route path="equalizacoes" element={<EqualizacoesScreen />} />
        <Route path="contratos" element={<ContratosScreen />} />
        <Route path="obras" element={<ObrasScreen />} />
        <Route path="obras/nova" element={<NovaObraScreen />} />
        <Route path="obras/:id" element={<ObraScreen />} />
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
          <Gate />
        </BrowserRouter>
      </AuthProvider>
    </QueryClientProvider>
  );
}
