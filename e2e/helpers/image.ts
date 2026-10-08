import { Browser } from '@playwright/test';

/** Gera um JPEG 300×450 no próprio Chromium (sem dependências nativas). */
export async function makeJpeg(browser: Browser, width = 300, height = 450): Promise<Buffer> {
  const ctx = await browser.newContext();
  const page = await ctx.newPage();
  try {
    const dataUrl = await page.evaluate(([w, h]) => {
      const c = document.createElement('canvas');
      c.width = w; c.height = h;
      const g = c.getContext('2d')!;
      const grad = g.createLinearGradient(0, 0, 0, h);
      grad.addColorStop(0, '#dbe4f0'); grad.addColorStop(1, '#5a7fb0');
      g.fillStyle = grad; g.fillRect(0, 0, w, h);
      g.fillStyle = '#1a1b1e'; g.font = 'bold 28px sans-serif';
      g.fillText('QA E2E', 90, 220);
      g.strokeStyle = '#ffffff'; g.lineWidth = 6; g.strokeRect(20, 20, w - 40, h - 40);
      return c.toDataURL('image/jpeg', 0.9);
    }, [width, height]);
    return Buffer.from(dataUrl.split(',')[1], 'base64');
  } finally {
    await ctx.close();
  }
}
