// Usage: node harness.mjs pages/<name>.html
// Serves the r186.1 package at /three/ and ./pages at /, loads the page in headless Chromium (SwiftShader WebGL2),
// waits for window.__done === true, prints window.__result (JSON) and console output.
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import chromium from '@sparticuz/chromium';
import puppeteer from 'puppeteer-core';

const THREE_ROOT = '/tmp/claude-0/-home-user-gerupamasini/4b9c0ed7-76e4-51ce-9eeb-e88fc91d17f5/scratchpad/three/three-0.186.1/package';
const PAGES = path.resolve('pages');
const mime = { '.js': 'text/javascript', '.mjs': 'text/javascript', '.html': 'text/html', '.wasm': 'application/wasm', '.json': 'application/json' };
const server = http.createServer((req, res) => {
  const u = decodeURIComponent(req.url.split('?')[0]);
  const base = u.startsWith('/three/') ? THREE_ROOT : PAGES;
  const rel = u.startsWith('/three/') ? u.slice('/three/'.length) : u.slice(1);
  const f = path.join(base, rel);
  if (!f.startsWith(base) || !fs.existsSync(f) || fs.statSync(f).isDirectory()) { res.writeHead(404); res.end('nf'); return; }
  res.writeHead(200, { 'content-type': mime[path.extname(f)] || 'application/octet-stream' });
  fs.createReadStream(f).pipe(res);
});
await new Promise(r => server.listen(0, '127.0.0.1', r));
const port = server.address().port;
const exe = await chromium.executablePath();
const browser = await puppeteer.launch({ executablePath: exe, headless: 'shell', args: [...chromium.args, '--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const page = await browser.newPage();
const logs = [];
page.on('console', m => logs.push(`[${m.type()}] ${m.text()}`));
page.on('pageerror', e => logs.push(`[pageerror] ${e.message}`));
await page.goto(`http://127.0.0.1:${port}/${process.argv[2].replace(/^pages\//, '')}`);
try { await page.waitForFunction('window.__done === true', { timeout: 90000 }); } catch (e) { logs.push('[harness] timeout waiting for __done'); }
const result = await page.evaluate(() => window.__result);
console.log('RESULT ' + JSON.stringify(result, null, 2));
console.log('--- console ---\n' + logs.join('\n'));
await browser.close(); server.close();
