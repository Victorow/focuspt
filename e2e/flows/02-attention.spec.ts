import { test, expect } from '@playwright/test';

import { qaName, readState, writeState } from '../helpers/state';
import { Api } from '../helpers/api';

// Roda ANTES da assinatura LGPD (07-lgpd): o aluno ainda está pendente.
test('painel "Pedem atenção" lista o aluno em "Termo LGPD pendente"', async ({ page }) => {
  const api = await Api.login();
  const id = readState().studentId ?? (await api.ensureQaStudent()).id;
  writeState({ studentId: id });
  const detail = await api.getStudent(id);
  test.skip(detail.lgpd_consent_status === 'ACCEPTED', 'aluno QA já assinou o termo nesta rodada');

  await page.goto('/app/');
  const panel = page.locator('section').filter({ has: page.getByText(/^pedem atenção$/i) }).first();
  await expect(panel).toBeVisible();
  await expect(panel.getByText(/termo lgpd pendente/i).first()).toBeVisible();
  await expect(panel.getByRole('link', { name: new RegExp(qaName()) }).first()).toBeVisible();
  await expect(panel.getByRole('link', { name: /^assinar$/i }).first()).toHaveAttribute('href', new RegExp(`/alunos/${id}/lgpd$`));

  // KPI do painel reflete a pendência
  const kpi = page.locator('div, section').filter({ has: page.getByText(/^termo lgpd pendente$/i) }).first();
  await expect(kpi).toBeVisible();
});
