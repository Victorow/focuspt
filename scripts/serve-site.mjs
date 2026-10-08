// Servidor estático para os testes E2E: imita o Vercel em produção.
//   /            -> dist/site/index.html (landing)
//   /app/*       -> arquivo se existir; senão (rota do Angular) dist/site/app/index.html
//   demais       -> arquivo em dist/site ou 404
// Uso: node scripts/serve-site.mjs [porta]   (padrão 4173)
import { createServer } from 'node:http';
import { createReadStream, existsSync, statSync } from 'node:fs';
import { extname, join, normalize, resolve, sep } from 'node:path';

const root = resolve(import.meta.dirname, '..', 'dist', 'site');
const port = Number(process.argv[2] ?? process.env.PORT ?? 4173);

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.ico': 'image/x-icon',
  '.txt': 'text/plain; charset=utf-8',
  '.xml': 'application/xml; charset=utf-8',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.map': 'application/json; charset=utf-8',
};

if (!existsSync(join(root, 'index.html')) || !existsSync(join(root, 'app', 'index.html'))) {
  console.error(`serve-site: build não encontrado em ${root}. Rode "npm run build" antes.`);
  process.exit(1);
}

function send(res, file, status = 200) {
  const type = MIME[extname(file).toLowerCase()] ?? 'application/octet-stream';
  res.writeHead(status, { 'Content-Type': type, 'Cache-Control': 'no-store' });
  createReadStream(file).pipe(res);
}

function safeJoin(urlPath) {
  const decoded = decodeURIComponent(urlPath.split('?')[0]);
  const full = normalize(join(root, decoded));
  // impede sair de dist/site
  if (!full.startsWith(root + sep) && full !== root) return null;
  return full;
}

const server = createServer((req, res) => {
  const url = req.url ?? '/';
  const path = url.split('?')[0];

  if (path === '/' || path === '/index.html') return send(res, join(root, 'index.html'));

  const file = safeJoin(path);
  if (!file) { res.writeHead(400); return res.end('bad path'); }

  if (existsSync(file) && statSync(file).isFile()) return send(res, file);

  // rewrite do Vercel: /app e /app/(.*) -> /app/index.html (apenas rotas sem extensão)
  if (path === '/app' || path.startsWith('/app/')) {
    const hasExt = extname(path) !== '';
    if (!hasExt) return send(res, join(root, 'app', 'index.html'));
  }

  res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
  res.end('404');
});

server.listen(port, '127.0.0.1', () => {
  console.log(`serve-site: http://localhost:${port}  (raiz ${root})`);
});
