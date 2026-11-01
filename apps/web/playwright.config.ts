import { defineConfig, devices } from '@playwright/test';

/**
 * E2E (SPEC-contratos §13). Roda contra um ambiente REAL (homologação) com
 * dados fictícios e IA simulada no servidor (BID_IA_MOCK=1). Sem as variáveis
 * abaixo os testes são pulados — nunca rodam contra produção por acidente.
 *
 *   E2E_BASE_URL         https://homolog.exemplo.app
 *   E2E_EMAIL / E2E_SENHA            usuário colaborador/dono (monta e envia)
 *   E2E_GESTOR_EMAIL / E2E_GESTOR_SENHA  gestor da obra (aprova e emite)
 *   E2E_LEGADO_CONTRATO_ID           id de um contrato legado (modelo_id nulo)
 */
export default defineConfig({
  testDir: './e2e',
  timeout: 120_000,
  retries: 0,
  reporter: [['list']],
  use: {
    baseURL: process.env.E2E_BASE_URL ?? 'http://localhost:5173',
    ...devices['iPhone 13'],
    locale: 'pt-BR',
    trace: 'retain-on-failure',
  },
});
