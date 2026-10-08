import { test as setup, expect } from '@playwright/test';
import { mkdirSync } from 'node:fs';
import path from 'node:path';
import { AUTH_FILE } from '../playwright.config';
import { Api } from './helpers/api';
import { credentials } from './helpers/env';
import { clearState, qaName } from './helpers/state';

setup('login pela UI e ponto de partida limpo', async ({ page }) => {
  const { email, password } = credentials();

  // Começa sem resíduos de rodadas anteriores (alunos QA ativos, fotos, agenda).
  const api = await Api.login();
  const left = await api.purgeQaData(line => console.log(`[pré-limpeza] ${line}`));
  console.log(`[pré-limpeza] alunos QA na lixeira: ${left.trashedQa.length}`);
  clearState();
  console.log(`[setup] aluno desta rodada: ${qaName()}`);

  await page.goto('/app/login');
  await page.getByLabel(/e-?mail/i).fill(email);
  await page.getByLabel(/^senha/i).fill(password);
  await page.getByRole('button', { name: /^entrar$/i }).click();

  await expect(page).toHaveURL(/\/app\/?(\?.*)?$/, { timeout: 20_000 });
  await expect(page.getByRole('link', { name: /^início$/i })).toBeVisible();
  await expect(page.getByRole('heading', { level: 1 })).toBeVisible();

  mkdirSync(path.dirname(AUTH_FILE), { recursive: true });
  await page.context().storageState({ path: AUTH_FILE });
});
