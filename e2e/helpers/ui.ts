// Seletores tolerantes ao redesign: rótulo (getByLabel) com fallback no
// atributo formcontrolname, que o Angular mantém no DOM.
import { expect, Locator, Page } from '@playwright/test';

/** Campo por rótulo (acessível) ou por formcontrolname. */
export function field(page: Page, label: RegExp, control?: string): Locator {
  const byLabel = page.getByLabel(label);
  if (!control) return byLabel.first();
  return byLabel.or(page.locator(`[formcontrolname="${control}"]`)).first();
}

const NEXT_RE = /^(próximo|proximo|avançar|avancar|continuar|seguinte|revisar)/i;

/** Avança etapas do formulário até o campo ficar visível (formulário em passos ou página única). */
export async function revealField(page: Page, loc: Locator, maxSteps = 6): Promise<void> {
  // espera a tela carregar: o campo ou um botão de avançar precisa existir
  await expect(loc.or(page.getByRole('button', { name: NEXT_RE })).first()).toBeVisible();
  for (let i = 0; i < maxSteps; i++) {
    if (await loc.isVisible().catch(() => false)) return;
    const next = page.getByRole('button', { name: NEXT_RE }).first();
    if (!(await next.isVisible().catch(() => false))) break;
    await next.click();
    await page.waitForTimeout(150);
  }
  await expect(loc, `campo ${loc} não ficou visível`).toBeVisible();
}

export async function fillField(page: Page, label: RegExp, control: string | undefined, value: string): Promise<Locator> {
  const loc = field(page, label, control);
  await revealField(page, loc);
  await loc.fill(value);
  return loc;
}

/** Botão de confirmação dentro do diálogo do sistema. */
export async function confirmDialog(page: Page, name: RegExp): Promise<void> {
  const dlg = page.getByRole('dialog');
  await expect(dlg).toBeVisible();
  await dlg.getByRole('button', { name }).click();
  await expect(dlg).toBeHidden();
}

/** Aviso rápido (toast). */
export async function expectToast(page: Page, re: RegExp, timeout = 8_000): Promise<void> {
  await expect(page.getByText(re).first()).toBeVisible({ timeout });
}

/** Texto do "registro" (linha de tabela, item de lista ou bloco) que contém o rótulo. */
export async function rowText(page: Page, label: RegExp): Promise<string> {
  // 1) linha de tabela cuja primeira célula é o rótulo (relatório/perfil)
  const tr = page.locator('tr').filter({ has: page.locator('td:first-child, th:first-child').filter({ hasText: label }) }).first();
  if (await tr.count()) {
    await expect(tr).toBeVisible();
    return (await tr.innerText()).replace(/\s+/g, ' ').trim();
  }
  // 2) qualquer bloco que contenha o rótulo
  const cell = page.getByText(label).first();
  await expect(cell, `rótulo ${label} não encontrado`).toBeVisible();
  const row = cell.locator('xpath=ancestor-or-self::*[self::tr or self::li or self::dl or @role="row"][1]');
  const host = (await row.count()) ? row : cell.locator('xpath=..');
  return (await host.innerText()).replace(/\s+/g, ' ').trim();
}

/** Primeiro link/botão cujo nome casa com o padrão. */
export function action(page: Page | Locator, name: RegExp): Locator {
  const root = page as Page;
  return root.getByRole('button', { name }).or(root.getByRole('link', { name })).first();
}

/** Sem rolagem horizontal (tolerância de 1px). */
export async function expectNoHorizontalOverflow(page: Page, label: string): Promise<void> {
  await page.waitForLoadState('networkidle').catch(() => {});
  const r = await page.evaluate(() => {
    const el = document.scrollingElement ?? document.documentElement;
    return { scrollWidth: el.scrollWidth, innerWidth: window.innerWidth };
  });
  expect(r.scrollWidth, `${label}: scrollWidth ${r.scrollWidth} > innerWidth ${r.innerWidth}`).toBeLessThanOrEqual(r.innerWidth + 1);
}

/** Extrai o UUID do aluno da URL /app/alunos/:id... */
export function studentIdFromUrl(url: string): string | null {
  const m = url.match(/\/alunos\/([0-9a-f-]{36})/i);
  return m ? m[1] : null;
}

export function assessmentIdFromUrl(url: string): string | null {
  const m = url.match(/\/avaliacoes\/([0-9a-f-]{36})/i);
  return m ? m[1] : null;
}

/** Marca "Sim" para uma pergunta da anamnese (rádio, botão ou checkbox). */
export async function answerYes(page: Page, question: RegExp, control: string): Promise<void> {
  // rádio "Sim" (o <label> envolve o input visualmente oculto → clica no label)
  const yesLabel = page.locator('label').filter({ has: page.locator(`input[formcontrolname="${control}"][value="true"]`) });
  if (await yesLabel.count()) { await yesLabel.first().click(); return; }

  const q = page.getByText(question).first();
  if (await q.isVisible().catch(() => false)) {
    const group = q.locator('xpath=following::*[@role="radiogroup"][1]');
    const yes = group.locator('label', { hasText: /^\s*sim\s*$/i }).or(group.getByRole('button', { name: /^sim$/i })).first();
    if (await yes.count()) { await yes.click(); return; }
    const box = q.locator('xpath=ancestor::*[.//input][1]');
    const cb = box.getByRole('checkbox').first();
    if (await cb.count()) { await cb.check(); return; }
  }
  await page.locator(`[formcontrolname="${control}"]`).first().check();
}

/** Escolhe o sexo biológico (select, rádio em label ou botão segmentado). */
export async function chooseSex(page: Page, sex: 'Feminino' | 'Masculino'): Promise<void> {
  const value = sex === 'Feminino' ? 'FEMALE' : 'MALE';
  const sel = page.locator('select[formcontrolname="gender"]');
  if (await sel.count()) { await sel.selectOption(value); return; }
  const radioLabel = page.locator('label').filter({ has: page.locator(`input[type="radio"][value="${value}"]`) });
  if (await radioLabel.count()) { await radioLabel.first().click(); return; }
  const re = new RegExp(`^${sex}$`, 'i');
  const radio = page.getByRole('radio', { name: re });
  if (await radio.count()) { await radio.check({ force: true }); return; }
  await page.getByRole('button', { name: re }).first().click();
}
