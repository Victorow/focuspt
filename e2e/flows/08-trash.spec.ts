import { test, expect } from '@playwright/test';

import { qaName, readState, writeState } from '../helpers/state';
import { Api } from '../helpers/api';
import { confirmDialog } from '../helpers/ui';

test('lixeira: mover, listar na Lixeira e restaurar', async ({ page }) => {
  const api = await Api.login();
  const studentId = readState().studentId ?? (await api.ensureQaStudent()).id;
  writeState({ studentId });

  await page.goto('/app/alunos');
  const row = page.getByRole('row', { name: new RegExp(qaName()) }).first();
  await expect(row).toBeVisible();
  await row.getByRole('button', { name: /excluir|lixeira|remover/i }).first().click();
  await confirmDialog(page, /mover para a lixeira|^excluir$/i);

  await expect(page.getByRole('row', { name: new RegExp(qaName()) })).toHaveCount(0);
  await expect.poll(async () => (await api.listTrash()).some(s => s.id === studentId)).toBe(true);

  const trashBtn = page.getByRole('button', { name: /lixeira/i }).first();
  await trashBtn.click();
  const trash = page.locator('section').filter({ has: page.getByText(/^lixeira$/i) }).first();
  await expect(trash.getByText(qaName()).first()).toBeVisible();
  await trash.getByRole('button', { name: /restaurar/i }).first().click();

  await expect(page.getByRole('row', { name: new RegExp(qaName()) }).first()).toBeVisible();
  await expect.poll(async () => (await api.listStudents()).some(s => s.id === studentId)).toBe(true);
  // A exclusão final (soft) é feita no teardown global.
});
