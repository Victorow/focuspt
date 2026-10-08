import { test, expect } from '@playwright/test';

test.describe('Landing e acesso sem sessão', () => {
  test('GET / renderiza a landing com SEO básico', async ({ page }) => {
    const res = await page.goto('/');
    expect(res?.status()).toBe(200);

    await expect(page).toHaveTitle(/FocusPT/);
    await expect(page.locator('h1')).toHaveCount(1);
    await expect(page.locator('h1')).toBeVisible();

    await expect(page.locator('link[rel="canonical"]')).toHaveCount(1);
    await expect(page.locator('meta[property="og:title"]')).toHaveCount(1);
    await expect(page.locator('meta[property="og:description"]')).toHaveCount(1);
    await expect(page.locator('meta[name="description"]')).toHaveCount(1);

    const wa = page.locator('a[href*="wa.me/5512988443761"]');
    expect(await wa.count()).toBeGreaterThan(0);

    const entrar = page.getByRole('link', { name: /^entrar$/i }).first();
    await expect(entrar).toHaveAttribute('href', /\/app\/login$/);
  });

  test('/app/ sem sessão redireciona para /app/login', async ({ page }) => {
    await page.goto('/app/');
    await expect(page).toHaveURL(/\/app\/login$/);
    await expect(page.getByLabel(/e-?mail/i)).toBeVisible();
  });

  test('/app/alunos sem sessão também cai no login', async ({ page }) => {
    await page.goto('/app/alunos');
    await expect(page).toHaveURL(/\/app\/login$/);
  });

  test.skip('/login → /app/login (redirect 301 do Vercel)', () => {
    // Redirect definido em vercel.json ("redirects"); não existe no servidor local
    // (scripts/serve-site.mjs só replica os "rewrites"). Validar em produção.
  });
});
