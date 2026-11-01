import { expect, test, type Page } from '@playwright/test';
import { ENV, entrar, sair, semAmbiente } from './apoio';

/**
 * Fluxo feliz do contrato v2 (SPEC-contratos §13), com dados fictícios e IA
 * simulada no servidor (BID_IA_MOCK=1): vencedora → assistente (dossiê, partes,
 * quadro, planilha, condições, minuta) → revisão IA → enviar → aprovar (gestor)
 * → emitir → baixar → assinar 3 partes (link + app). Pré-requisitos no ambiente:
 * org com modelo 1.0 ativo, obra com contratante/construtora e fornecedor
 * cadastrado com o nome da vencedora fictícia, certame adjudicado com vencedora.
 */
test.describe.serial('contrato v2 — fluxo feliz', () => {
  test.skip(semAmbiente || !ENV.gestorEmail || !ENV.gestorSenha, 'sem ambiente de homologação');
  let urlContrato = '';

  async function etapa(page: Page, nome: RegExp) {
    await page.getByRole('tab', { name: nome }).click();
  }

  test('colaborador monta o contrato e envia para validação', async ({ page }) => {
    await entrar(page, ENV.email!, ENV.senha!);
    await page.goto('/contratos/nova');
    await page.getByRole('button').filter({ hasText: /fundações exemplo/i }).first().click();
    await expect(page.getByText(/minuta padrão/i)).toBeVisible({ timeout: 60_000 });
    urlContrato = page.url();

    // 1 Dossiê montado
    await expect(page.getByRole('heading', { name: /dossiê da vencedora/i })).toBeVisible({ timeout: 60_000 });
    // 2 Partes (3 de 3) e 3 Quadro
    await etapa(page, /partes/i);
    await expect(page.getByText(/3 de 3/)).toBeVisible();
    await etapa(page, /quadro/i);
    for (const campo of ['Início e mobilização', 'Documentos técnicos vinculantes', 'Seguros e garantias financeiras']) {
      const input = page.getByLabel(new RegExp(campo, 'i'));
      if ((await input.count()) && !(await input.first().inputValue())) await input.first().fill(campo === 'Início e mobilização' ? '10/11/2026' : 'Conforme proposta fictícia.');
    }
    const salvarQuadro = page.getByRole('button', { name: /salvar quadro/i });
    if (await salvarQuadro.isEnabled()) await salvarQuadro.click();
    // 4 Planilha (já semeada da proposta) e 5 Condições
    await etapa(page, /planilha/i);
    await expect(page.getByText(/soma/i)).toBeVisible();
    await etapa(page, /condições/i);
    await page.getByRole('button', { name: /salvar condições/i }).click();
    // 6 Minuta: tudo no padrão
    await etapa(page, /minuta/i);
    await expect(page.getByText(/tudo no padrão|itens? alterados?/i)).toBeVisible();
    // 7 Revisão IA (mock) e envio
    await etapa(page, /revisão ia/i);
    await page.getByRole('button', { name: /revisar com ia/i }).click();
    await expect(page.getByText(/revisão concluída/i)).toBeVisible({ timeout: 120_000 });
    // achado alto simulado (prazo): aceitar com justificativa, se houver
    const aceitar = page.getByRole('button', { name: /aceitar com justificativa/i }).first();
    if (await aceitar.isVisible()) {
      await aceitar.click();
      await page.getByLabel(/por que o contrato fica assim/i).fill('Prazo renegociado com o fornecedor em reunião.');
      await page.getByRole('button', { name: /^aceitar$/i }).click();
    }
    await page.getByRole('button', { name: /enviar para validação/i }).click();
    await expect(page.getByText(/enviado para validação/i)).toBeVisible({ timeout: 60_000 });
    await sair(page);
  });

  test('gestor aprova, emite, envia links e coleta no app', async ({ page }) => {
    await entrar(page, ENV.gestorEmail!, ENV.gestorSenha!);
    await page.goto(urlContrato);
    await expect(page.getByText(/aguardando validação/i)).toBeVisible();
    for (const cb of await page.getByRole('checkbox').all()) if (!(await cb.isChecked())) await cb.check();
    await page.getByRole('button', { name: /^aprovar$/i }).click();
    await expect(page.getByText(/contrato aprovado/i)).toBeVisible({ timeout: 60_000 });
    await page.getByRole('button', { name: /emitir contrato/i }).click();
    await expect(page.getByText(/CT-\d{4}-\d{3}/)).toBeVisible({ timeout: 120_000 });
    // download
    const [popup] = await Promise.all([page.waitForEvent('popup'), page.getByRole('button', { name: /baixar pdf/i }).click()]);
    expect(popup.url()).toMatch(/supabase|storage|\.pdf/i);
    // 2 links (contratante e contratada) e 2 coletas no app (construtora, 2 diretores)
    const linhas = page.locator('.party');
    const n = await linhas.count();
    expect(n).toBeGreaterThanOrEqual(3);
    for (let i = 0; i < n; i++) {
      const linha = linhas.nth(i);
      const texto = (await linha.textContent()) ?? '';
      if (/construtora/i.test(texto)) {
        await linha.getByRole('button', { name: /coletar/i }).click();
        const canvas = page.locator('canvas').last();
        const box = await canvas.boundingBox();
        if (box) {
          await page.mouse.move(box.x + 20, box.y + 30);
          await page.mouse.down();
          await page.mouse.move(box.x + 120, box.y + 60, { steps: 10 });
          await page.mouse.up();
        }
        await page.getByRole('button', { name: /confirmar assinatura/i }).click();
        await expect(page.getByText(/assinatura registrada|assinado por todas/i)).toBeVisible({ timeout: 60_000 });
      } else {
        const [wa] = await Promise.all([page.waitForEvent('popup'), linha.getByRole('button', { name: /^link$|reenviar/i }).click()]);
        expect(wa.url()).toContain('wa.me');
        const token = /sign%2F([a-f0-9]+)/i.exec(wa.url())?.[1];
        await wa.close();
        expect(token).toBeTruthy();
        // assina pelo link numa aba anônima (sem login)
        const ctx = await page.context().browser()!.newContext();
        const externo = await ctx.newPage();
        await externo.goto(`${ENV.base}/sign/${token}`);
        await expect(externo.getByRole('heading', { name: /assinar documento/i })).toBeVisible();
        const canvas = externo.locator('canvas');
        const box = await canvas.boundingBox();
        if (box) {
          await externo.mouse.move(box.x + 20, box.y + 30);
          await externo.mouse.down();
          await externo.mouse.move(box.x + 120, box.y + 60, { steps: 10 });
          await externo.mouse.up();
        }
        await externo.getByRole('button', { name: /assinar documento/i }).click();
        await expect(externo.getByText(/assinatura concluída/i)).toBeVisible({ timeout: 60_000 });
        await ctx.close();
        await page.reload();
      }
    }
    await expect(page.getByText(/assinado por todas as partes/i)).toBeVisible({ timeout: 60_000 });
  });
});
