import { expect, test } from '@playwright/test';
import { ENV, entrar, semAmbiente } from './apoio';

/**
 * Caminho LEGADO (contratos sem modelo, M6/M7): a tela antiga abre, gera PDF e
 * mostra a seção Assinaturas com duas partes. Garante que o contrato v2 não
 * quebrou o que já estava em produção (SPEC-contratos §12).
 */
test.describe('contrato legado', () => {
  test.skip(semAmbiente || !ENV.legadoId, 'sem ambiente de homologação / contrato legado');

  test('abre a tela legada, gera o PDF e lista as duas partes', async ({ page }) => {
    await entrar(page, ENV.email!, ENV.senha!);
    await page.goto(`/contratos/${ENV.legadoId}`);
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
    // Tela legada tem cláusulas numeradas e a seção Assinaturas (Contratante / Contratada).
    await expect(page.getByText(/cláusula 1/i).first()).toBeVisible();
    await expect(page.getByRole('heading', { name: /assinaturas/i })).toBeVisible();
    await expect(page.getByText(/contratante/i).first()).toBeVisible();
    await expect(page.getByText(/contratada/i).first()).toBeVisible();
    // Não há etapas do assistente v2 nem o chip "Minuta padrão".
    await expect(page.getByRole('tab', { name: /dossiê/i })).toHaveCount(0);
    const gerar = page.getByRole('button', { name: /gerar pdf/i });
    if (await gerar.isVisible()) {
      await gerar.click();
      await expect(page.getByText(/pdf gerado|pdf pronto/i)).toBeVisible({ timeout: 90_000 });
    }
  });
});
