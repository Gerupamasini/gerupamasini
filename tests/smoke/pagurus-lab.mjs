#!/usr/bin/env node
// Screenshots of the ユビナガホンヤドカリ lab (hermit-lab.html) in headless Chromium (SwiftShader WebGL).
// Starts the Vite dev server itself. Usage: node tests/smoke/pagurus-lab.mjs [name=query ...]
// Output: tests/smoke/out/pagurus-*.png. Fails on any console error or page error.
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright-core';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const outDir = path.join(root, 'tests', 'smoke', 'out');
fs.mkdirSync(outDir, { recursive: true });
const PORT = 5199;
const base = `http://localhost:${PORT}/gerupamasini/hermit-lab.html`;
const DEFAULT_SHOTS = {
  'oblique-lod0': 'mode=pose&view=oblique&lod=0',
  'front-lod0': 'mode=pose&view=front&lod=0',
  'side-lod0': 'mode=pose&view=side&lod=0',
  'top-lod0': 'mode=pose&view=top&lod=0',
  'macro-lod0': 'mode=pose&view=macro&lod=0',
  'back-lod0': 'mode=pose&view=back&lod=0',
  'walk': 'mode=walk&view=oblique&lod=0&t=2.2',
  'retracted': 'mode=retract&view=front&lod=0&t=3',
  'shells': 'mode=shells&view=wide&lod=1&t=1',
  'lod1': 'mode=pose&view=oblique&lod=1',
  'lod2': 'mode=pose&view=oblique&lod=2',
  'debug': 'mode=walk&view=oblique&lod=1&t=1.5&debug=1',
};
const args = process.argv.slice(2);
const shots = args.length ? Object.fromEntries(args.map((a) => { const i = a.indexOf('='); return [a.slice(0, i), a.slice(i + 1)]; })) : DEFAULT_SHOTS;

const server = spawn('npx', ['vite', '--port', String(PORT), '--strictPort'], { cwd: root, stdio: ['ignore', 'pipe', 'pipe'] });
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
let code = 0;
try {
  for (let i = 0; i < 80; i++) { try { const r = await fetch(base); if (r.ok) break; } catch { /* retry */ } await wait(500); }
  const exe = process.env.CHROMIUM_PATH ?? ['/opt/pw-browsers/chromium-1194/chrome-linux/chrome', '/opt/pw-browsers/chromium/chrome-linux/chrome'].find((p) => fs.existsSync(p));
  const browser = await chromium.launch({ headless: true, ...(exe ? { executablePath: exe } : {}), args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--enable-webgl', '--no-sandbox'] });
  for (const [name, q] of Object.entries(shots)) {
    const page = await browser.newPage({ viewport: { width: 960, height: 640 } });
    const errors = [];
    page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`));
    page.on('console', (m) => { if (m.type() === 'error' || m.type() === 'warning') errors.push(`console: ${m.text().slice(0, 400)}`); });
    await page.goto(`${base}?${q}&shot=1`, { waitUntil: 'load' });
    await page.waitForFunction(() => window.__lab?.ready, null, { timeout: 120000 });
    await wait(300);
    const stats = await page.evaluate(() => window.__lab.stats());
    await page.screenshot({ path: path.join(outDir, `pagurus-${name}.png`) });
    console.log(`${name}: calls ${stats.calls} tris ${stats.tris}${errors.length ? '  ERRORS ' + errors.length : ''}`);
    for (const e of errors) { console.error('  ' + e); code = 1; }
    await page.close();
  }
  await browser.close();
} catch (e) {
  console.error(e);
  code = 1;
} finally {
  server.kill();
}
process.exit(code);
