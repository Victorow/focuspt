import { test, expect, Page } from '@playwright/test';
import { ASSESSMENT_1, daysAgo, ymd } from '../helpers/env';
import { readState, writeState } from '../helpers/state';
import { Api } from '../helpers/api';
import { expectToast, fillField, revealField, field, rowText, action } from '../helpers/ui';

type Inputs = typeof ASSESSMENT_1;

// rótulo (novo design / antigo) → formcontrolname
const FIELDS: { key: keyof Inputs; label: RegExp }[] = [
  { key: 'weightKg', label: /^peso/i },
  { key: 'bodyFatPercentage', label: /gordura corporal/i },
  { key: 'skeletalMusclePercentage', label: /músculo|musculo/i },
  { key: 'restingMetabolismKcal', label: /metabolismo/i },
  { key: 'bodyAge', label: /idade (corporal|biológica)/i },
  { key: 'visceralFatLevel', label: /visceral/i },
  { key: 'neckCm', label: /pescoço|pescoco/i },
  { key: 'shoulderCm', label: /ombros?/i },
  { key: 'chestCm', label: /^t[óo]rax/i },
  { key: 'waistCm', label: /^cintura/i },
  { key: 'abdomenCm', label: /^abd[ôo]men/i },
  { key: 'hipCm', label: /^quadril/i },
  { key: 'rightArmRelaxedCm', label: /braço relaxado[^]*(direit|\bD\b)/i },
  { key: 'rightArmFlexedCm', label: /braço contraído[^]*(direit|\bD\b)/i },
  { key: 'rightThighProximalCm', label: /coxa proximal[^]*(direit|\bD\b)/i },
  { key: 'rightCalfCm', label: /^panturrilha[^]*(direit|\bD\b)/i },
  // dobras: rótulos "1 · Tríceps (mm)" … "7 · Coxa (mm)"
  { key: 'tricepsMm', label: /tríceps|triceps/i },
  { key: 'subscapularMm', label: /subescapular/i },
  { key: 'chestMm', label: /peitoral/i },
  { key: 'midaxillaryMm', label: /axilar/i },
  { key: 'suprailiacMm', label: /supra/i },
  { key: 'abdominalMm', label: /abdominal/i },
  { key: 'midThighMm', label: /(\d\s*·\s*)?coxa( média| media)?\s*\(mm\)|^coxa média/i },
];

async function fillAssessment(page: Page, inputs: Inputs, date: string) {
  const dateField = field(page, /data (da )?(medição|medicao|avaliação)/i, 'date');
  await revealField(page, dateField);
  await dateField.fill(date);
  for (const f of FIELDS) {
    await fillField(page, f.label, f.key, inputs[f.key]);
  }
}

async function submitAssessment(page: Page) {
  const save = page.getByRole('button', { name: /salvar avaliação|concluir avaliação|salvar alterações/i }).first();
  await revealField(page, save);
  await save.click();
  // Modal "campos faltando" não deve aparecer
  const modal = page.getByText(/campos? (faltando|precisam de atenção)|revise os campos/i);
  await expect(modal, 'o formulário apontou campos faltando').toHaveCount(0);
  await expectToast(page, /avaliação (salva|atualizada)/i, 20_000);
}

test.describe.serial('Avaliação física', () => {
  let api: Api;
  let studentId: string;

  test.beforeAll(async () => {
    api = await Api.login();
    studentId = readState().studentId ?? (await api.ensureQaStudent()).id;
    writeState({ studentId });
  });

  test('conversão automática cm → mm nas dobras (1.6 → 16) com aviso', async ({ page }) => {
    await page.goto(`/app/alunos/${studentId}/avaliacoes/nova`);
    const triceps = field(page, /tríceps|triceps/i, 'tricepsMm');
    await revealField(page, triceps);
    await triceps.fill('1.6');
    await triceps.blur();
    await expect(triceps).toHaveValue(/^16([.,]0)?$/);
    await expectToast(page, /16\s?mm/i);
  });

  test('nova avaliação com entradas conhecidas → relatório com IMC 19,2 · Σ7 148 · RCQ 0,72 · Normal', async ({ page }) => {
    const date1 = daysAgo(30);
    await page.goto(`/app/alunos/${studentId}/avaliacoes/nova`);
    await fillAssessment(page, ASSESSMENT_1, date1);
    await submitAssessment(page);

    const detail = await api.getStudent(studentId);
    const a1 = detail.avaliacoes.find(a => a.date === date1);
    expect(a1, 'avaliação não encontrada via API').toBeTruthy();
    writeState({ assessment1Id: a1!.id });

    await page.goto(`/app/alunos/${studentId}/avaliacoes/${a1!.id}`);
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible();

    expect(await rowText(page, /^IMC\b/i)).toMatch(/\b19[.,]2\b/);
    expect(await rowText(page, /somat[óo]rio( das| de)? 7 dobras/i)).toMatch(/\b148([.,]0)?\b/);
    expect(await rowText(page, /^RCQ\b/i)).toMatch(/\b0[.,]72\b/);
    expect(await rowText(page, /^cintura/i)).toMatch(/\b64([.,]0)?\b/);

    const body = (await page.locator('body').innerText()).replace(/\s+/g, ' ');
    expect(body, 'classificação da gordura (bioimp.) deve ser Normal').toMatch(/gordura[^|]{0,120}?\bnormal\b/i);
    expect(body, 'gordura visceral deve ser Normal').toMatch(/visceral[^|]{0,120}?\bnormal\b/i);
    expect(body).not.toMatch(/muito alto/i);
  });

  test('editar a avaliação (cintura 63) atualiza o relatório', async ({ page }) => {
    const { assessment1Id } = readState();
    expect(assessment1Id).toBeTruthy();

    await page.goto(`/app/alunos/${studentId}/avaliacoes/${assessment1Id}`);
    await action(page, /^editar$/i).click();
    await expect(page).toHaveURL(/\/editar$/);
    // espera o prefill da avaliação antes de alterar
    await expect(field(page, /^peso/i, 'weightKg')).toHaveValue(/\d/);

    await fillField(page, /^cintura/i, 'waistCm', '63');
    await submitAssessment(page);

    await page.goto(`/app/alunos/${studentId}/avaliacoes/${assessment1Id}`);
    expect(await rowText(page, /^cintura/i)).toMatch(/\b63([.,]0)?\b/);
    expect(await rowText(page, /^RCQ\b/i)).toMatch(/\b0[.,]71\b/);
  });

  test('segunda avaliação (hoje) compara com a anterior', async ({ page }) => {
    const today = ymd();
    await page.goto(`/app/alunos/${studentId}/avaliacoes/nova`);
    await fillAssessment(page, { ...ASSESSMENT_1, weightKg: '49.0', waistCm: '64' }, today);
    await submitAssessment(page);

    const detail = await api.getStudent(studentId);
    const a2 = detail.avaliacoes.find(a => a.date === today);
    expect(a2).toBeTruthy();
    writeState({ assessment2Id: a2!.id });

    await page.goto(`/app/alunos/${studentId}/avaliacoes/${a2!.id}`);
    const cintura = await rowText(page, /^cintura/i);
    expect(cintura, 'atual 64 e anterior 63 na mesma linha').toMatch(/\b64([.,]0)?\b/);
    expect(cintura).toMatch(/\b63([.,]0)?\b/);
    const peso = await rowText(page, /^peso\b/i);
    expect(peso).toMatch(/\b49[.,]0\b/);
    expect(peso).toMatch(/\b49[.,]2\b/);
  });
});
