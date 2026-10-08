import { test, expect } from '@playwright/test';
import { statSync } from 'node:fs';
import { readState, writeState } from '../helpers/state';
import { Api } from '../helpers/api';
import { action, field } from '../helpers/ui';

test.describe.serial('Relatório', () => {
  let studentId: string;
  let assessmentId: string;

  test.beforeAll(async () => {
    const api = await Api.login();
    studentId = readState().studentId ?? (await api.ensureQaStudent()).id;
    const st = readState();
    assessmentId = st.assessment2Id ?? st.assessment1Id ?? (await api.getStudent(studentId)).avaliacoes[0]?.id;
    writeState({ studentId });
  });

  test.beforeEach(async () => {
    test.skip(!assessmentId, 'sem avaliação do aluno QA (03-assessment falhou?)');
  });

  test('Exportar PDF baixa Avaliacao_Fisica_*.pdf com mais de 20 KB', async ({ page }) => {
    await page.goto(`/app/alunos/${studentId}/avaliacoes/${assessmentId}`);
    const btn = action(page, /exportar pdf|^pdf$/i);
    await expect(btn).toBeVisible();

    const [download] = await Promise.all([
      page.waitForEvent('download', { timeout: 60_000 }),
      btn.click(),
    ]);
    const name = download.suggestedFilename();
    expect(name).toMatch(/^Avaliacao_Fisica_/);
    expect(name).toMatch(/\.pdf$/);
    const file = await download.path();
    expect(file).toBeTruthy();
    const size = statSync(file!).size;
    expect(size, `PDF com ${size} bytes`).toBeGreaterThan(20 * 1024);
  });

  test('salvar observações mostra confirmação e persiste', async ({ page }) => {
    await page.goto(`/app/alunos/${studentId}/avaliacoes/${assessmentId}`);
    const obs = field(page, /observaç/i).or(page.locator('textarea')).first();
    await expect(obs).toBeVisible();
    const text = `Observação QA ${Date.now()}`;
    await obs.fill(text);
    await page.getByRole('button', { name: /salvar observaç/i }).click();
    await expect(page.getByText(/observações salvas|salvo às|salvas?\b/i).first()).toBeVisible();

    await page.reload();
    await expect(field(page, /observaç/i).or(page.locator('textarea')).first()).toHaveValue(text);
  });
});
