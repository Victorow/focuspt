import { defineConfig, devices } from '@playwright/test';
import { config as loadEnv } from 'dotenv';
import path from 'node:path';

// Credenciais da conta QA isolada (E2E_EMAIL / E2E_PASSWORD). O arquivo está no .gitignore.
loadEnv({ path: path.resolve(__dirname, '.env.e2e') });

export const BASE_URL = process.env.E2E_BASE_URL ?? 'http://localhost:4173';
export const AUTH_FILE = path.resolve(__dirname, 'e2e/test-output/.auth/user.json');

const desktopChrome = { ...devices['Desktop Chrome'], locale: 'pt-BR', timezoneId: 'America/Sao_Paulo' };

export default defineConfig({
  testDir: './e2e',
  outputDir: './e2e/test-output/results',
  globalTeardown: './e2e/global-teardown.ts',
  // Os fluxos criam e reutilizam dados reais (Supabase) em ordem: nunca em paralelo, sem retry.
  fullyParallel: false,
  workers: 1,
  retries: 0,
  forbidOnly: !!process.env.CI,
  timeout: 90_000,
  expect: { timeout: 10_000 },
  reporter: [
    ['list'],
    ['html', { open: 'never', outputFolder: 'e2e/test-output/report' }],
  ],
  use: {
    baseURL: BASE_URL,
    actionTimeout: 15_000,
    navigationTimeout: 30_000,
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    video: 'off',
  },
  webServer: {
    command: 'node scripts/serve-site.mjs 4173',
    url: `${BASE_URL}/`,
    reuseExistingServer: true,
    timeout: 30_000,
  },
  projects: [
    // Landing + redirecionamento sem sessão (sem storageState)
    { name: 'public', testMatch: /public\.spec\.ts$/, use: { ...desktopChrome } },

    // Login pela UI, grava a sessão
    { name: 'setup', testMatch: /auth\.setup\.ts$/, use: { ...desktopChrome } },

    // Fluxos de dados (ordem alfabética dos arquivos = ordem de execução)
    {
      name: 'desktop',
      testMatch: /flows\/.*\.spec\.ts$/,
      dependencies: ['setup'],
      use: { ...desktopChrome, storageState: AUTH_FILE },
    },

    // Responsivo (390×844) — usa os dados criados pelos fluxos
    {
      name: 'mobile',
      testMatch: /mobile\/.*\.spec\.ts$/,
      dependencies: ['setup'],
      use: {
        ...desktopChrome,
        storageState: AUTH_FILE,
        viewport: { width: 390, height: 844 },
        deviceScaleFactor: 3,
        isMobile: true,
        hasTouch: true,
      },
    },
  ],
});
