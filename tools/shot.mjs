// Headless renderer: serves the repo, maps CDN three.js to node_modules, screenshots a page.
// usage: node tools/shot.mjs <page.html?query> <out.png> [width] [height] [waitMs]
import { chromium } from 'playwright-core';
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';

const root = path.resolve(new URL('..', import.meta.url).pathname);
const [,, page = 'index.html', out = 'shot.png', w = '1280', h = '720', wait = '4000'] = process.argv;
const types = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.png': 'image/png', '.json': 'application/json' };
const server = http.createServer((req, res) => {
  const p = path.join(root, decodeURIComponent(req.url.split('?')[0]));
  fs.readFile(p, (err, data) => {
    if (err) { res.writeHead(404); res.end(); return; }
    res.writeHead(200, { 'content-type': types[path.extname(p)] || 'application/octet-stream' });
    res.end(data);
  });
}).listen(0);
const port = server.address().port;
const browser = await chromium.launch({
  executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome',
  args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'],
});
const pg = await browser.newPage({ viewport: { width: +w, height: +h } });
pg.on('console', m => console.log('[page]', m.text()));
pg.on('pageerror', e => console.log('[error]', e.message));
await pg.route(/cdn\.jsdelivr\.net\/npm\/three@[^/]+\/(.*)$/, async route => {
  const rel = route.request().url().replace(/^.*three@[^/]+\//, '');
  const f = path.join(root, 'node_modules/three', rel);
  route.fulfill({ path: f, contentType: 'text/javascript' });
});
await pg.goto(`http://localhost:${port}/${page}`);
await pg.waitForFunction(() => window.__ready === true, null, { timeout: 120000 }).catch(() => console.log('ready timeout'));
await pg.waitForTimeout(+wait);
await pg.screenshot({ path: out });
await browser.close();
server.close();
