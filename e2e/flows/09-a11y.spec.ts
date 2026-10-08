import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { readState } from '../helpers/state';
import { Api } from '../helpers/api';

let studentId: string;
let assessmentId: string | undefined;

test.beforeAll(async () => {
  const api = await Api.login();
  studentId = (await api.ensureQaStudent()).id; // garante ativo (restaura da lixeira se preciso)
  const st = readState();
  assessmentId = st.assessment2Id ?? st.assessment1Id ?? (await api.getStudent(studentId)).avaliacoes[0]?.id;
});

const pages: { name: string; url: () => string | null }[] = [
  { name: 'início', url: () => '/app/' },
  { name: 'alunos', url: () => '/app/alunos' },
  { name: 'perfil', url: () => `/app/alunos/${studentId}` },
  { name: 'relatório', url: () => (assessmentId ? `/app/alunos/${studentId}/avaliacoes/${assessmentId}` : null) },
];

for (const p of pages) {
  test(`acessibilidade (axe): ${p.name}`, async ({ page }) => {
    const url = p.url();
    test.skip(!url, 'sem avaliação para abrir o relatório');
    await page.goto(url!);
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
    await page.waitForLoadState('networkidle').catch(() => {});

    if (p.name === 'perfil' || p.name === 'relatório') {
      // garante que as barras de referência Omron foram renderizadas (aluno com avaliações)
      test.skip(!assessmentId, 'sem avaliação: barras de referência não renderizam');
      await expect(page.locator('.ref, [role="img"]').first()).toBeVisible();
    }

    const results = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'best-practice']).analyze();
    const fmt = (v: typeof results.violations[number]) =>
      `${v.impact}: ${v.id} — ${v.help} (${v.nodes.length} nó(s)) ${v.nodes.slice(0, 3).map(n => n.target.join(' ')).join(' | ')}`;

    const moderate = results.violations.filter(v => v.impact === 'moderate' || v.impact === 'minor');
    for (const v of moderate) {
      test.info().annotations.push({ type: 'a11y-moderate', description: fmt(v) });
      console.log(`[a11y ${p.name}] ${fmt(v)}`);
    }

    const blocking = results.violations.filter(v => v.impact === 'serious' || v.impact === 'critical');
    expect(blocking.map(fmt), 'violações sérias/críticas').toEqual([]);
  });
}
