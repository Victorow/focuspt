import { test, expect } from '@playwright/test';
import { credentials } from '../helpers/env';
import { readState } from '../helpers/state';
import { Api } from '../helpers/api';
import { expectNoHorizontalOverflow } from '../helpers/ui';

let studentId: string | undefined;
let assessmentId: string | undefined;

test.beforeAll(async () => {
  const api = await Api.login();
  studentId = (await api.ensureQaStudent()).id; // garante ativo (restaura da lixeira se preciso)
  const st = readState();
  assessmentId = st.assessment2Id ?? st.assessment1Id ?? (await api.getStudent(studentId)).avaliacoes[0]?.id;
});

test.describe('390×844 — sem rolagem horizontal', () => {
  test.describe('login (sem sessão)', () => {
    test.use({ storageState: { cookies: [], origins: [] } });

    test('tela de login e autenticação', async ({ page }) => {
      await page.goto('/app/login');
      await expect(page.getByLabel(/e-?mail/i)).toBeVisible();
      await expectNoHorizontalOverflow(page, 'login');

      const { email, password } = credentials();
      await page.getByLabel(/e-?mail/i).fill(email);
      await page.getByLabel(/^senha/i).fill(password);
      await page.getByRole('button', { name: /^entrar$/i }).click();
      await expect(page).toHaveURL(/\/app\/?$/, { timeout: 20_000 });
      await expectNoHorizontalOverflow(page, 'início após login');
    });
  });

  test('início', async ({ page }) => {
    await page.goto('/app/');
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
    await expectNoHorizontalOverflow(page, 'início');
  });

  test('lista de alunos', async ({ page }) => {
    await page.goto('/app/alunos');
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
    await expectNoHorizontalOverflow(page, 'alunos');
  });

  test('nova avaliação e modo "Medir" (um campo por vez), se existir', async ({ page }) => {
    test.skip(!studentId, 'sem aluno QA');
    await page.goto(`/app/alunos/${studentId}/avaliacoes/nova`);
    // No celular (≤719px) a tela abre direto no modo Medir (um campo por vez, sem h1).
    const oneField = page.locator('#mob-v').or(page.getByLabel(/^peso/i)).first();
    await expect(oneField.or(page.getByRole('heading', { level: 1 })).first()).toBeVisible();
    await expectNoHorizontalOverflow(page, 'nova avaliação');

    const medirMode = await page.locator('#mob-v').isVisible().catch(() => false);
    const medir = page.getByRole('link', { name: /^medir$/i }).or(page.getByRole('button', { name: /^medir$/i })).first();
    if (medirMode || (await medir.isVisible().catch(() => false))) {
      if (!medirMode) await medir.click();
      await page.waitForTimeout(300);
      await expectNoHorizontalOverflow(page, 'modo Medir');
      await page.locator('#mob-v').fill('49,2');
      const next = page.getByRole('button', { name: /^(próximo|avançar|continuar|seguinte)/i }).first();
      if (await next.isVisible().catch(() => false)) {
        await next.click();
        await expectNoHorizontalOverflow(page, 'modo Medir (2º campo)');
      }
    } else {
      test.info().annotations.push({ type: 'note', description: 'modo "Medir" não encontrado nesta build; só a tela padrão foi verificada' });
    }
  });

  test('perfil do aluno', async ({ page }) => {
    test.skip(!studentId, 'sem aluno QA');
    await page.goto(`/app/alunos/${studentId}`);
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
    await expectNoHorizontalOverflow(page, 'perfil');
  });

  test('relatório', async ({ page }) => {
    test.skip(!studentId || !assessmentId, 'sem avaliação do aluno QA');
    await page.goto(`/app/alunos/${studentId}/avaliacoes/${assessmentId}`);
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
    await expectNoHorizontalOverflow(page, 'relatório');
  });

  test('agenda', async ({ page }) => {
    await page.goto('/app/agenda');
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
    await expectNoHorizontalOverflow(page, 'agenda');
  });
});
