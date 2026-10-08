import { test, expect } from '@playwright/test';
import { ymd } from '../helpers/env';
import { readState, writeState } from '../helpers/state';
import { Api } from '../helpers/api';
import { makeJpeg } from '../helpers/image';
import { confirmDialog, expectToast, field } from '../helpers/ui';

test('galeria: envia foto Frente de hoje, aparece, e remove com confirmação', async ({ page, browser }) => {
  const api = await Api.login();
  const studentId = readState().studentId ?? (await api.ensureQaStudent()).id;
  writeState({ studentId });
  const before = (await api.getStudent(studentId)).fotos.length;

  const jpeg = await makeJpeg(browser, 300, 450);

  await page.goto(`/app/alunos/${studentId}/galeria`);
  await expect(page.getByRole('heading', { level: 1 })).toBeVisible();

  const category = field(page, /ângulo|angulo|categoria/i).or(page.locator('select')).first();
  if (await category.evaluate(el => el.tagName === 'SELECT').catch(() => false)) {
    await category.selectOption({ label: 'Frente' });
  } else {
    const radio = page.getByRole('radio', { name: /^frente$/i });
    if (await radio.count()) await radio.check();
    else await page.getByRole('button', { name: /^frente$/i }).first().click();
  }

  const date = field(page, /data (da )?foto/i).or(page.locator('input[type="date"]')).first();
  await date.fill(ymd());

  await page.locator('input[type="file"]').first().setInputFiles({ name: 'qa-frente.jpg', mimeType: 'image/jpeg', buffer: jpeg });

  await page.getByRole('button', { name: /salvar (na galeria|imagem)/i }).click();
  await expectToast(page, /foto (adicionada|salva)/i, 30_000);

  await expect.poll(async () => (await api.getStudent(studentId)).fotos.length, { timeout: 15_000 }).toBe(before + 1);
  const photos = (await api.getStudent(studentId)).fotos;
  const mine = photos.find(f => f.category === 'FRENTE' && f.date === ymd());
  expect(mine, 'foto FRENTE de hoje registrada').toBeTruthy();

  await page.reload();
  await expect(page.getByRole('heading', { level: 1 })).toBeVisible();

  // Sessões: abre a sessão de hoje ("Ver") se as fotos estiverem agrupadas
  const ver = page.getByRole('button', { name: /^ver$/i });
  if (await ver.count()) await ver.first().click();

  const thumb = page.locator('img[alt="Frente" i], img[src*="fotos-alunos"], img[src*="supabase.co"]').first();
  await expect(thumb).toBeVisible({ timeout: 15_000 });
  await expect(page.locator('span, td, figcaption, div').filter({ hasText: /^frente$/i }).last()).toBeVisible();

  // Remover: botão acessível no cartão da foto (ou ícone, no pior caso)
  const card = page.locator('[class*="thumb"], figure, li, div').filter({ has: thumb }).last();
  await card.hover();
  const del = card.getByRole('button', { name: /remover|excluir|apagar/i }).or(card.locator('button')).first();
  await del.click({ force: true });
  await confirmDialog(page, /^remover|^excluir/i);

  await expect.poll(async () => (await api.getStudent(studentId)).fotos.length, { timeout: 15_000 }).toBe(before);
});
