// Copia a landing estática (site/) para dist/site/ depois do `ng build`.
// O app Angular já sai em dist/site/app/ (angular.json: outputPath.base + browser).
import { cpSync, copyFileSync, existsSync, mkdirSync } from 'node:fs';
import { resolve } from 'node:path';

const root = resolve(import.meta.dirname, '..');
const src = resolve(root, 'site');
const out = resolve(root, 'dist/site');

if (!existsSync(src)) {
  console.error('build-site: pasta site/ não encontrada');
  process.exit(1);
}
mkdirSync(out, { recursive: true });
cpSync(src, out, { recursive: true });
// Ativos da raiz do domínio (favicon, og:image, logo) vêm de public/.
for (const f of ['favicon.ico', 'favicon.svg', 'og.png', 'logo.svg', 'logo-dark.svg']) {
  const p = resolve(root, 'public', f);
  if (existsSync(p)) copyFileSync(p, resolve(out, f));
}
console.log(`build-site: site/ copiado para ${out}`);
