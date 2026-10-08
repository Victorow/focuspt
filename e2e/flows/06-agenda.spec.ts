import { test, expect, Page } from '@playwright/test';
import { ymd } from '../helpers/env';
import { qaName, readState, writeState } from '../helpers/state';
import { Api } from '../helpers/api';
import { confirmDialog, expectToast, field } from '../helpers/ui';

async function openForm(page: Page) {
  const aluno = field(page, /^aluno/i, 'aluno_id');
  if (!(await aluno.isVisible().catch(() => false))) {
    await page.getByRole('button', { name: /^agendar$|novo atendimento/i }).first().click();
  }
  await expect(aluno).toBeVisible();
}

/** Bloco (evento) da agenda que contém o nome do aluno. */
function eventOf(page: Page, name: string) {
  return page.locator('[class*="ev"], li, tr, article').filter({ hasText: name }).last();
}

test.describe.serial('Agenda', () => {
  let studentId: string;
  const api = { current: null as Api | null };

  test.beforeAll(async () => {
    api.current = await Api.login();
    studentId = readState().studentId ?? (await api.current.ensureQaStudent()).id;
    writeState({ studentId });
  });

  test('cria atendimento hoje 09:00 "Teste" e aparece na semana e no painel', async ({ page }) => {
    await page.goto('/app/agenda');
    await openForm(page);
    await field(page, /^aluno/i, 'aluno_id').selectOption({ label: qaName() });
    await field(page, /^data/i, 'date').fill(ymd());
    await field(page, /^hora|horário/i, 'time').fill('09:00');
    await field(page, /^foco/i, 'focus').fill('Teste');
    await page.locator('form').getByRole('button', { name: /^agendar$/i }).click();
    await expectToast(page, /agendad/i, 20_000);

    const ev = eventOf(page, qaName());
    await expect(ev).toBeVisible();
    await expect(ev).toContainText('09:00');
    await expect(ev).toContainText('Teste');

    const rows = await api.current!.getAgenda(ymd(), ymd());
    const mine = rows.find(r => r.aluno_id === studentId && r.time.startsWith('09:00'));
    expect(mine, 'atendimento gravado via API').toBeTruthy();
    writeState({ agendaId: mine!.id });

    await page.goto('/app/');
    const panel = page.locator('section').filter({ has: page.getByText(/^agenda de hoje$/i) }).first();
    await expect(panel).toBeVisible();
    await expect(panel.getByText(qaName()).first()).toBeVisible();
    await expect(panel.getByText('09:00')).toBeVisible();
  });

  test('edita o horário para 10:00', async ({ page }) => {
    await page.goto('/app/agenda');
    const ev = eventOf(page, qaName());
    await expect(ev).toBeVisible();
    await ev.getByRole('button', { name: /editar/i }).first().click();
    const hora = field(page, /^hora|horário/i, 'time');
    await expect(hora).toBeVisible();
    await hora.fill('10:00');
    await page.getByRole('button', { name: /^salvar( alterações)?$/i }).click();
    await expectToast(page, /atualizad/i, 20_000);
    await expect(eventOf(page, qaName())).toContainText('10:00');
    await expect(eventOf(page, qaName())).not.toContainText('09:00');
  });

  test('exclui com confirmação', async ({ page }) => {
    await page.goto('/app/agenda');
    const ev = eventOf(page, qaName());
    await expect(ev).toBeVisible();
    await ev.getByRole('button', { name: /excluir|remover/i }).first().click();
    await confirmDialog(page, /^excluir|^remover/i);
    await expectToast(page, /exclu[ií]d|removid/i, 20_000);
    await expect(page.locator('[class*="ev"], li, tr, article').filter({ hasText: qaName() })).toHaveCount(0);

    const rows = await api.current!.getAgenda(ymd(), ymd());
    expect(rows.filter(r => r.aluno_id === studentId)).toHaveLength(0);
    writeState({ agendaId: undefined });
  });
});
