import { test, expect } from '@playwright/test';
import { readState, writeState } from '../helpers/state';
import { Api } from '../helpers/api';

test('assina o termo LGPD no canvas e o perfil mostra assinado', async ({ page }) => {
  const api = await Api.login();
  const studentId = readState().studentId ?? (await api.ensureQaStudent()).id;
  writeState({ studentId });
  test.skip((await api.getStudent(studentId)).lgpd_consent_status === 'ACCEPTED', 'termo já assinado nesta rodada');

  await page.goto(`/app/alunos/${studentId}/lgpd`);
  const canvas = page.locator('canvas').first();
  await expect(canvas).toBeVisible();

  // "role até o fim": rola todo contêiner rolável (termo) até o final
  await page.evaluate(() => {
    document.querySelectorAll<HTMLElement>('*').forEach(el => {
      if (el.scrollHeight > el.clientHeight + 4 && getComputedStyle(el).overflowY !== 'visible') el.scrollTop = el.scrollHeight;
    });
  });

  // assinatura com o mouse (o canvas fica abaixo da dobra: rola até ele antes)
  await canvas.scrollIntoViewIfNeeded();
  const box = (await canvas.boundingBox())!;
  const x0 = box.x + box.width * 0.2, y0 = box.y + box.height * 0.6;
  await page.mouse.move(x0, y0);
  await page.mouse.down();
  for (let i = 1; i <= 12; i++) {
    await page.mouse.move(x0 + i * (box.width * 0.05), y0 + Math.sin(i) * box.height * 0.2, { steps: 3 });
  }
  await page.mouse.up();

  const cb = page.getByRole('checkbox');
  if (await cb.count()) await cb.first().check();

  await page.getByRole('button', { name: /confirmar assinatura/i }).click();

  await expect(page).toHaveURL(new RegExp(`/alunos/${studentId}$`), { timeout: 20_000 });
  await expect(page.getByText(/lgpd assinado|consentimento assinado|termo (já )?assinado|assinado em/i).first()).toBeVisible();
  await expect(page.getByText(/aceite pendente|lgpd pendente/i)).toHaveCount(0);

  await expect.poll(async () => (await api.getStudent(studentId)).lgpd_consent_status).toBe('ACCEPTED');

  await page.goto('/app/alunos');
  await expect(page.getByRole('row', { name: new RegExp(studentId.length ? 'QA Teste E2E' : '') }).first()).toContainText(/assinado/i);
});
