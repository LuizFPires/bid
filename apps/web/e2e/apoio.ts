import { expect, type Page } from '@playwright/test';

export const ENV = {
  base: process.env.E2E_BASE_URL,
  email: process.env.E2E_EMAIL,
  senha: process.env.E2E_SENHA,
  gestorEmail: process.env.E2E_GESTOR_EMAIL,
  gestorSenha: process.env.E2E_GESTOR_SENHA,
  legadoId: process.env.E2E_LEGADO_CONTRATO_ID,
};

export const semAmbiente = !ENV.base || !ENV.email || !ENV.senha;

/** Login pela tela do app (e-mail + senha). */
export async function entrar(page: Page, email: string, senha: string) {
  await page.goto('/');
  await page.getByLabel(/e-mail/i).fill(email);
  await page.getByLabel(/senha/i).fill(senha);
  await page.getByRole('button', { name: /entrar/i }).click();
  await expect(page.getByRole('tab', { name: /propostas/i }).or(page.getByRole('link', { name: /propostas/i }))).toBeVisible({ timeout: 30_000 });
}

export async function sair(page: Page) {
  await page.getByRole('button', { name: /perfil/i }).click();
  await page.getByRole('button', { name: /^sair$/i }).click();
}
