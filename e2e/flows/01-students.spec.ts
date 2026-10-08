import { test, expect } from '@playwright/test';
import { QA_STUDENT } from '../helpers/env';
import { qaName, readState, writeState } from '../helpers/state';
import { Api } from '../helpers/api';
import { answerYes, chooseSex, field, fillField, action, studentIdFromUrl } from '../helpers/ui';

test.describe.serial('Alunos', () => {
  test('cadastra aluna com anamnese e aparece na lista com LGPD pendente', async ({ page }) => {
    await page.goto('/app/alunos/novo');

    await fillField(page, /nome/i, 'name', qaName());
    await fillField(page, /nascimento/i, 'birthDate', QA_STUDENT.birth_date);
    await chooseSex(page, 'Feminino');
    await fillField(page, /altura/i, 'heightCm', String(QA_STUDENT.height_cm));
    await fillField(page, /objetivo/i, 'goal', QA_STUDENT.goal);
    await fillField(page, /whatsapp|telefone/i, 'phoneNumber', QA_STUDENT.phone_number);
    await answerYes(page, /dores? (nas |)articula/i, 'jointPain');

    await page.getByRole('button', { name: /salvar (aluno|cadastro)/i }).click();

    await expect(page).toHaveURL(/\/app\/alunos\/[0-9a-f-]{36}$/, { timeout: 20_000 });
    const id = studentIdFromUrl(page.url())!;
    writeState({ studentId: id });

    await expect(page.getByRole('heading', { level: 1 })).toContainText(qaName());
    await expect(page.getByText(/dor articular/i).first()).toBeVisible();

    await page.goto('/app/alunos');
    const row = page.getByRole('row', { name: new RegExp(qaName()) }).first();
    await expect(row).toBeVisible();
    await expect(row).toContainText(/pendente/i);
  });

  test('abre o perfil e edita a altura (161) e volta para 160', async ({ page }) => {
    const id = readState().studentId ?? (await (await Api.login()).ensureQaStudent()).id;
    writeState({ studentId: id });

    await page.goto(`/app/alunos/${id}`);
    await expect(page.getByRole('heading', { level: 1 })).toContainText(qaName());
    await expect(page.getByText(/160\s?cm/).first()).toBeVisible();

    await action(page, /^editar( cadastro)?$/i).click();
    await expect(page).toHaveURL(/\/editar$/);
    // espera o prefill (senão o patchValue sobrescreve o que digitamos)
    await expect(field(page, /nome/i, 'name')).toHaveValue(qaName());
    const altura = await fillField(page, /altura/i, 'heightCm', '161');
    await expect(altura).toHaveValue('161');
    await page.getByRole('button', { name: /salvar/i }).click();
    await expect(page).toHaveURL(new RegExp(`/alunos/${id}$`), { timeout: 20_000 });
    await expect(page.getByText(/161\s?cm/).first()).toBeVisible();

    // Mantém a altura conhecida (IMC esperado no relatório depende dela).
    await page.goto(`/app/alunos/${id}/editar`);
    await expect(field(page, /altura/i, 'heightCm')).toHaveValue('161');
    await fillField(page, /altura/i, 'heightCm', '160');
    await page.getByRole('button', { name: /salvar/i }).click();
    await expect(page).toHaveURL(new RegExp(`/alunos/${id}$`), { timeout: 20_000 });
    await expect(page.getByText(/160\s?cm/).first()).toBeVisible();
  });

  test('tema: Escuro / Claro / Auto persistem', async ({ page }) => {
    await page.goto('/app/');
    const html = page.locator('html');

    const openConta = async () => {
      const menu = page.getByRole('radiogroup', { name: /tema/i });
      if (!(await menu.isVisible().catch(() => false))) {
        await page.getByRole('button', { name: /^conta$/i }).click();
      }
      await expect(menu).toBeVisible();
      return menu;
    };

    let menu = await openConta();
    await menu.getByRole('radio', { name: /^escuro$/i }).click();
    await expect(html).toHaveAttribute('data-theme', 'dark');

    await page.reload();
    await expect(html).toHaveAttribute('data-theme', 'dark');

    menu = await openConta();
    await menu.getByRole('radio', { name: /^claro$/i }).click();
    await expect(html).toHaveAttribute('data-theme', 'light');
    await page.reload();
    await expect(html).toHaveAttribute('data-theme', 'light');

    menu = await openConta();
    await menu.getByRole('radio', { name: /^auto$/i }).click();
    await expect(html).not.toHaveAttribute('data-theme', /.+/);
    await page.reload();
    await expect(html).not.toHaveAttribute('data-theme', /.+/);
  });
});
